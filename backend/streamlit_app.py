
"""EconoCausal: Streamlit dashboard for sales and causal analysis."""

from pathlib import Path

import pandas as pd
import streamlit as st


# --------------------------------------------------
# 1. Project paths
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "sample_data"
OUTPUT_DIR = BASE_DIR / "outputs"

DATA_FILE = DATA_DIR / "cleaned_sales_data.csv"
METRICS_FILE = OUTPUT_DIR / "day5_metrics.csv"
PREDICTIONS_FILE = OUTPUT_DIR / "day5_predictions.csv"

GRAPH_FILES = [
    ("Actual vs Predicted Sales", "actual_vs_predicted.png"),
    ("Discount vs Sales", "discount_vs_sales.png"),
]


# --------------------------------------------------
# 2. Page configuration
# --------------------------------------------------

st.set_page_config(
    page_title="EconoCausal Dashboard",
    page_icon="📊",
    layout="wide",
)

st.title("EconoCausal: Dynamic Pricing Dashboard")
st.write(
    "Sales analysis, model evaluation, and discount-effect estimation."
)


# --------------------------------------------------
# 3. Load and validate the dataset
# --------------------------------------------------

st.header("1. Dataset Overview")

if not DATA_FILE.exists():
    st.error(f"Dataset not found: {DATA_FILE}")
    st.info(
        "Ensure sample_data/cleaned_sales_data.csv exists. "
        "Run backend/data_analysis.py to prepare the cleaned dataset."
    )
    st.stop()

try:
    df = pd.read_csv(DATA_FILE)
except (OSError, pd.errors.ParserError, UnicodeDecodeError) as exc:
    st.error(f"Could not read the dataset: {exc}")
    st.stop()

if df.empty:
    st.error("The dataset contains no records.")
    st.stop()

st.write(f"**Dataset:** {DATA_FILE.name}")
st.write(f"**Total records:** {len(df)}")
st.write(f"**Total columns:** {len(df.columns)}")

st.dataframe(df, use_container_width=True)

# Display missing values when present.
missing_counts = df.isna().sum()
missing_counts = missing_counts[missing_counts > 0]

if not missing_counts.empty:
    st.warning("Some columns contain missing values.")
    st.dataframe(
        missing_counts.rename("Missing Values").to_frame(),
        use_container_width=True,
    )


# --------------------------------------------------
# 4. Dataset summary metrics
# --------------------------------------------------

if {"sales", "discount"}.issubset(df.columns):
    sales = pd.to_numeric(df["sales"], errors="coerce")
    discount = pd.to_numeric(df["discount"], errors="coerce")

    col1, col2, col3 = st.columns(3)

    with col1:
        average_sales = sales.mean()
        st.metric(
            "Average Sales",
            f"{average_sales:,.2f}"
            if pd.notna(average_sales)
            else "N/A",
        )

    with col2:
        average_discount = discount.mean()
        st.metric(
            "Average Discount",
            f"{average_discount:,.2f}"
            if pd.notna(average_discount)
            else "N/A",
        )

    with col3:
        total_sales = sales.sum() if sales.notna().any() else float("nan")
        st.metric(
            "Total Sales",
            f"{total_sales:,.2f}"
            if pd.notna(total_sales)
            else "N/A",
        )
else:
    st.warning(
        "Average sales, average discount, and total sales require "
        "'sales' and 'discount' columns."
    )


# --------------------------------------------------
# 5. Model evaluation metrics
# --------------------------------------------------

st.header("2. Model Evaluation")

if METRICS_FILE.exists():
    try:
        metrics = pd.read_csv(METRICS_FILE)

        if metrics.empty:
            st.warning("The evaluation metrics file is empty.")
        else:
            st.subheader("Evaluation Metrics")
            st.dataframe(metrics, use_container_width=True)

            # Show key metrics as dashboard cards when available.
            metric_columns = st.columns(3)

            for index, metric_name in enumerate(
                ["MAE", "RMSE", "R2"]
            ):
                if metric_name in metrics.columns:
                    value = pd.to_numeric(
                        metrics[metric_name], errors="coerce"
                    ).iloc[0]

                    with metric_columns[index]:
                        st.metric(
                            metric_name,
                            f"{value:.3f}"
                            if pd.notna(value)
                            else "N/A",
                        )

    except (OSError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        st.error(f"Could not read evaluation metrics: {exc}")
else:
    st.warning(
        "Evaluation metrics are not available yet. "
        "Run backend/day5_evaluation.py first."
    )


# --------------------------------------------------
# 6. Actual vs predicted sales
# --------------------------------------------------

if PREDICTIONS_FILE.exists():
    try:
        predictions = pd.read_csv(PREDICTIONS_FILE)

        st.subheader("Actual vs Predicted Sales")

        if predictions.empty:
            st.warning("The predictions file contains no records.")
        else:
            st.dataframe(predictions, use_container_width=True)

            required_prediction_columns = {
                "Actual_Sales",
                "Predicted_Sales",
            }

            if required_prediction_columns.issubset(
                predictions.columns
            ):
                plot_data = predictions[
                    ["Actual_Sales", "Predicted_Sales"]
                ].apply(pd.to_numeric, errors="coerce").dropna()

                if not plot_data.empty:
                    st.line_chart(
                        plot_data.reset_index(drop=True),
                        use_container_width=True,
                    )
                else:
                    st.info(
                        "No valid numeric prediction values are available."
                    )

    except (OSError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        st.error(f"Could not read prediction results: {exc}")
else:
    st.info(
        "Prediction results are not available yet. "
        "Run backend/day5_evaluation.py first."
    )


# --------------------------------------------------
# 7. Visualizations
# --------------------------------------------------

st.header("3. Visualizations")

for graph_title, filename in GRAPH_FILES:
    graph_path = OUTPUT_DIR / filename

    if graph_path.exists():
        st.subheader(graph_title)
        st.image(
            str(graph_path),
            caption=graph_title,
            use_container_width=True,
        )
    else:
        st.info(
            f"{filename} is not available yet. "
            "Run backend/day5_evaluation.py to generate it."
        )


# --------------------------------------------------
# 8. Discount effect analysis
# --------------------------------------------------

st.header("4. Discount Effect Analysis")

if {"discount", "sales"}.issubset(df.columns):
    analysis_data = df[["discount", "sales"]].apply(
        pd.to_numeric,
        errors="coerce",
    ).dropna()

    if (
        len(analysis_data) >= 2
        and analysis_data["discount"].nunique() > 1
        and analysis_data["sales"].nunique() > 1
    ):
        correlation = analysis_data["discount"].corr(
            analysis_data["sales"]
        )

        if pd.notna(correlation):
            st.metric(
                "Discount-Sales Correlation",
                f"{correlation:.3f}",
            )
        else:
            st.info("Correlation could not be calculated.")
    else:
        st.info(
            "At least two valid records and varying discount and sales "
            "values are required to calculate correlation."
        )

    st.caption(
        "Correlation measures association, not causation. "
        "Use the Double Machine Learning (DML) analysis for a separate "
        "causal-effect estimate. Small datasets may produce unreliable "
        "results."
    )
else:
    st.warning(
        "Discount effect analysis requires 'discount' and 'sales' columns."
    )


# --------------------------------------------------
# 9. Dashboard status
# --------------------------------------------------

st.success("EconoCausal dashboard loaded successfully.")

