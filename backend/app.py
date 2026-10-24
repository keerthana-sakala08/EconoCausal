from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from io import BytesIO

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "EconoCausal API"
    })


@app.post("/api/analyze")
def analyze_csv():
    uploaded = request.files.get("file")

    if uploaded is None or uploaded.filename == "":
        return jsonify({"error": "Please choose a CSV file."}), 400

    if not uploaded.filename.lower().endswith(".csv"):
        return jsonify({
            "error": "Only CSV files are supported."
        }), 400

    try:
        df = pd.read_csv(BytesIO(uploaded.read()))

        # Dataset quality overview
        row_count = int(len(df))
        column_count = int(len(df.columns))
        missing_values = int(df.isna().sum().sum())
        duplicate_rows = int(df.duplicated().sum())
        complete_rows = int(df.notna().all(axis=1).sum())

        quality = {
            "row_count": row_count,
            "column_count": column_count,
            "missing_values": missing_values,
            "duplicate_rows": duplicate_rows,
            "complete_rows": complete_rows,
            "missing_percentage": round(
                (missing_values / df.size) * 100, 2
            ) if df.size else 0
        }

        if df.empty:
            return jsonify({
                "error": "The CSV file has no data rows."
            }), 400


        # Numeric summaries
        numeric = df.select_dtypes(include="number")
        numeric_summary = {}

        for name in numeric.columns:
            series = numeric[name].dropna()

            numeric_summary[str(name)] = {
                "mean": round(float(series.mean()), 4)
                if not series.empty else 0,
                "min": round(float(series.min()), 4)
                if not series.empty else 0,
                "max": round(float(series.max()), 4)
                if not series.empty else 0,
                "std": round(float(series.std()), 4)
                if len(series) > 1 else 0
            }

        # Graph 1: mean of each numeric column
        overview_chart = [
            {
                "name": name,
                "mean": summary["mean"]
            }
            for name, summary in numeric_summary.items()
        ]

        # Graph 2: relationship between numeric columns
        # Use sales as the outcome when that column exists.
        lower_names = {
            str(name).strip().lower(): name
            for name in numeric.columns
        }

        sales_column = next(
            (
                original_name
                for normalized, original_name in lower_names.items()
                if normalized in ["sales", "sale", "revenue"]
            ),
            None
        )

        relationship_charts = []

        if sales_column is not None:
            for feature in numeric.columns:
                if feature == sales_column:
                    continue

                chart_rows = df[[feature, sales_column]].dropna()

                # Limit chart payload size for large datasets.
                if len(chart_rows) > 200:
                    chart_rows = chart_rows.sample(
                        n=200, random_state=42
                    )

                chart_rows = chart_rows.sort_values(by=feature)

                relationship_charts.append({
                    "x_column": str(feature),
                    "y_column": str(sales_column),
                    "data": [
                        {
                            "x": round(float(x), 4),
                            "y": round(float(y), 4)
                        }
                        for x, y in zip(
                            chart_rows[feature],
                            chart_rows[sales_column]
                        )
                    ]
                })

        # Graph 3: sample rows from the uploaded dataset
        preview = df.head(10).where(
            pd.notna(df.head(10)), None
        ).to_dict(orient="records")

        return jsonify({
            "filename": uploaded.filename,
            "rows": int(len(df)),
            "columns": columns,
            "numeric_summary": numeric_summary,
            "overview_chart": overview_chart,
            "relationship_charts": relationship_charts,
            "preview": preview
        })

    except pd.errors.EmptyDataError:
        return jsonify({
            "error": "The CSV file is empty."
        }), 400

    except Exception as exc:
        return jsonify({
            "error": f"Could not analyze CSV: {str(exc)}"
        }), 400

@app.post("/api/dml")
def run_dml():
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import KFold
    import numpy as np
    import json

    uploaded = request.files.get("file")

    if uploaded is None or uploaded.filename == "":
        return jsonify({"error": "Please upload a CSV file."}), 400

    try:
        treatment = request.form.get("treatment", "").strip()
        outcome = request.form.get("outcome", "").strip()
        controls = json.loads(request.form.get("controls", "[]"))

        if not isinstance(controls, list):
            return jsonify({"error": "Controls must be a list."}), 400

        if not treatment or not outcome or treatment == outcome:
            return jsonify({
                "error": "Choose different treatment and outcome columns."
            }), 400

        if not controls:
            return jsonify({
                "error": "Select at least one control variable."
            }), 400

        if treatment in controls or outcome in controls:
            return jsonify({
                "error": "Treatment and outcome cannot also be controls."
            }), 400

        df = pd.read_csv(BytesIO(uploaded.read()))

        required = [treatment, outcome] + controls
        missing_columns = [c for c in required if c not in df.columns]

        if missing_columns:
            return jsonify({
                "error": f"Columns not found: {missing_columns}"
            }), 400

        data = df[required].apply(pd.to_numeric, errors="coerce")
        data = data.replace([np.inf, -np.inf], np.nan).dropna()

        if len(data) < 6:
            return jsonify({
                "error": "At least 6 complete numeric rows are required."
            }), 400

        if data[treatment].nunique() < 2:
            return jsonify({
                "error": "Treatment must contain at least two different values."
            }), 400

        T = data[treatment].to_numpy(dtype=float)
        Y = data[outcome].to_numpy(dtype=float)
        X = data[controls].to_numpy(dtype=float)

        t_residual = np.zeros(len(data))
        y_residual = np.zeros(len(data))

        folds = KFold(n_splits=2, shuffle=True, random_state=42)

        for train_idx, test_idx in folds.split(X):
            model_t = LinearRegression()
            model_y = LinearRegression()

            model_t.fit(X[train_idx], T[train_idx])
            model_y.fit(X[train_idx], Y[train_idx])

            t_residual[test_idx] = (
                T[test_idx] - model_t.predict(X[test_idx])
            )
            y_residual[test_idx] = (
                Y[test_idx] - model_y.predict(X[test_idx])
            )

        denominator = float(np.dot(t_residual, t_residual))

        if denominator < 1e-10:
            return jsonify({
                "error": "Treatment has too little variation after controlling for the selected variables."
            }), 400

        effect = float(
            np.dot(t_residual, y_residual) / denominator
        )

        return jsonify({
            "method": "Cross-fitted partialling-out DML",
            "treatment": treatment,
            "outcome": outcome,
            "controls": controls,
            "rows_used": int(len(data)),
            "estimated_effect": round(effect, 6),
            "note": (
                "Exploratory demonstration only. This estimate is not "
                "proof of causality. Results depend on data quality, "
                "model assumptions, and confounding."
            )
        })

    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        return jsonify({"error": f"Invalid input: {str(exc)}"}), 400
    except Exception as exc:
        return jsonify({"error": f"DML analysis failed: {str(exc)}"}), 400


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
