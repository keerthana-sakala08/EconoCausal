
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import KFold

# ==========================================
# ECONOCAUSAL - DAY 4
# Double Machine Learning Demonstration
# ==========================================

PROJECT_DIR = Path(__file__).resolve().parent.parent
CLEAN_FILE = PROJECT_DIR / "sample_data" / "cleaned_sales_data.csv"
RAW_FILE = PROJECT_DIR / "sample_data" / "sales_data.csv"


def main():
    data_file = CLEAN_FILE if CLEAN_FILE.exists() else RAW_FILE

    if not data_file.exists():
        raise FileNotFoundError(
            "Dataset not found. Run backend/data_analysis.py first."
        )

    df = pd.read_csv(data_file)
    df.columns = df.columns.str.strip()

    required = ["discount", "advertising", "sales"]
    missing = [column for column in required if column not in df.columns]

    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Keep required columns and convert them to numeric values
    df = df[required].apply(pd.to_numeric, errors="coerce")
    df = df.replace([np.inf, -np.inf], np.nan).dropna()

    if len(df) < 6:
        raise ValueError(
            "At least 6 valid rows are required for this demonstration."
        )

    if df["discount"].nunique() < 2:
        raise ValueError("Discount must have at least two different values.")

    if df["advertising"].nunique() < 2:
        raise ValueError(
            "Advertising must vary to demonstrate adjustment for a control."
        )

    treatment = df["discount"].to_numpy(dtype=float)
    outcome = df["sales"].to_numpy(dtype=float)
    controls = df[["advertising"]].to_numpy(dtype=float)

    # Cross-fitted nuisance predictions
    n_splits = min(5, len(df))
    cv = KFold(n_splits=n_splits, shuffle=True, random_state=42)

    predicted_treatment = np.zeros(len(df))
    predicted_outcome = np.zeros(len(df))

    for train_idx, test_idx in cv.split(controls):
        treatment_model = RandomForestRegressor(
            n_estimators=100,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )

        outcome_model = RandomForestRegressor(
            n_estimators=100,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )

        treatment_model.fit(controls[train_idx], treatment[train_idx])
        outcome_model.fit(controls[train_idx], outcome[train_idx])

        predicted_treatment[test_idx] = treatment_model.predict(
            controls[test_idx]
        )
        predicted_outcome[test_idx] = outcome_model.predict(
            controls[test_idx]
        )

    # Residualize treatment and outcome
    treatment_residual = treatment - predicted_treatment
    outcome_residual = outcome - predicted_outcome

    denominator = np.sum(treatment_residual ** 2)

    if denominator < 1e-10:
        raise ValueError(
            "Insufficient discount variation after modeling the controls."
        )

    estimated_effect = np.sum(
        treatment_residual * outcome_residual
    ) / denominator

    print("\n===== ECONOCAUSAL DAY 4: DML =====")
    print("Dataset:", data_file.name)
    print("Rows used:", len(df))
    print("Treatment: discount")
    print("Outcome: sales")
    print("Control: advertising")
    print("Method: Cross-fitted partialling-out estimator")

    print(f"\nEstimated effect per discount unit: {estimated_effect:.4f}")

    print("\nInterpretation:")
    print(
        "The estimate describes the modeled change in sales associated "
        "with a one-unit increase in discount, after residualizing "
        "discount and sales against advertising."
    )

    print("\nLimitations:")
    print("- Only a small sample is available.")
    print("- The estimate may be unstable and should be treated as exploratory.")
    print("- Causal interpretation requires appropriate confounder control,")
    print("  sufficient data, and valid identification assumptions.")
    print("- This estimate is not an individualized discount recommendation.")

    print("\nDay 4 DML demonstration completed!")


if __name__ == "__main__":
    main()
