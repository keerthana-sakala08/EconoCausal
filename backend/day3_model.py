import pandas as pd
from pathlib import Path
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score

# Locate the project dataset
PROJECT_DIR = Path(__file__).resolve().parent.parent
CLEAN_FILE = PROJECT_DIR / "sample_data" / "cleaned_sales_data.csv"
RAW_FILE = PROJECT_DIR / "sample_data" / "sales_data.csv"

DATA_FILE = CLEAN_FILE if CLEAN_FILE.exists() else RAW_FILE


def main():
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            "Dataset not found. Run backend/data_analysis.py first."
        )

    # Load dataset
    df = pd.read_csv(DATA_FILE)
    df.columns = df.columns.str.strip()

    # Validate required columns
    required = ["discount", "advertising", "sales"]
    missing = [column for column in required if column not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Convert columns to numeric and remove invalid rows
    df = df[required].apply(pd.to_numeric, errors="coerce")
    df = df.dropna()

    if len(df) < 3:
        raise ValueError("At least 3 valid rows are needed for this demo.")

    if df["sales"].nunique() < 2:
        raise ValueError("Sales must contain at least two different values.")

    # Features and target
    X = df[["discount", "advertising"]]
    y = df["sales"]

    # Fit baseline linear regression
    model = LinearRegression()
    model.fit(X, y)

    # In-sample predictions: demonstration only
    predictions = model.predict(X)

    print("\n===== ECONOCAUSAL DAY 3 =====")
    print("Dataset:", DATA_FILE.name)
    print("Rows used:", len(df))
    print("Model: Linear Regression")
    print("Features: discount, advertising")
    print("Target: sales")

    print("\nModel coefficients:")
    for feature, coefficient in zip(X.columns, model.coef_):
        print(f"{feature}: {coefficient:.3f}")

    print(f"\nIntercept: {model.intercept_:.3f}")
    print(
        "Mean Absolute Error (in-sample): "
        f"{mean_absolute_error(y, predictions):.3f}"
    )
    print(f"R-squared (in-sample): {r2_score(y, predictions):.3f}")

    # Save predictions for later evaluation
    results = df.copy()
    results["predicted_sales"] = predictions.round(2)

    output_dir = PROJECT_DIR / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_file = output_dir / "day3_predictions.csv"
    results.to_csv(output_file, index=False)

    print("\nExample predictions:")
    print(results.head().to_string(index=False))
    print(f"\nPredictions saved to: {output_file}")
    print("\n baseline model completed!")
    print("Note: This is a predictive baseline, not a causal estimate.")


if __name__ == "__main__":
    main()
 
