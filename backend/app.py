from io import BytesIO, StringIO
import json
import math

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import KFold

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit


def read_uploaded_csv(require_file=True):
    """Read a CSV upload and return (DataFrame, error, status_code)."""
    uploaded = request.files.get("file")
    if uploaded is None or uploaded.filename == "":
        if require_file:
            return None, "Please choose a CSV file.", 400
        return None, "Please choose a CSV file.", 400
    if not uploaded.filename.lower().endswith(".csv"):
        return None, "Only CSV files are supported.", 400
    try:
        df = pd.read_csv(BytesIO(uploaded.read()))
    except pd.errors.EmptyDataError:
        return None, "The CSV file is empty or has no header row.", 400
    except UnicodeDecodeError:
        return None, "The CSV file must use a supported text encoding such as UTF-8.", 400
    except Exception as exc:
        return None, f"Could not read CSV: {str(exc)}", 400
    if len(df.columns) == 0:
        return None, "The CSV file has no columns.", 400
    if df.empty:
        return None, "The CSV file has no data rows.", 400
    return df, None, None


def dataset_validation(df):
    """Return a simple validation report with errors and warnings."""
    errors = []
    warnings = []
    row_count = int(len(df))
    column_count = int(len(df.columns))
    missing_values = int(df.isna().sum().sum())
    duplicate_rows = int(df.duplicated().sum())
    complete_rows = int(df.notna().all(axis=1).sum())

    if row_count == 0:
        errors.append("The dataset has no data rows.")
    if column_count == 0:
        errors.append("The dataset has no columns.")

    blank_names = [str(c) for c in df.columns if str(c).strip() == ""]
    if blank_names:
        errors.append("One or more column names are blank.")
    duplicated_names = [str(c) for c in df.columns[df.columns.duplicated()].tolist()]
    if duplicated_names:
        errors.append("Duplicate column names were detected: " + ", ".join(duplicated_names))

    if missing_values:
        warnings.append(f"{missing_values} missing cell(s) were found. Review missing values before analysis.")
    if duplicate_rows:
        warnings.append(f"{duplicate_rows} duplicate row(s) were found.")
    if row_count < 6:
        warnings.append("Fewer than 6 rows are available; statistical estimates may be unstable.")
    if not len(df.select_dtypes(include="number").columns):
        warnings.append("No numeric columns were detected. Numeric summaries and DML need numeric variables.")

    quality = {
        "row_count": row_count,
        "column_count": column_count,
        "missing_values": missing_values,
        "duplicate_rows": duplicate_rows,
        "complete_rows": complete_rows,
        "missing_percentage": round((missing_values / (df.size or 1)) * 100, 2),
    }
    return {
        "status": "failed" if errors else ("warning" if warnings else "passed"),
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "quality": quality,
    }


def safe_number(value):
    """Convert numpy/pandas numeric values to JSON-safe finite floats."""
    value = float(value)
    return round(value, 4) if math.isfinite(value) else None


@app.get("/")
def root():
    return jsonify({"service": "EconoCausal API", "status": "ok", "docs": [
        "/api/health", "/api/analyze", "/api/validate", "/api/validation-report", "/api/dml"
    ]})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "EconoCausal API"})


@app.post("/api/analyze")
def analyze_csv():
    df, error, status = read_uploaded_csv()
    if error:
        return jsonify({"error": error}), status

    try:
        validation = dataset_validation(df)
        columns = [{
            "name": str(name),
            "dtype": str(df[name].dtype),
            "missing": int(df[name].isna().sum()),
        } for name in df.columns]

        numeric = df.select_dtypes(include="number")
        numeric_summary = {}
        for name in numeric.columns:
            series = pd.to_numeric(numeric[name], errors="coerce").dropna()
            numeric_summary[str(name)] = {
                "mean": safe_number(series.mean()) if not series.empty else 0,
                "min": safe_number(series.min()) if not series.empty else 0,
                "max": safe_number(series.max()) if not series.empty else 0,
                "std": safe_number(series.std()) if len(series) > 1 else 0,
            }

        overview_chart = [
            {"name": name, "mean": summary["mean"]}
            for name, summary in numeric_summary.items()
        ]

        normalized_names = {str(name).strip().lower(): name for name in numeric.columns}
        sales_column = next((original for normalized, original in normalized_names.items()
                             if normalized in {"sales", "sale", "revenue"}), None)
        relationship_charts = []
        if sales_column is not None:
            for feature in numeric.columns:
                if feature == sales_column:
                    continue
                chart_rows = df[[feature, sales_column]].copy()
                chart_rows[feature] = pd.to_numeric(chart_rows[feature], errors="coerce")
                chart_rows[sales_column] = pd.to_numeric(chart_rows[sales_column], errors="coerce")
                chart_rows = chart_rows.replace([np.inf, -np.inf], np.nan).dropna()
                if len(chart_rows) > 200:
                    chart_rows = chart_rows.sample(n=200, random_state=42)
                chart_rows = chart_rows.sort_values(by=feature)
                relationship_charts.append({
                    "x_column": str(feature),
                    "y_column": str(sales_column),
                    "data": [{"x": safe_number(x), "y": safe_number(y)}
                             for x, y in zip(chart_rows[feature], chart_rows[sales_column])],
                })

        preview_df = df.head(10).astype(object).where(pd.notna(df.head(10)), None)
        preview = preview_df.to_dict(orient="records")
        # Ensure preview values are serializable for common CSV types.
        for row in preview:
            for key, value in row.items():
                if isinstance(value, (np.integer,)):
                    row[key] = int(value)
                elif isinstance(value, (np.floating,)):
                    row[key] = safe_number(value)
                elif pd.isna(value):
                    row[key] = None
                elif not isinstance(value, (str, int, float, bool, type(None))):
                    row[key] = str(value)

        return jsonify({
            "filename": request.files["file"].filename,
            "rows": int(len(df)),
            "columns_count": int(len(df.columns)),
            "columns": columns,
            "numeric_summary": numeric_summary,
            "overview_chart": overview_chart,
            "relationship_charts": relationship_charts,
            "preview": preview,
            "quality": validation["quality"],
            "validation": validation,
        })
    except Exception as exc:
        app.logger.exception("CSV analysis failed")
        return jsonify({"error": f"Could not analyze CSV: {str(exc)}"}), 400


@app.post("/api/validate")
def validate_csv():
    """Day 11–13: run dataset checks and return errors, warnings, and counts."""
    df, error, status = read_uploaded_csv()
    if error:
        return jsonify({"error": error}), status
    report = dataset_validation(df)
    report["filename"] = request.files["file"].filename
    return jsonify(report), (200 if report["is_valid"] else 422)


@app.post("/api/validation-report")
def download_validation_report():
    """Day 13: create a downloadable CSV report of validation checks."""
    df, error, status = read_uploaded_csv()
    if error:
        return jsonify({"error": error}), status
    report = dataset_validation(df)
    records = []
    for issue in report["errors"]:
        records.append({"severity": "error", "message": issue})
    for issue in report["warnings"]:
        records.append({"severity": "warning", "message": issue})
    if not records:
        records.append({"severity": "info", "message": "All dataset validation checks passed."})
    output = StringIO()
    pd.DataFrame(records, columns=["severity", "message"]).to_csv(output, index=False)
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=econocausal_validation_report.csv"},
    )


@app.post("/api/dml")
def run_dml():
    """Run a cross-fitted partialling-out DML estimate on selected CSV columns."""
    uploaded = request.files.get("file")
    if uploaded is None or uploaded.filename == "":
        return jsonify({"error": "Please upload a CSV file."}), 400
    if not uploaded.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 400

    try:
        treatment = request.form.get("treatment", "").strip()
        outcome = request.form.get("outcome", "").strip()
        raw_controls = request.form.get("controls", "[]")
        controls = json.loads(raw_controls)
        if not isinstance(controls, list) or not all(isinstance(c, str) for c in controls):
            return jsonify({"error": "Controls must be a JSON list of column names."}), 400
        controls = [c.strip() for c in controls if c.strip()]

        if not treatment or not outcome or treatment == outcome:
            return jsonify({"error": "Choose different treatment and outcome columns."}), 400
        if not controls:
            return jsonify({"error": "Select at least one control variable."}), 400
        if treatment in controls or outcome in controls:
            return jsonify({"error": "Treatment and outcome cannot also be controls."}), 400
        if len(set(controls)) != len(controls):
            return jsonify({"error": "Remove duplicate control variables."}), 400

        df = pd.read_csv(BytesIO(uploaded.read()))
        if df.empty or len(df.columns) == 0:
            return jsonify({"error": "The CSV file has no usable data."}), 422

        validation = dataset_validation(df)
        # Day 13 rule: block DML only on validation errors; warnings are allowed.
        if validation["errors"]:
            return jsonify({
                "error": "DML was blocked because dataset validation found errors.",
                "validation": validation,
            }), 422

        required = [treatment, outcome] + controls
        missing_columns = [name for name in required if name not in df.columns]
        if missing_columns:
            return jsonify({"error": f"Columns not found: {missing_columns}"}), 400

        data = df[required].apply(pd.to_numeric, errors="coerce")
        data = data.replace([np.inf, -np.inf], np.nan).dropna()
        if len(data) < 6:
            return jsonify({
                "error": "At least 6 complete numeric rows are required for DML.",
                "validation": validation,
                "rows_used": int(len(data)),
            }), 422
        if data[treatment].nunique() < 2:
            return jsonify({"error": "Treatment must contain at least two different values."}), 422
        if data[outcome].nunique() < 2:
            return jsonify({"error": "Outcome must contain at least two different values."}), 422
        if any(data[column].nunique() < 2 for column in controls):
            return jsonify({"error": "Each control variable must contain at least two different values."}), 422

        T = data[treatment].to_numpy(dtype=float)
        Y = data[outcome].to_numpy(dtype=float)
        X = data[controls].to_numpy(dtype=float)
        # Two folds is deliberately retained for compatibility with the tiny sample dataset.
        folds = KFold(n_splits=2, shuffle=True, random_state=42)
        t_residual = np.zeros(len(data), dtype=float)
        y_residual = np.zeros(len(data), dtype=float)
        for train_idx, test_idx in folds.split(X):
            model_t = LinearRegression()
            model_y = LinearRegression()
            model_t.fit(X[train_idx], T[train_idx])
            model_y.fit(X[train_idx], Y[train_idx])
            t_residual[test_idx] = T[test_idx] - model_t.predict(X[test_idx])
            y_residual[test_idx] = Y[test_idx] - model_y.predict(X[test_idx])

        denominator = float(np.dot(t_residual, t_residual))
        if denominator < 1e-10:
            return jsonify({
                "error": "Treatment has too little variation after controlling for the selected variables.",
                "validation": validation,
            }), 422
        effect = float(np.dot(t_residual, y_residual) / denominator)
        return jsonify({
            "method": "Cross-fitted partialling-out DML",
            "treatment": treatment,
            "outcome": outcome,
            "controls": controls,
            "rows_used": int(len(data)),
            "estimated_effect": round(effect, 6),
            "validation_status": validation["status"],
            "validation_warnings": validation["warnings"],
            "note": (
                "Exploratory demonstration only. This estimate is not proof of causality. "
                "Results depend on data quality, model assumptions, and unmeasured confounding."
            ),
        })
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        return jsonify({"error": f"Invalid input: {str(exc)}"}), 400
    except pd.errors.EmptyDataError:
        return jsonify({"error": "The CSV file is empty or invalid."}), 400
    except Exception as exc:
        app.logger.exception("DML analysis failed")
        return jsonify({"error": f"DML analysis failed: {str(exc)}"}), 400


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"error": "File is too large. Maximum upload size is 16 MB."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
