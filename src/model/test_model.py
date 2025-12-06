'''
This script tests a single, specified model version against the unseen test set.
It provides a comprehensive report on the model's performance, including
comparisons against baselines and segment-level error analysis.

Usage:
    python src/model/test_model.py <version>

Example:
    python src/model/test_model.py v6
'''

import argparse
import json
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from utils.config_loader import load_config
from utils.paths import MODEL_DIR, REPORT_DIR, SPLIT_FEATURES_DIR


# ==============================================================================
# Metric & Helper Functions (Consistent with eval_model.py)
# ==============================================================================


def mae(y_true, y_pred):
    """Calculates Mean Absolute Error."""
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true, y_pred):
    """Calculates Root Mean Squared Error."""
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

def smape(y_true, y_pred):
    """Calculates Symmetric Mean Absolute Percentage Error."""
    numerator = np.abs(y_true - y_pred)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2.0
    return float(np.mean(numerator / (denominator + 1e-8)))

def improvement(base, model):
    """Calculates the percentage improvement of a model over a baseline."""
    if base == 0:
        return np.nan
    return float((base - model) / base * 100)

def denormalize_predictions(train_df, test_df, y_pred_norm):
    """
    Restores per-line normalized predictions to their original, real scale.
    """
    stats = train_df.groupby("line_name")["y"].agg(["mean", "std"]).reset_index()
    merged = test_df[["line_name"]].merge(stats, on="line_name", how="left")
    merged["mean"] = merged["mean"].fillna(train_df["y"].mean())
    merged["std"] = merged["std"].fillna(train_df["y"].std())
    line_mean = merged["mean"].values
    line_std = merged["std"].values + 1e-6
    return y_pred_norm * line_std + line_mean


# ==============================================================================
# Main Test Function
# ==============================================================================


def main(version: str):
    """
    Loads a model and its configuration, runs it on the test set,
    and generates a detailed performance report.
    """
    print(f"--- Starting Test for Model Version: {version} ---")

    # --- 1. Load Configuration ---
    try:
        cfg = load_config(version)
    except FileNotFoundError:
        print(f"ERROR: Configuration file for version '{version}' not found.")
        return

    model_name = cfg["model"]["name"]
    model_filename = cfg["model"]["final_model_name"]
    model_path = MODEL_DIR / model_filename

    print(f"Loading model: {model_path}")
    if not model_path.exists():
        print(f"ERROR: Model file not found at '{model_path}'.")
        print("Please ensure the model has been trained first.")
        return

    # --- 2. Load Data ---
    print("Loading train and test datasets...")
    try:
        train_df = pd.read_parquet(SPLIT_FEATURES_DIR / "train_features.parquet")
        test_df = pd.read_parquet(SPLIT_FEATURES_DIR / "test_features.parquet")
    except FileNotFoundError as e:
        print(f"ERROR: Could not find data files at {SPLIT_FEATURES_DIR}.")
        print(f"Please run the feature pipeline first. Original error: {e}")
        return

    # --- 3. Prepare Test Data ---
    print("Preparing test data...")
    model_features = cfg["features"]["all"]
    cat_features = cfg["features"]["categorical"]

    features_to_use = [f for f in model_features if f in test_df.columns]
    X_test = test_df[features_to_use].copy()
    y_test = test_df["y"]

    # Use the same robust categorical encoding as the evaluation script
    for c in cat_features:
        if c in X_test.columns:
            all_cats = pd.concat([train_df, test_df])[c].astype("category").cat.categories
            X_test[c] = pd.Categorical(X_test[c], categories=all_cats, ordered=False)

    # --- 4. Load Model and Predict ---
    model = lgb.Booster(model_file=str(model_path))

    print("Making predictions on the test set...")
    start_time = time.time()
    y_pred = model.predict(X_test, num_iteration=model.best_iteration)
    prediction_time = time.time() - start_time

    if cfg["features"].get("needs_denormalization", False):
        print("Denormalizing predictions...")
        y_pred = denormalize_predictions(train_df, test_df, y_pred)

    # --- 5. Calculate Metrics ---
    print("Calculating performance metrics...")
    y_test_mean = float(y_test.mean())
    mae_value = mae(y_test, y_pred)
    nmae_value = mae_value / y_test_mean if y_test_mean > 0 else np.nan
    accuracy_value = 1.0 - nmae_value if not np.isnan(nmae_value) else np.nan
    
    report = {
        "model_name": model_name,
        "dataset": "Unseen Test Set",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "n_samples": len(y_test),
        "prediction_time_sec": prediction_time,
        "mae": mae_value,
        "rmse": rmse(y_test, y_pred),
        "smape": smape(y_test, y_pred),
        "nmae": nmae_value,
        "volume_weighted_accuracy": accuracy_value,
        "test_set_mean_volume": y_test_mean,
    }

    # --- 6. Calculate Baselines & Segment-Level Errors ---
    baseline_mae_lag24 = mae(y_test, test_df["lag_24h"])
    baseline_nmae_lag24 = baseline_mae_lag24 / y_test_mean if y_test_mean > 0 else np.nan
    report["baseline_mae_lag24"] = baseline_mae_lag24
    report["baseline_nmae_lag24"] = baseline_nmae_lag24
    report["improvement_over_lag24_pct"] = improvement(baseline_mae_lag24, report["mae"])

    results_df = test_df[["hour_of_day", "line_name"]].copy()
    results_df['y_true'] = y_test
    results_df['y_pred'] = y_pred
    results_df['abs_error'] = np.abs(results_df['y_true'] - results_df['y_pred'])

    mae_by_hour = results_df.groupby('hour_of_day')['abs_error'].mean()
    report['by_hour_mae'] = {str(k): v for k, v in mae_by_hour.to_dict().items()}

    line_stats = results_df.groupby('line_name').agg(
        mae=('abs_error', 'mean'),
        mean_volume=('y_true', 'mean')
    )
    line_stats['nmae'] = line_stats['mae'] / line_stats['mean_volume']
    top_10_lines = line_stats.sort_values('mae', ascending=False).head(10)
    
    report['top10_worst_lines'] = {
        line: {
            'mae': float(row['mae']),
            'mean_volume': float(row['mean_volume']),
            'nmae': float(row['nmae'])
        }
        for line, row in top_10_lines.iterrows()
    }

    # --- 7. Display and Save Report ---
    print("\n--- Test Report ---")
    print(f"Model: {report['model_name']}")
    print(f"  MAE: {report['mae']:.2f}")
    print(f"  RMSE: {report['rmse']:.2f}")
    print(f"  SMAPE: {report['smape']:.4f}")
    print(f"  NMAE (Normalized MAE): {report['nmae']:.4f} ({report['nmae']*100:.2f}%)")
    print(f"  Volume-Weighted Accuracy: {report['volume_weighted_accuracy']:.4f} ({report['volume_weighted_accuracy']*100:.2f}%)")
    print(f"\n  Baseline Comparison:")
    print(f"    Baseline NMAE (Lag-24h): {report['baseline_nmae_lag24']:.4f} ({report['baseline_nmae_lag24']*100:.2f}%)")
    print(f"    Improvement over Lag 24h: {report['improvement_over_lag24_pct']:.2f}%")
    print("-------------------")

    output_path = REPORT_DIR / f"test_report_{model_name}.json"
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=4)

    print(f"\n✅ Detailed test report saved to: {output_path}")
    
    # --- 8. Generate Human-Readable Markdown Report ---
    print("Generating human-readable report...")
    markdown_report = f"""# 📊 Model Performance & Methodology Report
**Model Version:** {model_name}  
**Date:** {report['timestamp']}

## 1. Executive Summary
Our model predicts passenger demand with a **Volume-Weighted Accuracy of {report['volume_weighted_accuracy']*100:.1f}%**.  
This means that relative to the total passenger volume, our average error margin is only **{report['nmae']*100:.1f}%**.

---

## 2. Detailed Metric Explanations

### A. MAE (Mean Absolute Error)
**What is it?**  
The average number of passengers we "miss" by per hour.

* **The Math:**  
  $MAE = \\frac{{1}}{{n}} \\sum | \\text{{Actual}} - \\text{{Predicted}} |$

* **Simulated Example:**  
  If a bus actually has **100** passengers, and we predict **110**:  
  Error = |100 - 110| = **10 passengers**.  
  We repeat this for all lines and take the average.

* **Our Model's Result:**  
  **{report['mae']:.0f} Passengers** (On average, we deviate by this amount).

---

### B. NMAE (Normalized Mean Absolute Error)
**What is it?**  
The error rate relative to the "busyness" of the line. An error of 10 people matters less on a Metro (1000 people) than on a Minibus (20 people).

* **The Math:**  
  $NMAE = \\frac{{MAE}}{{\\text{{Average Passenger Count}}}}$

* **Simulated Example:**  
  If the average passenger count is **1000** and our MAE is **72**:  
  $NMAE = \\frac{{72}}{{1000}} = 0.072 \\quad (7.2\\%)$

* **Our Model's Result:**  
  **{report['nmae']*100:.1f}%** (This is our weighted error rate).

---

### C. Accuracy (Volume-Weighted)
**What is it?**  
The opposite of error. It represents our confidence level in meeting the total passenger demand.

* **The Math:**  
  $Accuracy = 1 - NMAE$

* **Our Model's Result:**  
  **{report['volume_weighted_accuracy']*100:.1f}%** (We successfully predicted this percentage of the total volume).

---

## 3. Comparative Success (Baseline)
**Why use AI?**  
If we simply assumed "Today will be exactly like Yesterday" (Naive Approach), our error would be **{report['baseline_mae_lag24']:.0f}** passengers.  
By using this model, we reduced the error by **{report['improvement_over_lag24_pct']:.1f}%**.

**Error Rate Comparison:**  
- **Naive Baseline (Lag-24h) NMAE:** {report['baseline_nmae_lag24']*100:.1f}%  
- **Our Model NMAE:** {report['nmae']*100:.1f}%  
- **Improvement:** Our model reduces the global error rate from {report['baseline_nmae_lag24']*100:.1f}% down to {report['nmae']*100:.1f}%.

---

## 4. Additional Metrics

### RMSE (Root Mean Squared Error)
**What is it?**  
Similar to MAE but penalizes larger errors more heavily. Useful for identifying systematic over/underpredictions.

* **Our Model's Result:**  
  **{report['rmse']:.0f}**

### SMAPE (Symmetric Mean Absolute Percentage Error)
**What is it?**  
A percentage-based metric that normalizes errors symmetrically. Can appear high during low-volume hours (e.g., nights).

* **Our Model's Result:**  
  **{report['smape']*100:.1f}%**

* **Context:**  
  While the SMAPE ({report['smape']*100:.1f}%) might look high due to low-volume night hours, the Volume-Weighted Accuracy ({report['volume_weighted_accuracy']*100:.1f}%) confirms the system is reliable for high-capacity planning.

---

## 5. Performance by Segment

### Worst Performing Lines (High Volume Context)
High MAE often correlates with high passenger volume. Here is the context:

| Line | MAE | Avg Volume | Error Rate (NMAE) |
|------|-----|------------|-------------------|
{chr(10).join([f"| {line} | {stats['mae']:.0f} | {stats['mean_volume']:,.0f} | {stats['nmae']*100:.1f}% |" for line, stats in report['top10_worst_lines'].items()])}

### Performance by Hour of Day
The model shows varying accuracy across different hours:
{chr(10).join([f'- **Hour {hour}**: MAE = {mae_val:.1f}' for hour, mae_val in sorted(report['by_hour_mae'].items(), key=lambda x: int(x[0]))])}

---

## 6. Conclusion
This model demonstrates strong predictive performance with a **{report['volume_weighted_accuracy']*100:.1f}% accuracy rate** when weighted by passenger volume.  
The **{report['improvement_over_lag24_pct']:.1f}% improvement** over naive baseline methods validates the use of machine learning for public transportation demand forecasting.

**Tested on:** {report['n_samples']:,} samples  
**Prediction Time:** {report['prediction_time_sec']:.3f} seconds
"""

    markdown_path = REPORT_DIR / f"test_explanation_{model_name}.md"
    with open(markdown_path, 'w', encoding='utf-8') as f:
        f.write(markdown_report)
    
    print(f"✅ Human-readable report generated at {markdown_path}")


# ==============================================================================
# Script Entrypoint
# ==============================================================================


if __name__ == "__main__":
    # --- Argument Parsing ---
    # Allows specifying the model version to test from the command line.
    parser = argparse.ArgumentParser(
        description="Test a specific, trained model version against the unseen test set.",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "version",
        type=str,
        help="The model version to test (e.g., 'v1', 'v5').\n" 
             "This corresponds to the configuration file in 'src/model/config/'.",
    )
    args = parser.parse_args()

    main(args.version)
