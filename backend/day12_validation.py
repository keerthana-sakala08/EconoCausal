
"""Day 12: Dataset validation for EconoCausal."""

from dataclasses import dataclass, field
from typing import Optional

import pandas as pd


@dataclass
class ValidationResult:
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
    controls = control_columns or []

    # Check that the dataset exists and has content.
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

    if rows < min_rows:
        errors.append(
            f"At least {min_rows} rows are required; found {rows}."
        )

    # Check column names.
    if df.columns.duplicated().any():
        duplicates = df.columns[df.columns.duplicated()].tolist()
        errors.append(f"Duplicate column names found: {duplicates}")

    if any(not isinstance(col, str) or not col.strip()
           for col in df.columns):
        errors.append("Column names must be non-empty strings.")

    # Check missing values.
    missing = df.isnull().sum()
    missing = missing[missing > 0]

    if not missing.empty:
        details = ", ".join(
            f"{column}: {int(count)}"
            for column, count in missing.items()
        )
        errors.append(f"Missing values found ({details}).")

    # Check selected treatment and outcome.
    if treatment_column is not None and outcome_column is not None:
        if treatment_column == outcome_column:
            errors.append(
                "Treatment and outcome columns must be different."
            )

    for role, selected in (
        ("Treatment", treatment_column),
        ("Outcome", outcome_column),
    ):
        if selected is not None:
            if selected not in df.columns:
                errors.append(
                    f"{role} column '{selected}' was not found."
                )
            elif df[selected].nunique(dropna=True) < 2:
                errors.append(
                    f"{role} column '{selected}' must contain "
                    "at least two distinct non-missing values."
                )

    # Check control columns.
    if len(controls) != len(set(controls)):
        errors.append("Control columns must not contain duplicates.")

    for control in controls:
        if control not in df.columns:
            errors.append(
                f"Control column '{control}' was not found."
            )

    if treatment_column is not None and treatment_column in controls:
        errors.append("Treatment cannot also be a control column.")

    if outcome_column is not None and outcome_column in controls:
        errors.append("Outcome cannot also be a control column.")

    # Warn about constant columns.
    for column in df.columns:
        if df[column].nunique(dropna=True) <= 1:
            warnings.append(
                f"Column '{column}' has one or fewer distinct values."
            )

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
    assert any("At least 10 rows" in e for e in result.errors)
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

    print("\nAll Day 12 validation smoke tests passed.")
