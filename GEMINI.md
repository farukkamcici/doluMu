# GEMINI.md

## Project Overview

This project is a data science platform for predicting passenger density on Istanbul's public transportation network. It uses historical passenger data, weather forecasts, and calendar information to train a LightGBM model that forecasts passenger counts up to 24 hours in advance.

The project is well-documented, with a clear separation of concerns between data preparation, feature engineering, and modeling. It uses a combination of Polars and Pandas for data manipulation and follows a structured approach to model development and evaluation.

**Key Technologies:**

*   **Languages:** Python
*   **Core Libraries:** Polars, Pandas, LightGBM, Scikit-learn, MLflow, SHAP
*   **Data Format:** Parquet
*   **Orchestration:** Makefile

**Architecture:**

The project follows a standard machine learning pipeline architecture:

1.  **Data Preparation (`src/data_prep`):** Raw CSV data is ingested, cleaned, and aggregated into interim Parquet files.
2.  **Feature Engineering (`src/features`):** Various features are created, including lag/rolling window features, calendar/holiday features, and weather features. Data quality checks are also performed at this stage.
3.  **Modeling (`src/model`):** A LightGBM model is trained on the engineered features. The model is then evaluated against several baseline models, and its predictions are explained using SHAP.
4.  **Outputs:** The trained models, evaluation reports, and feature importance plots are saved to the `models/` and `reports/` directories.

## Building and Running

### 1. Installation

Create a virtual environment and install the required dependencies:

```bash
pip install -r requirements.txt
```

Or using the Makefile:

```bash
make install
```

### 2. Running the Pipeline

The `Makefile` provides convenient commands for running the entire pipeline or individual steps.

**Run the full data and modeling pipeline:**

```bash
make pipeline
make model-train
make model-eval
```

**Run individual steps:**

*   **Process raw data:** `make data-raw`
*   **Clean data:** `make data-clean`
*   **Build final features:** `make features-final`
*   **Run data quality checks:** `make features-qa`
*   **Split features for training:** `make features-split`
*   **Train the model:** `make model-train`
*   **Evaluate the model:** `make model-eval`

## Development Conventions

*   **Data Pipeline:** The data pipeline is orchestrated through a series of Python scripts in the `src` directory. The `Makefile` provides a convenient way to run these scripts in the correct order.
*   **Data Immutability:** The pipeline is designed to be idempotent. Raw data is read from `data/raw`, intermediate data is stored in `data/interim`, and processed data is saved to `data/processed`. This separation ensures that the raw data is never modified.
*   **Data Quality:** Data quality checks are integrated into the pipeline, with logs written to the `docs` directory. This helps to ensure the reliability of the features used for modeling.
*   **Modeling:** The modeling process is also scripted and includes training, evaluation, and explanation. The use of MLflow suggests a practice of tracking experiments and model versions.
*   **Documentation:** The project is extensively documented in the `docs` directory, which includes a PRD, a technical design document, a project log, and a project summary. This is a great practice for ensuring the project is maintainable and understandable.
