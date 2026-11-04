
import pandas as pd


def validate_dataset(
    df,
    treatment,
    outcome,
    controls=None,
    min_rows=10,
):
    """Validate a dataset before running Double Machine Learning."""

    if df is None:
        return False, "No dataset was provided.", {}

    if not isinstance(df, pd.DataFrame):
        return False, "The dataset must be a pandas DataFrame.", {}

    if df.empty:
        return False, "The uploaded dataset is empty.", {}

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

    if df.columns.duplicated().any():
        duplicate_columns = df.columns[df.columns.duplicated()].tolist()
        return (
            False,
            "The dataset contains duplicate column names.",
            {"duplicate_columns": duplicate_columns},
        )

    if not isinstance(treatment, str) or not treatment.strip():
        return False, "Select a valid treatment column.", {}

    if treatment not in df.columns:
        return False, "The selected treatment column does not exist.", {}

    if not isinstance(outcome, str) or not outcome.strip():
        return False, "Select a valid outcome column.", {}

    if outcome not in df.columns:
        return False, "The selected outcome column does not exist.", {}

    if treatment == outcome:
        return False, "Treatment and outcome must be different columns.", {}

    if controls is None:
        controls = []
    elif isinstance(controls, str):
        controls = [controls] if controls.strip() else []
    elif not isinstance(controls, (list, tuple)):
        return False, "Controls must be a list of column names or a single string.", {}
    else:
        controls = list(controls)

    if any(not isinstance(c, str) or not c.strip() for c in controls):
        return False, "Every control must be a valid column name.", {}

    if len(controls) != len(set(controls)):
        return False, "Duplicate control columns were selected.", {}

    if treatment in controls or outcome in controls:
        return False, "Treatment and outcome cannot also be control variables.", {}

    selected = [treatment, outcome] + controls

    missing_columns = [c for c in selected if c not in df.columns]
    if missing_columns:
        return False, "One or more selected columns do not exist.", {
            "missing_columns": missing_columns
        }

    non_numeric = [
        c for c in selected
        if not pd.api.types.is_numeric_dtype(df[c])
        or pd.api.types.is_bool_dtype(df[c])
    ]
    if non_numeric:
        return False, "All selected analysis columns must be numeric.", {
            "non_numeric_columns": non_numeric
        }

    missing_values = df[selected].isna().sum()
    columns_with_missing = {
        c: int(count)
        for c, count in missing_values.items()
        if count > 0
    }
    if columns_with_missing:
        return False, "Selected columns contain missing values. Clean the data first.", {
            "missing_values": columns_with_missing
        }

    finite_values = df[selected].apply(
        lambda column: column.map(
            lambda value: bool(pd.notna(value))
            and bool(__import__("math").isfinite(float(value)))
        )
    )
    columns_with_non_finite = [
        c for c in selected if not finite_values[c].all()
    ]
    if columns_with_non_finite:
        return False, "Selected columns contain infinite or non-finite values.", {
            "non_finite_columns": columns_with_non_finite
        }

    constant_columns = [
        c for c in [treatment, outcome]
        if df[c].nunique() <= 1
    ]
    if constant_columns:
        return False, "Treatment and outcome must each contain varying values.", {
            "constant_columns": constant_columns
        }

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
