import pandas as pd
import lightgbm as lgb
import json
import numpy as np
import time
from pathlib import Path
from sklearn.metrics import mean_absolute_error, mean_squared_error

# --- 1. Configuration ---
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_DIR = ROOT_DIR / "models"
DATA_DIR = ROOT_DIR / "data" / "processed" / "split_features"
REPORTS_DIR = ROOT_DIR / "reports"

# Paths to the data files
TEST_DATA_PATH = DATA_DIR / "test_features.parquet"
TRAIN_DATA_PATH = DATA_DIR / "train_features.parquet"  # Needed for v2 denormalization
# baseline_linehour_avg.parquet has been removed as requested

MODELS_TO_TEST = {
    "lgbm_transport_v4": {
        "path": MODEL_DIR / "lgbm_transport_v4.txt",  # .txt model file
        "needs_denormalization": False
    },
    "lgbm_transport_v2": {
        "path": MODEL_DIR / "lgbm_transport_v2.txt",  # .txt model file
        "needs_denormalization": True
    }
}

# Feature list from your v4 feature importance list
FEATURES = [
    'roll_mean_3h', 'lag_1h', 'lag_2h', 'hour_of_day', 'lag_3h',
    'roll_mean_24h', 'roll_mean_6h', 'line_name', 'roll_std_3h',
    'roll_std_6h', 'roll_std_24h', 'roll_mean_12h', 'roll_std_12h',
    'lag_168h', 'lag_24h', 'day_of_week', 'lag_12h', 'month',
    'temperature_2m', 'lag_48h', 'wind_speed_10m', 'is_holiday',
    'season', 'is_school_term', 'precipitation', 'is_weekend',
    'holiday_win_m1', 'holiday_win_p1'
]
TARGET_COLUMN = "y"  # As requested, using 'y' as the target
# Corrected categorical features list
CATEGORICAL_FEATURES = ["line_name", "season"]


# --- 2. Metric & Helper Functions ---

def smape(y_true, y_pred):
    """Symmetric Mean Absolute Percentage Error (SMAPE)"""
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    numerator = np.abs(y_pred - y_true)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2.0
    mask = denominator == 0
    ratio = np.zeros_like(denominator)
    ratio[~mask] = numerator[~mask] / denominator[~mask]
    return np.mean(ratio)


def calculate_metrics_by_group(df, group_col, y_true_col, y_pred_col):
    """Calculates MAE by a specific group (like hour or line)."""
    grouped = df.groupby(group_col)
    metrics = grouped.apply(lambda x: mean_absolute_error(x[y_true_col], x[y_pred_col]))
    return metrics.sort_values(ascending=False)


def denormalize_predictions(train_df, val_df, y_pred_norm):
    """
    Restore per-line normalized predictions to real scale.

    This function needs the 'line_name' from val_df and stats from train_df.
    """
    # Get the mean/std stats from the TRAINING data, using 'y' as target
    stats = train_df.groupby("line_name")[TARGET_COLUMN].agg(["mean", "std"]).reset_index()

    # Merge stats onto the VALIDATION/TEST data's line_name
    merged = val_df[["line_name"]].merge(stats, on="line_name", how="left")

    # Handle any potential new lines in test set not seen in train set
    merged['mean'] = merged['mean'].fillna(train_df[TARGET_COLUMN].mean())
    merged['std'] = merged['std'].fillna(train_df[TARGET_COLUMN].std())

    line_mean = merged["mean"].values
    line_std = merged["std"].values + 1e-6  # Add epsilon to avoid division by zero

    return y_pred_norm * line_std + line_mean


# --- 3. Main Test Function ---

def main():
    print(f"Project Root Directory: {ROOT_DIR}")

    # --- Load Data ---
    print("Loading datasets...")
    try:
        test_df = pd.read_parquet(TEST_DATA_PATH)
        # We need train_df to get the stats for v2 denormalization
        train_df = pd.read_parquet(TRAIN_DATA_PATH)
    except FileNotFoundError as e:
        print(f"ERROR: Data file not found: {e}")
        print("Please ensure 'test_features.parquet' and 'train_features.parquet' are in 'data/processed'.")
        return

    # Prepare Test Set
    X_test = test_df[FEATURES].copy()
    for col in CATEGORICAL_FEATURES:
        if col in X_test.columns:
            X_test[col] = X_test[col].astype('category')
        else:
            print(f"Warning: Categorical feature '{col}' not found in X_test columns.")

    y_test = test_df[TARGET_COLUMN]
    print(f"Found {len(y_test)} samples in test set.")

    # --- Compute Baselines ---
    print("Calculating baseline metrics (handling NaNs)...")
    try:
        # --- Baseline Lag 24h ---
        # Create a temporary DataFrame and drop rows where EITHER y_test or the lag is NaN
        temp_df_24 = test_df[[TARGET_COLUMN, 'lag_24h']].dropna()
        y_test_24 = temp_df_24[TARGET_COLUMN]
        baseline_pred_24 = temp_df_24['lag_24h']
        baseline_mae_lag24 = mean_absolute_error(y_test_24, baseline_pred_24)
        print(f"Baseline MAE (Lag 24h) calculated on {len(y_test_24)} non-NaN samples.")

        # --- Baseline Lag 168h ---
        # Do the same for the 168h lag
        temp_df_168 = test_df[[TARGET_COLUMN, 'lag_168h']].dropna()
        y_test_168 = temp_df_168[TARGET_COLUMN]
        baseline_pred_168 = temp_df_168['lag_168h']
        baseline_mae_lag168 = mean_absolute_error(y_test_168, baseline_pred_168)
        print(f"Baseline MAE (Lag 168h) calculated on {len(y_test_168)} non-NaN samples.")

    except KeyError as e:
        print(f"ERROR: Baseline lag column not found ({e}).")
        print("Please ensure 'lag_24h' and 'lag_168h' (raw target lags) are in 'test_features.parquet'.")
        return

    print(f"Baseline MAE (Lag 24h): {baseline_mae_lag24:.2f}")
    print(f"Baseline MAE (Lag 168h): {baseline_mae_lag168:.2f}")


    test_results = {}

    # --- Test Models ---
    for model_name, config in MODELS_TO_TEST.items():
        print(f"\n--- Testing Model: {model_name} ---")

        try:
            # Load the model from .txt file
            model = lgb.Booster(model_file=str(config["path"]))
        except Exception as e:
            print(f"ERROR: Could not load model file: {config['path']}. Error: {e}")
            continue

        print("Model loaded. Starting prediction...")
        start_time = time.time()
        y_pred = model.predict(X_test)
        prediction_time = time.time() - start_time
        print(f"Prediction finished in {prediction_time:.2f} seconds.")

        # --- Denormalization (For v2 only) ---
        if config["needs_denormalization"]:
            print("Applying denormalization (inverse_transform)...")
            try:
                y_pred = denormalize_predictions(train_df, test_df, y_pred)
                print("Denormalization complete.")
            except Exception as e:
                print(f"ERROR during denormalization: {e}")
                continue

        # --- Calculate Metrics ---
        print("Calculating metrics...")
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        smp = smape(y_test, y_pred)

        results_df = test_df[['hour_of_day', 'line_name']].copy()
        results_df['y_true'] = y_test
        results_df['y_pred'] = y_pred

        by_hour_metrics = calculate_metrics_by_group(results_df, 'hour_of_day', 'y_true', 'y_pred')
        by_line_metrics = calculate_metrics_by_group(results_df, 'line_name', 'y_true', 'y_pred')

        # --- Report Results ---
        report = {
            "model_name": model_name,
            "dataset": "TEST_SET (Unseen)",
            "n_samples": len(y_test),
            "mae": mae,
            "rmse": rmse,
            "smape": smp,
            "prediction_time_sec": prediction_time,
            "baseline_mae_lag24": baseline_mae_lag24,
            "baseline_mae_lag168": baseline_mae_lag168,
            "improvement_over_lag24_pct": (1 - (mae / baseline_mae_lag24)) * 100,
            "improvement_over_lag168_pct": (1 - (mae / baseline_mae_lag168)) * 100,
            "by_hour (MAE)": by_hour_metrics.to_dict(),
            "top10_worst_lines (MAE)": by_line_metrics.head(10).to_dict()
        }
        test_results[model_name] = report

        print(f"TEST RESULTS ({model_name}):")
        print(f"  MAE: {mae:.2f}")
        print(f"  RMSE: {rmse:.2f}")
        print(f"  SMAPE: {smp:.4f}")

    # --- Save Final Report ---
    output_path = REPORTS_DIR / "test_set_model_comparison_report_v2_v4.json"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)  # Ensure reports dir exists
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(test_results, f, indent=4, ensure_ascii=False)

    print(f"\n--- Test Complete ---")
    print(f"Detailed comparison report saved to: {output_path}")


if __name__ == "__main__":
    main()