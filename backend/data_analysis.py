
import pandas as pd
import numpy as np
from pathlib import Path

# Project dataset location
DATA_FILE = (
    Path(__file__).resolve().parent.parent
    / "sample_data"
    / "sales_data.csv"
)

REQUIRED_COLUMNS = ["price", "discount", "advertising", "sales"]


def create_sample_dataset():
    """Create sample data only when the dataset does not exist."""
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    df_sample = pd.DataFrame({
        "price": [100, 90, 80, 100, 85, 95, 75, 90],
        "discount": [0, 10, 20, 0, 15, 5, 25, 10],
        "advertising": [5, 7, 8, 4, 6, 5, 9, 7],
        "sales": [20, 25, 32, 18, 28, 22, 38, 27]
    })

    df_sample.to_csv(DATA_FILE, index=False)


def main():
    print("\n===== ECONOCAUSAL: DAY 2 =====")

    # Create sample data if missing
    if not DATA_FILE.exists():
        create_sample_dataset()
        print("Sample dataset created.")

    # Load and validate dataset
    try:
        df = pd.read_csv(DATA_FILE)
    except (pd.errors.EmptyDataError, pd.errors.ParserError) as exc:
        raise ValueError(f"Unable to read the CSV file: {exc}") from exc

    if df.empty:
        raise ValueError("The dataset contains no data rows.")

    df.columns = df.columns.astype(str).str.strip()

    if df.columns.duplicated().any():
        raise ValueError("Duplicate column names found in the dataset.")

    missing_columns = [
        col for col in REQUIRED_COLUMNS if col not in df.columns
    ]
    if missing_columns:
        raise ValueError(
            f"Missing required columns: {missing_columns}"
        )

    # Convert expected columns to numeric values
    for col in REQUIRED_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    print("\n1. First five rows:")
    print(df.head())

    print("\n2. Dataset shape:")
    print(f"Rows: {df.shape[0]}, Columns: {df.shape[1]}")

    print("\n3. Column data types:")
    print(df.dtypes)

    print("\n4. Missing values before cleaning:")
    print(df.isnull().sum())

    # Remove duplicate records
    before = len(df)
    df = df.drop_duplicates().copy()
    print(f"\nDuplicate rows removed: {before - len(df)}")

    # Fill missing numeric values using column medians
    numeric_cols = df.select_dtypes(include=np.number).columns

    for col in numeric_cols:
        median_value = df[col].median()
        if pd.notna(median_value):
            df[col] = df[col].fillna(median_value)

    # Check that required columns have usable values
    if df[REQUIRED_COLUMNS].isnull().any().any():
        raise ValueError(
            "Some required columns contain no usable numeric values."
        )

    # Basic statistics
    print("\n5. Descriptive statistics:")
    print(df.describe().round(2))

    print("\n6. Average sales:")
    print(round(df["sales"].mean(), 2))

    print("\n7. Average discount:")
    print(round(df["discount"].mean(), 2))

    print("\n8. Correlation with sales:")
    print(df.corr(numeric_only=True)["sales"].round(2))

    print("\n9. Missing values after cleaning:")
    print(df.isnull().sum())

    # Save cleaned dataset
    clean_file = DATA_FILE.parent / "cleaned_sales_data.csv"
    df.to_csv(clean_file, index=False)

    print(f"\nCleaned dataset saved to: {clean_file}")
    print("\n analysis completed successfully!")


if __name__ == "__main__":
    main()



