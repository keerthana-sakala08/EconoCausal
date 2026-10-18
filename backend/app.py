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

        if df.empty:
            return jsonify({
                "error": "The CSV file has no data rows."
            }), 400

        # Column profile
        columns = []

        for name in df.columns:
            columns.append({
                "name": str(name),
                "dtype": str(df[name].dtype),
                "missing": int(df[name].isna().sum())
            })

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


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )
