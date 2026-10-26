
import pandas as pd


def validate_dataset(
    df,
    treatment,
    outcome,
    controls=None,
    min_rows=10,
):
    """
    Validate a dataset before running Double Machine Learning (DML).

    Parameters
    ----------
    df : pandas.DataFrame
        Dataset to validate.
    treatment : str
        Treatment variable, such as "discount".
    outcome : str
        Outcome variable, such as "sales".
    controls : list or str, optional
        Control variables, such as ["advertising"].
    min_rows : int, default=10
        Minimum number of rows required.

    Returns
    -------
    tuple
        (is_valid, message, details)
    """
    # Step 1: Validate the dataset object.
    if df is None:
        return False, "No dataset was provided.", {}

    if not isinstance(df, pd.DataFrame):
        return False, "The dataset must be a pandas DataFrame.", {}

    if df.empty:
        return False, "The uploaded dataset is empty.", {}

    # Step 2: Validate the minimum row requirement.
    if (
        isinstance(min_rows, bool)
        or not isinstance(min_rows, int)
        or min_rows < 1
    ):
        return False, "min_rows must be a positive integer.", {}

    if len(df) < min_rows:
        return (
            False,
            f"Upload at least {min_rows} rows. Found {len(df)}.",
            {"rows": int(len(df)), "minimum_rows": min_rows},
        )

    # Step 3: Validate column names.
    if df.columns.duplicated().any():
        duplicate_columns = (
            df.columns[df.columns.duplicated()].tolist()
        )
        return (
            False,
            "The dataset contains duplicate column names.",
            {"duplicate_columns": duplicate_columns},
        )

    # Step 4: Validate treatment and outcome selections.
    if not isinstance(treatment, str) or not treatment.strip():
        return False, "Select a valid treatment column.", {}

    if treatment not in df.columns:
        return (
            False,
            "The selected treatment column does not exist.",
            {"treatment": treatment},
        )

    if not isinstance(outcome, str) or not outcome.strip():
        return False, "Select a valid outcome column.", {}

    if outcome not in df.columns:
        return (
            False,
            "The selected outcome column does not exist.",
            {"outcome": outcome},
        )

    if treatment == outcome:
        return (
            False,
            "Treatment and outcome must be different columns.",
            {"treatment": treatment, "outcome": outcome},
        )

    # Step 5: Normalize and validate control selections.
    if controls is None:
        controls = []
    elif isinstance(controls, str):
        controls = [controls] if controls.strip() else []
    elif not isinstance(controls, (list, tuple)):
        return (
            False,
            "Controls must be a list of column names or a single string.",
            {},
        )
    else:
        controls = list(controls)

    if any(
        not isinstance(column, str) or not column.strip()
        for column in controls
    ):
        return (
            False,
            "Every control must be a valid column name.",
            {"controls": controls},
        )

    if len(controls) != len(set(controls)):
        return (
            False,
            "Duplicate control columns were selected.",
            {"controls": controls},
        )

    if treatment in controls or outcome in controls:
        return (
            False,
            "Treatment and outcome cannot also be control variables.",
            {
                "treatment": treatment,
                "outcome": outcome,
                "controls": controls,
            },
        )

    # Step 6: Check that every selected column exists.
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

    # Step 7: Check numeric data types.
    non_numeric = [
        column for column in selected
        if not pd.api.types.is_numeric_dtype(df[column])
        or pd.api.types.is_bool_dtype(df[column])
    ]

    if non_numeric:
        return (
            False,
            "All selected analysis columns must be numeric.",
            {"non_numeric_columns": non_numeric},
        )

    # Step 8: Check missing values.
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

    # Step 9: Check infinite and non-finite values.
    finite_values = df[selected].apply(
        lambda column: column.map(
            lambda value: bool(pd.notna(value))
            and bool(__import__("math").isfinite(float(value)))
        )
    )

    columns_with_non_finite = [
        column for column in selected
        if not finite_values[column].all()
    ]

    if columns_with_non_finite:
        return (
            False,
            "Selected columns contain infinite or non-finite values.",
            {"non_finite_columns": columns_with_non_finite},
        )

    # Step 10: Treatment and outcome must vary.
    constant_columns = [
        column for column in [treatment, outcome]
        if df[column].nunique() <= 1
    ]

    if constant_columns:
        return (
            False,
            "Treatment and outcome must each contain varying values.",
            {"constant_columns": constant_columns},
        )

    # Step 11: Return validation details.
    details = {
        "rows": int(len(df)),
        "columns": int(len(df.columns)),
        "treatment": treatment,
        "outcome": outcome,
        "controls": controls,
        "validated_columns": selected,
        "missing_values": {},
        "validation_status": "passed",
    }

    return True, "Dataset validation successful.", details
