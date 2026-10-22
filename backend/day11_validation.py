import pandas as pd


def validate_dataset(
    df,
    treatment,
    outcome,
    controls=None,
    min_rows=10,
):
    """
    Validate a dataset before running Double Machine Learning.
    Returns (is_valid, message, details).
    """
    controls = controls or []

    if df is None or df.empty:
        return False, "The uploaded dataset is empty.", {}

    if len(df) < min_rows:
        return (
            False,
            f"Upload at least {min_rows} rows. Found {len(df)}.",
            {"rows": len(df)},
        )

    if df.columns.duplicated().any():
        return False, "The dataset contains duplicate column names.", {}

    if not treatment or treatment not in df.columns:
        return False, "Select a valid treatment column.", {}

    if not outcome or outcome not in df.columns:
        return False, "Select a valid outcome column.", {}

    if treatment == outcome:
        return (
            False,
            "Treatment and outcome must be different columns.",
            {},
        )

    if isinstance(controls, str):
        controls = [controls] if controls else []

    if len(controls) != len(set(controls)):
        return False, "Duplicate control columns were selected.", {}

    if treatment in controls or outcome in controls:
        return (
            False,
            "Treatment and outcome cannot also be control variables.",
            {},
        )

    selected = [treatment, outcome] + controls

    missing_columns = [
        column for column in selected
        if column not in df.columns
    ]

    if missing_columns:
        return (
            False,
            "One or more selected columns do not exist.",
            {"missing_columns": missing_columns},
        )

    non_numeric = [
        column for column in selected
        if not pd.api.types.is_numeric_dtype(df[column])
    ]

    if non_numeric:
        return (
            False,
            "All selected analysis columns must be numeric.",
            {"non_numeric_columns": non_numeric},
        )

    missing_values = df[selected].isna().sum()
    columns_with_missing = {
        column: int(count)
        for column, count in missing_values.items()
        if count > 0
    }

    if columns_with_missing:
        return (
            False,
            "Selected columns contain missing values. Clean the data first.",
            {"missing_values": columns_with_missing},
        )

    if not all(
        df[column].nunique() > 1
        for column in [treatment, outcome]
    ):
        return (
            False,
            "Treatment and outcome must each contain varying values.",
            {},
        )

    details = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "treatment": treatment,
        "outcome": outcome,
        "controls": controls,
        "validated_columns": selected,
    }

    return True, "Dataset validation successful.", details
