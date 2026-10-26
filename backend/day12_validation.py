
"""Day 12: Dataset validation for EconoCausal."""

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd


@dataclass
class ValidationResult:
    """Store dataset validation results."""

    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    rows: int = 0
    columns: int = 0


def validate_dataset(
    df: pd.DataFrame,
    treatment_column: Optional[str] = None,
    outcome_column: Optional[str] = None,
    control_columns: Optional[list[str]] = None,
    min_rows: int = 10,
) -> ValidationResult:
    """Validate a dataset before causal analysis."""

    errors = []
    warnings = []

    # Step 1: Validate the input dataset.
    if not isinstance(df, pd.DataFrame):
        return ValidationResult(
            valid=False,
            errors=["Input must be a pandas DataFrame."],
        )

    rows, columns = df.shape

    if rows == 0:
        errors.append("The dataset is empty.")

    if columns == 0:
        errors.append("The dataset has no columns.")

    # Validate the minimum row requirement.
    if (
        isinstance(min_rows, bool)
        or not isinstance(min_rows, int)
        or min_rows < 1
    ):
        errors.append("min_rows must be a positive integer.")
    elif rows < min_rows:
        errors.append(
            f"At least {min_rows} rows are required; found {rows}."
        )

    # Step 2: Validate column names.
    if df.columns.duplicated().any():
        duplicates = df.columns[df.columns.duplicated()].tolist()
        errors.append(f"Duplicate column names found: {duplicates}")

    if any(
        not isinstance(col, str) or not col.strip()
        for col in df.columns
    ):
        errors.append("Column names must be non-empty strings.")

    # Step 3: Check missing values across the dataset.
    missing = df.isnull().sum()
    missing = missing[missing > 0]

    if not missing.empty:
        details = ", ".join(
            f"{column}: {int(count)}"
            for column, count in missing.items()
        )
        errors.append(f"Missing values found ({details}).")

    # Step 4: Normalize and validate control selections.
    if control_columns is None:
        controls = []
    elif isinstance(control_columns, str):
        controls = [control_columns] if control_columns.strip() else []
    elif isinstance(control_columns, (list, tuple)):
        controls = list(control_columns)
    else:
        controls = []
        errors.append(
            "Control columns must be a list, tuple, or single string."
        )

    if any(
        not isinstance(control, str) or not control.strip()
        for control in controls
    ):
        errors.append("Control column names must be non-empty strings.")

    valid_controls = [
        control for control in controls
        if isinstance(control, str) and control.strip()
    ]

    if len(valid_controls) != len(set(valid_controls)):
        errors.append("Control columns must not contain duplicates.")

    # Step 5: Check selected treatment and outcome.
    for role, selected in (
        ("Treatment", treatment_column),
        ("Outcome", outcome_column),
    ):
        if selected is not None:
            if not isinstance(selected, str) or not selected.strip():
                errors.append(f"{role} column must be a valid column name.")
            elif selected not in df.columns:
                errors.append(
                    f"{role} column '{selected}' was not found."
                )

    if (
        treatment_column is not None
        and outcome_column is not None
        and treatment_column == outcome_column
    ):
        errors.append(
            "Treatment and outcome columns must be different."
        )

    # Check treatment and outcome data types and variation.
    for role, selected in (
        ("Treatment", treatment_column),
        ("Outcome", outcome_column),
    ):
        if (
            isinstance(selected, str)
            and selected in df.columns
        ):
            series = df[selected]

            if (
                not pd.api.types.is_numeric_dtype(series)
                or pd.api.types.is_bool_dtype(series)
            ):
                errors.append(
                    f"{role} column '{selected}' must contain numeric data."
                )
                continue

            if series.isna().any():
                continue

            if not series.map(
                lambda value: pd.notna(value)
                and abs(float(value)) != float("inf")
            ).all():
                errors.append(
                    f"{role} column '{selected}' contains "
                    "infinite or non-finite values."
                )
                continue

            if series.nunique(dropna=True) < 2:
                errors.append(
                    f"{role} column '{selected}' must contain "
                    "at least two distinct non-missing values."
                )

    # Step 6: Validate control columns.
    for control in valid_controls:
        if control not in df.columns:
            errors.append(
                f"Control column '{control}' was not found."
            )
            continue

        series = df[control]

        if (
            not pd.api.types.is_numeric_dtype(series)
            or pd.api.types.is_bool_dtype(series)
        ):
            errors.append(
                f"Control column '{control}' must contain numeric data."
            )
            continue

        if series.isna().any():
            continue

        if not series.map(
            lambda value: pd.notna(value)
            and abs(float(value)) != float("inf")
        ).all():
            errors.append(
                f"Control column '{control}' contains "
                "infinite or non-finite values."
            )

    if treatment_column is not None and treatment_column in valid_controls:
        errors.append("Treatment cannot also be a control column.")

    if outcome_column is not None and outcome_column in valid_controls:
        errors.append("Outcome cannot also be a control column.")

    # Step 7: Warn about constant columns.
    for column in df.columns:
        if df[column].nunique(dropna=True) <= 1:
            warnings.append(
                f"Column '{column}' has one or fewer distinct values."
            )

    # Step 8: Return the structured validation result.
    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        rows=rows,
        columns=columns,
    )


if __name__ == "__main__":
    # Built-in smoke tests; no sample CSV is required.

    good = pd.DataFrame({
        "discount": [5, 10] * 5,
        "sales": list(range(10, 20)),
        "advertising": list(range(1, 11)),
    })

    result = validate_dataset(
        good,
        treatment_column="discount",
        outcome_column="sales",
        control_columns=["advertising"],
    )
    assert result.valid, result.errors
    print("PASS: Valid dataset")

    small = good.head(8)
    result = validate_dataset(
        small,
        treatment_column="discount",
        outcome_column="sales",
    )
    assert not result.valid
    assert any("At least 10 rows" in error for error in result.errors)
    print("PASS: Minimum row count")

    result = validate_dataset(
        good,
        treatment_column="discount",
        outcome_column="discount",
    )
    assert not result.valid
    print("PASS: Treatment/outcome mismatch")

    missing = good.copy()
    missing.loc[0, "sales"] = None
    result = validate_dataset(missing)
    assert not result.valid
    print("PASS: Missing-value detection")

    constant = good.copy()
    constant["discount"] = 5
    result = validate_dataset(
        constant,
        treatment_column="discount",
        outcome_column="sales",
    )
    assert not result.valid
    print("PASS: Constant treatment detection")

    non_numeric = good.copy()
    non_numeric["discount"] = ["low", "high"] * 5
    result = validate_dataset(
        non_numeric,
        treatment_column="discount",
        outcome_column="sales",
    )
    assert not result.valid
    print("PASS: Non-numeric treatment detection")

    duplicate_controls = validate_dataset(
        good,
        treatment_column="discount",
        outcome_column="sales",
        control_columns=["advertising", "advertising"],
    )
    assert not duplicate_controls.valid
    print("PASS: Duplicate control detection")

    print("\nAll Day 12 validation smoke tests passed.")
