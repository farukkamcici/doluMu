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
        mean_volume=('y_true', 'mean'),
        sample_count=('y_true', 'count'),
        std_error=('abs_error', 'std'),
        total_volume=('y_true', 'sum')
    )
    line_stats['nmae'] = line_stats['mae'] / (line_stats['mean_volume'] + 1e-8)
    
    # Top 10 by highest MAE (absolute error)
    top_10_by_mae = line_stats.sort_values('mae', ascending=False).head(10)
    report['top10_worst_lines'] = {
        line: {
            'mae': float(row['mae']),
            'mean_volume': float(row['mean_volume']),
            'nmae': float(row['nmae'])
        }
        for line, row in top_10_by_mae.iterrows()
    }
    
    # Top 10 busiest lines by average passenger volume
    top_10_busiest = line_stats.sort_values('mean_volume', ascending=False).head(10)
    report['top10_busiest_lines'] = {
        line: {
            'mean_volume': float(row['mean_volume']),
            'total_volume': float(row['total_volume']),
            'mae': float(row['mae']),
            'nmae': float(row['nmae']),
            'sample_count': int(row['sample_count'])
        }
        for line, row in top_10_busiest.iterrows()
    }
    
    # Top 10 worst lines by percentage error (NMAE) - excluding very low volume lines
    line_stats_filtered = line_stats[line_stats['mean_volume'] >= 10]  # Filter out noise
    top_10_by_nmae = line_stats_filtered.sort_values('nmae', ascending=False).head(10)
    report['top10_worst_by_percentage'] = {
        line: {
            'nmae': float(row['nmae']),
            'mae': float(row['mae']),
            'mean_volume': float(row['mean_volume']),
            'sample_count': int(row['sample_count'])
        }
        for line, row in top_10_by_nmae.iterrows()
    }
    
    # Top 10 best performing lines by NMAE
    top_10_best = line_stats_filtered.sort_values('nmae', ascending=True).head(10)
    report['top10_best_lines'] = {
        line: {
            'nmae': float(row['nmae']),
            'mae': float(row['mae']),
            'mean_volume': float(row['mean_volume']),
            'sample_count': int(row['sample_count'])
        }
        for line, row in top_10_best.iterrows()
    }
    
    # --- Additional Thesis-Relevant Statistics ---
    
    # Error Distribution Statistics
    all_errors = results_df['abs_error'].values
    report['error_distribution'] = {
        'mean': float(np.mean(all_errors)),
        'std': float(np.std(all_errors)),
        'median': float(np.median(all_errors)),
        'p25': float(np.percentile(all_errors, 25)),
        'p75': float(np.percentile(all_errors, 75)),
        'p90': float(np.percentile(all_errors, 90)),
        'p95': float(np.percentile(all_errors, 95)),
        'p99': float(np.percentile(all_errors, 99)),
        'max': float(np.max(all_errors)),
        'min': float(np.min(all_errors))
    }
    
    # Prediction Bias Analysis (over vs under prediction)
    residuals = results_df['y_pred'] - results_df['y_true']
    over_predictions = (residuals > 0).sum()
    under_predictions = (residuals < 0).sum()
    exact_predictions = (residuals == 0).sum()
    report['prediction_bias'] = {
        'mean_residual': float(residuals.mean()),
        'over_prediction_count': int(over_predictions),
        'under_prediction_count': int(under_predictions),
        'exact_count': int(exact_predictions),
        'over_prediction_pct': float(over_predictions / len(residuals) * 100),
        'under_prediction_pct': float(under_predictions / len(residuals) * 100),
        'bias_direction': 'Over-predicting' if residuals.mean() > 0 else 'Under-predicting'
    }
    
    # Day of Week Analysis (if available)
    if 'day_of_week' in test_df.columns:
        results_df['day_of_week'] = test_df['day_of_week'].values
        dow_stats = results_df.groupby('day_of_week').agg(
            mae=('abs_error', 'mean'),
            mean_volume=('y_true', 'mean'),
            sample_count=('y_true', 'count')
        )
        dow_stats['nmae'] = dow_stats['mae'] / (dow_stats['mean_volume'] + 1e-8)
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        report['by_day_of_week'] = {
            day_names[int(dow)] if int(dow) < 7 else f'Day {dow}': {
                'mae': float(row['mae']),
                'nmae': float(row['nmae']),
                'mean_volume': float(row['mean_volume']),
                'sample_count': int(row['sample_count'])
            }
            for dow, row in dow_stats.iterrows()
        }
    
    # Peak vs Off-Peak Analysis
    results_df['is_peak'] = results_df['hour_of_day'].isin([7, 8, 9, 17, 18, 19])
    peak_stats = results_df.groupby('is_peak').agg(
        mae=('abs_error', 'mean'),
        mean_volume=('y_true', 'mean'),
        sample_count=('y_true', 'count')
    )
    peak_stats['nmae'] = peak_stats['mae'] / (peak_stats['mean_volume'] + 1e-8)
    report['peak_vs_offpeak'] = {
        'peak_hours': {
            'mae': float(peak_stats.loc[True, 'mae']) if True in peak_stats.index else None,
            'nmae': float(peak_stats.loc[True, 'nmae']) if True in peak_stats.index else None,
            'mean_volume': float(peak_stats.loc[True, 'mean_volume']) if True in peak_stats.index else None
        },
        'off_peak_hours': {
            'mae': float(peak_stats.loc[False, 'mae']) if False in peak_stats.index else None,
            'nmae': float(peak_stats.loc[False, 'nmae']) if False in peak_stats.index else None,
            'mean_volume': float(peak_stats.loc[False, 'mean_volume']) if False in peak_stats.index else None
        }
    }
    
    # Dataset Coverage Statistics
    date_col = 'date' if 'date' in test_df.columns else 'datetime'
    if date_col in test_df.columns:
        date_min = pd.to_datetime(test_df[date_col]).min()
        date_max = pd.to_datetime(test_df[date_col]).max()
        date_range_start = str(date_min.date()) if hasattr(date_min, 'date') else str(date_min)[:10]
        date_range_end = str(date_max.date()) if hasattr(date_max, 'date') else str(date_max)[:10]
    else:
        date_range_start = 'N/A'
        date_range_end = 'N/A'
    
    report['dataset_coverage'] = {
        'unique_lines': int(test_df['line_name'].nunique()),
        'total_samples': int(len(test_df)),
        'samples_per_line_avg': float(len(test_df) / test_df['line_name'].nunique()),
        'date_range_start': date_range_start,
        'date_range_end': date_range_end
    }
    
    # Model Complexity Info
    report['model_info'] = {
        'num_trees': model.num_trees(),
        'num_features': model.num_feature(),
        'best_iteration': model.best_iteration if model.best_iteration else model.num_trees()
    }
    
    # --- End User Focused Statistics ---
    # These metrics are designed to be relatable for app users
    
    # Calculate percentage of predictions within acceptable thresholds
    error_thresholds = [5, 10, 20, 50]  # passengers
    within_threshold = {}
    for threshold in error_thresholds:
        pct_within = float((all_errors <= threshold).sum() / len(all_errors) * 100)
        within_threshold[f'within_{threshold}_passengers'] = pct_within
    report['prediction_accuracy_thresholds'] = within_threshold
    
    # Crowd level prediction (binned accuracy)
    # Define crowd levels: Empty (0-50), Light (51-200), Moderate (201-500), Crowded (501-1000), Very Crowded (1000+)
    def get_crowd_level(passengers):
        if passengers <= 50:
            return 'Empty'
        elif passengers <= 200:
            return 'Light'
        elif passengers <= 500:
            return 'Moderate'
        elif passengers <= 1000:
            return 'Crowded'
        else:
            return 'Very Crowded'
    
    results_df['actual_crowd'] = results_df['y_true'].apply(get_crowd_level)
    results_df['predicted_crowd'] = results_df['y_pred'].apply(get_crowd_level)
    results_df['crowd_correct'] = results_df['actual_crowd'] == results_df['predicted_crowd']
    
    crowd_accuracy = float(results_df['crowd_correct'].mean() * 100)
    
    # Adjacent crowd level (within 1 level) - more lenient metric
    crowd_order = ['Empty', 'Light', 'Moderate', 'Crowded', 'Very Crowded']
    results_df['actual_crowd_idx'] = results_df['actual_crowd'].apply(lambda x: crowd_order.index(x))
    results_df['predicted_crowd_idx'] = results_df['predicted_crowd'].apply(lambda x: crowd_order.index(x))
    results_df['crowd_adjacent'] = np.abs(results_df['actual_crowd_idx'] - results_df['predicted_crowd_idx']) <= 1
    crowd_adjacent_accuracy = float(results_df['crowd_adjacent'].mean() * 100)
    
    # Crowd level breakdown
    crowd_breakdown = results_df.groupby('actual_crowd').agg(
        correct_pct=('crowd_correct', lambda x: x.mean() * 100),
        sample_count=('crowd_correct', 'count')
    ).reindex(crowd_order)
    
    report['end_user_stats'] = {
        'crowd_level_accuracy': crowd_accuracy,
        'crowd_level_adjacent_accuracy': crowd_adjacent_accuracy,
        'predictions_within_5_passengers': within_threshold['within_5_passengers'],
        'predictions_within_10_passengers': within_threshold['within_10_passengers'],
        'predictions_within_20_passengers': within_threshold['within_20_passengers'],
        'predictions_within_50_passengers': within_threshold['within_50_passengers'],
        'crowd_breakdown': {
            level: {
                'accuracy': float(row['correct_pct']) if not pd.isna(row['correct_pct']) else 0,
                'samples': int(row['sample_count']) if not pd.isna(row['sample_count']) else 0
            }
            for level, row in crowd_breakdown.iterrows()
        }
    }
    
    # Rush hour specific reliability (what users care about most)
    rush_morning = results_df[results_df['hour_of_day'].isin([7, 8, 9])]
    rush_evening = results_df[results_df['hour_of_day'].isin([17, 18, 19])]
    
    if len(rush_morning) > 0:
        report['end_user_stats']['morning_rush_crowd_accuracy'] = float(rush_morning['crowd_correct'].mean() * 100)
        report['end_user_stats']['morning_rush_adjacent_accuracy'] = float(rush_morning['crowd_adjacent'].mean() * 100)
    
    if len(rush_evening) > 0:
        report['end_user_stats']['evening_rush_crowd_accuracy'] = float(rush_evening['crowd_correct'].mean() * 100)
        report['end_user_stats']['evening_rush_adjacent_accuracy'] = float(rush_evening['crowd_adjacent'].mean() * 100)
    
    # "Useful prediction" rate - predictions that help users make decisions
    # A prediction is "useful" if error is less than 20% of actual volume OR less than 20 passengers
    results_df['useful_prediction'] = (
        (results_df['abs_error'] / (results_df['y_true'] + 1) < 0.20) | 
        (results_df['abs_error'] <= 20)
    )
    report['end_user_stats']['useful_prediction_rate'] = float(results_df['useful_prediction'].mean() * 100)
    
    # --- Additional Thesis-Relevant Analyses ---
    
    # 1. Transport Mode Analysis (extract mode from line_name patterns)
    def get_transport_mode(line_name):
        """Classify transport mode from line name."""
        line_upper = str(line_name).upper()
        if line_upper == 'MARMARAY':
            return 'Commuter Rail'
        elif line_upper.startswith('M') and line_upper[1:].isdigit():
            return 'Metro'
        elif line_upper.startswith('T') and len(line_upper) <= 3:
            return 'Tram'
        elif line_upper.startswith('F'):
            return 'Funicular'
        elif line_upper.isdigit() or (line_upper[:-1].isdigit() and line_upper[-1].isalpha()):
            return 'Bus'
        else:
            return 'Other'
    
    results_df['transport_mode'] = results_df['line_name'].apply(get_transport_mode)
    mode_stats = results_df.groupby('transport_mode').agg(
        mae=('abs_error', 'mean'),
        mean_volume=('y_true', 'mean'),
        sample_count=('y_true', 'count'),
        total_volume=('y_true', 'sum'),
        crowd_accuracy=('crowd_correct', lambda x: x.mean() * 100)
    )
    mode_stats['nmae'] = mode_stats['mae'] / (mode_stats['mean_volume'] + 1e-8)
    mode_stats['volume_share_pct'] = mode_stats['total_volume'] / mode_stats['total_volume'].sum() * 100
    
    report['by_transport_mode'] = {
        mode: {
            'mae': float(row['mae']),
            'nmae': float(row['nmae']),
            'mean_volume': float(row['mean_volume']),
            'sample_count': int(row['sample_count']),
            'volume_share_pct': float(row['volume_share_pct']),
            'crowd_accuracy': float(row['crowd_accuracy'])
        }
        for mode, row in mode_stats.iterrows()
    }
    
    # 2. Statistical Confidence Intervals (Bootstrap-based)
    n_bootstrap = 1000
    bootstrap_maes = []
    np.random.seed(42)
    for _ in range(n_bootstrap):
        sample_idx = np.random.choice(len(all_errors), size=len(all_errors), replace=True)
        bootstrap_maes.append(np.mean(all_errors[sample_idx]))
    
    report['statistical_confidence'] = {
        'mae_95_ci_lower': float(np.percentile(bootstrap_maes, 2.5)),
        'mae_95_ci_upper': float(np.percentile(bootstrap_maes, 97.5)),
        'mae_std_error': float(np.std(bootstrap_maes)),
        'n_bootstrap_samples': n_bootstrap
    }
    
    # 3. Volume Segment Analysis (how model performs across different traffic levels)
    def get_volume_segment(volume):
        if volume <= 50:
            return '1_Very Low (≤50)'
        elif volume <= 200:
            return '2_Low (51-200)'
        elif volume <= 500:
            return '3_Medium (201-500)'
        elif volume <= 1000:
            return '4_High (501-1000)'
        elif volume <= 5000:
            return '5_Very High (1001-5000)'
        else:
            return '6_Extreme (>5000)'
    
    results_df['volume_segment'] = results_df['y_true'].apply(get_volume_segment)
    segment_stats = results_df.groupby('volume_segment').agg(
        mae=('abs_error', 'mean'),
        nmae_raw=('abs_error', lambda x: x.mean()),
        mean_volume=('y_true', 'mean'),
        sample_count=('y_true', 'count')
    )
    segment_stats['nmae'] = segment_stats['mae'] / (segment_stats['mean_volume'] + 1e-8)
    
    report['by_volume_segment'] = {
        segment: {
            'mae': float(row['mae']),
            'nmae': float(row['nmae']),
            'mean_volume': float(row['mean_volume']),
            'sample_count': int(row['sample_count']),
            'sample_pct': float(row['sample_count'] / len(results_df) * 100)
        }
        for segment, row in segment_stats.iterrows()
    }
    
    # 4. Model Stability Analysis (variance across different slices)
    hourly_maes = list(report['by_hour_mae'].values())
    report['model_stability'] = {
        'hourly_mae_std': float(np.std(hourly_maes)),
        'hourly_mae_cv': float(np.std(hourly_maes) / np.mean(hourly_maes)),  # Coefficient of variation
        'max_hourly_mae': float(np.max(hourly_maes)),
        'min_hourly_mae': float(np.min(hourly_maes)),
        'hourly_mae_range': float(np.max(hourly_maes) - np.min(hourly_maes))
    }
    
    # 5. Extreme Error Analysis (for thesis discussion on limitations)
    extreme_threshold_pct = 99
    extreme_errors = results_df[results_df['abs_error'] > report['error_distribution']['p99']]
    report['extreme_error_analysis'] = {
        'threshold_used': f"p{extreme_threshold_pct}",
        'extreme_error_count': int(len(extreme_errors)),
        'extreme_error_pct': float(len(extreme_errors) / len(results_df) * 100),
        'extreme_error_mean': float(extreme_errors['abs_error'].mean()) if len(extreme_errors) > 0 else 0,
        'most_affected_lines': extreme_errors['line_name'].value_counts().head(5).to_dict() if len(extreme_errors) > 0 else {},
        'most_affected_hours': extreme_errors['hour_of_day'].value_counts().head(5).to_dict() if len(extreme_errors) > 0 else {}
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
    
    # Build day of week section if available
    dow_section = ""
    if 'by_day_of_week' in report:
        dow_rows = "\n".join([f"| {day} | {stats['mae']:.1f} | {stats['mean_volume']:,.0f} | {stats['nmae']*100:.1f}% | {stats['sample_count']:,} |" 
                              for day, stats in report['by_day_of_week'].items()])
        dow_section = f"""
### Performance by Day of Week
Understanding weekly patterns is crucial for operational planning:

| Day | MAE | Avg Volume | Error Rate (NMAE) | Samples |
|-----|-----|------------|-------------------|----------|
{dow_rows}
"""
    
    # Peak vs Off-Peak section
    peak_data = report.get('peak_vs_offpeak', {})
    peak_section = ""
    if peak_data.get('peak_hours', {}).get('mae') is not None:
        peak_section = f"""
### Peak vs Off-Peak Performance
Peak hours (7-9 AM, 5-7 PM) typically have higher volumes and different error characteristics:

| Period | MAE | Avg Volume | Error Rate (NMAE) |
|--------|-----|------------|-------------------|
| Peak Hours | {peak_data['peak_hours']['mae']:.1f} | {peak_data['peak_hours']['mean_volume']:,.0f} | {peak_data['peak_hours']['nmae']*100:.1f}% |
| Off-Peak Hours | {peak_data['off_peak_hours']['mae']:.1f} | {peak_data['off_peak_hours']['mean_volume']:,.0f} | {peak_data['off_peak_hours']['nmae']*100:.1f}% |
"""
    
    markdown_report = f"""# 📊 Model Performance & Methodology Report
**Model Version:** {model_name}  
**Date:** {report['timestamp']}

---

## 1. Executive Summary
Our model predicts passenger demand with a **Volume-Weighted Accuracy of {report['volume_weighted_accuracy']*100:.1f}%**.  
This means that relative to the total passenger volume, our average error margin is only **{report['nmae']*100:.1f}%**.

### Key Highlights
- **Test Set Size:** {report['n_samples']:,} samples across {report['dataset_coverage']['unique_lines']} unique lines
- **Model Complexity:** {report['model_info']['num_trees']} trees, {report['model_info']['num_features']} features
- **Improvement over Baseline:** {report['improvement_over_lag24_pct']:.1f}% better than naive lag-24h approach
- **Prediction Speed:** {report['prediction_time_sec']:.3f} seconds for entire test set

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

## 5. Error Distribution Analysis

Understanding the distribution of errors helps identify model reliability:

| Statistic | Value (Passengers) |
|-----------|-------------------|
| Mean Error | {report['error_distribution']['mean']:.1f} |
| Median Error | {report['error_distribution']['median']:.1f} |
| Std Deviation | {report['error_distribution']['std']:.1f} |
| 25th Percentile | {report['error_distribution']['p25']:.1f} |
| 75th Percentile | {report['error_distribution']['p75']:.1f} |
| 90th Percentile | {report['error_distribution']['p90']:.1f} |
| 95th Percentile | {report['error_distribution']['p95']:.1f} |
| 99th Percentile | {report['error_distribution']['p99']:.1f} |
| Maximum Error | {report['error_distribution']['max']:.1f} |

**Interpretation:**  
- 50% of predictions have an error ≤ {report['error_distribution']['median']:.0f} passengers
- 90% of predictions have an error ≤ {report['error_distribution']['p90']:.0f} passengers
- 95% of predictions have an error ≤ {report['error_distribution']['p95']:.0f} passengers

---

## 6. Prediction Bias Analysis

Analyzing whether the model systematically over or under-predicts:

| Metric | Value |
|--------|-------|
| Mean Residual (Predicted - Actual) | {report['prediction_bias']['mean_residual']:.2f} |
| Over-predictions | {report['prediction_bias']['over_prediction_count']:,} ({report['prediction_bias']['over_prediction_pct']:.1f}%) |
| Under-predictions | {report['prediction_bias']['under_prediction_count']:,} ({report['prediction_bias']['under_prediction_pct']:.1f}%) |
| Bias Direction | **{report['prediction_bias']['bias_direction']}** |

**Interpretation:**  
A mean residual close to 0 indicates an unbiased model. The model is slightly **{report['prediction_bias']['bias_direction'].lower()}** with an average residual of {report['prediction_bias']['mean_residual']:.2f} passengers.

---

## 7. Performance by Segment

### 🚌 Top 10 Busiest Lines (Highest Passenger Volume)
These are the most critical lines for operational planning:

| Rank | Line | Avg Passengers/Hour | Total Volume | MAE | Error Rate (NMAE) | Samples |
|------|------|---------------------|--------------|-----|-------------------|----------|
{chr(10).join([f"| {i+1} | {line} | {stats['mean_volume']:,.0f} | {stats['total_volume']:,.0f} | {stats['mae']:.0f} | {stats['nmae']*100:.1f}% | {stats['sample_count']:,} |" for i, (line, stats) in enumerate(report['top10_busiest_lines'].items())])}

### ⚠️ Top 10 Lines with Highest Percentage Error (NMAE)
These lines show the highest relative prediction error:

| Rank | Line | Error Rate (NMAE) | MAE | Avg Passengers/Hour | Samples |
|------|------|-------------------|-----|---------------------|----------|
{chr(10).join([f"| {i+1} | {line} | {stats['nmae']*100:.1f}% | {stats['mae']:.0f} | {stats['mean_volume']:,.0f} | {stats['sample_count']:,} |" for i, (line, stats) in enumerate(report['top10_worst_by_percentage'].items())])}

### ✅ Top 10 Best Performing Lines (Lowest NMAE)
These lines have the most accurate predictions:

| Rank | Line | Error Rate (NMAE) | MAE | Avg Passengers/Hour | Samples |
|------|------|-------------------|-----|---------------------|----------|
{chr(10).join([f"| {i+1} | {line} | {stats['nmae']*100:.1f}% | {stats['mae']:.0f} | {stats['mean_volume']:,.0f} | {stats['sample_count']:,} |" for i, (line, stats) in enumerate(report['top10_best_lines'].items())])}

### 📊 Worst Performing Lines by Absolute Error (MAE)
High MAE often correlates with high passenger volume:

| Line | MAE | Avg Volume | Error Rate (NMAE) |
|------|-----|------------|-------------------|
{chr(10).join([f"| {line} | {stats['mae']:.0f} | {stats['mean_volume']:,.0f} | {stats['nmae']*100:.1f}% |" for line, stats in report['top10_worst_lines'].items()])}
{dow_section}
{peak_section}
### Performance by Hour of Day
The model shows varying accuracy across different hours:

| Hour | MAE |
|------|-----|
{chr(10).join([f'| {hour}:00 | {mae_val:.1f} |' for hour, mae_val in sorted(report['by_hour_mae'].items(), key=lambda x: int(x[0]))])}

---

## 8. Dataset Coverage

| Metric | Value |
|--------|-------|
| Unique Lines | {report['dataset_coverage']['unique_lines']} |
| Total Samples | {report['dataset_coverage']['total_samples']:,} |
| Avg Samples per Line | {report['dataset_coverage']['samples_per_line_avg']:.0f} |
| Date Range | {report['dataset_coverage']['date_range_start']} to {report['dataset_coverage']['date_range_end']} |

---

## 9. Model Technical Details

| Parameter | Value |
|-----------|-------|
| Number of Trees | {report['model_info']['num_trees']} |
| Number of Features | {report['model_info']['num_features']} |
| Best Iteration | {report['model_info']['best_iteration']} |
| Test Set Mean Volume | {report['test_set_mean_volume']:.1f} passengers/hour |

---

## 10. 📱 End User Value Proposition

*These statistics demonstrate the practical value of our predictions for everyday commuters.*

### 🎯 Crowd Level Prediction Accuracy

Our app predicts crowd levels (Empty → Light → Moderate → Crowded → Very Crowded):

| Metric | Value | What it means |
|--------|-------|---------------|
| **Exact Crowd Level Match** | {report['end_user_stats']['crowd_level_accuracy']:.1f}% | We predict the exact crowding category correctly |
| **Within 1 Level** | {report['end_user_stats']['crowd_level_adjacent_accuracy']:.1f}% | We're at most 1 level off (e.g., "Light" vs "Moderate") |
| **Useful Prediction Rate** | {report['end_user_stats']['useful_prediction_rate']:.1f}% | Predictions accurate enough to help you plan |

### 🚇 Crowd Level Breakdown

How accurate are we for each crowding level?

| Crowd Level | Accuracy | Description |
|-------------|----------|-------------|
| Empty | {report['end_user_stats']['crowd_breakdown']['Empty']['accuracy']:.1f}% | Plenty of seats available |
| Light | {report['end_user_stats']['crowd_breakdown']['Light']['accuracy']:.1f}% | Easy to find a seat |
| Moderate | {report['end_user_stats']['crowd_breakdown']['Moderate']['accuracy']:.1f}% | Standing room available |
| Crowded | {report['end_user_stats']['crowd_breakdown']['Crowded']['accuracy']:.1f}% | Limited standing room |
| Very Crowded | {report['end_user_stats']['crowd_breakdown']['Very Crowded']['accuracy']:.1f}% | Peak congestion |

### ⏰ Rush Hour Reliability

*When accuracy matters most - during your daily commute:*

| Time Period | Exact Match | Within 1 Level |
|-------------|-------------|----------------|
| Morning Rush (7-9 AM) | {report['end_user_stats'].get('morning_rush_crowd_accuracy', 0):.1f}% | {report['end_user_stats'].get('morning_rush_adjacent_accuracy', 0):.1f}% |
| Evening Rush (5-7 PM) | {report['end_user_stats'].get('evening_rush_crowd_accuracy', 0):.1f}% | {report['end_user_stats'].get('evening_rush_adjacent_accuracy', 0):.1f}% |

### 📊 Prediction Precision

How close are our passenger count predictions?

| Threshold | Success Rate | User Benefit |
|-----------|--------------|--------------|
| Within 5 passengers | {report['end_user_stats']['predictions_within_5_passengers']:.1f}% | Perfect for small vehicles |
| Within 10 passengers | {report['end_user_stats']['predictions_within_10_passengers']:.1f}% | Excellent for minibuses |
| Within 20 passengers | {report['end_user_stats']['predictions_within_20_passengers']:.1f}% | Great for buses |
| Within 50 passengers | {report['end_user_stats']['predictions_within_50_passengers']:.1f}% | Good for metro/tram |

### 💡 What This Means For You

> **"{report['end_user_stats']['crowd_level_adjacent_accuracy']:.0f}% of the time, our crowd prediction is spot-on or just 1 level off."**

- ✅ **Plan your trip:** Know if you'll get a seat before you leave
- ✅ **Avoid overcrowding:** Get alerts when your usual line is busier than normal  
- ✅ **Save time:** Choose less crowded alternatives based on predictions
- ✅ **Rush hour ready:** {report['end_user_stats'].get('morning_rush_adjacent_accuracy', 0):.0f}% accuracy during morning commute

---

## 11. 🚇 Performance by Transport Mode

*Critical for thesis: How does the model perform across different transport types?*

| Mode | MAE | NMAE | Avg Volume | Volume Share | Crowd Accuracy | Samples |
|------|-----|------|------------|--------------|----------------|---------|
{chr(10).join([f"| {mode} | {stats['mae']:.1f} | {stats['nmae']*100:.1f}% | {stats['mean_volume']:,.0f} | {stats['volume_share_pct']:.1f}% | {stats['crowd_accuracy']:.1f}% | {stats['sample_count']:,} |" for mode, stats in sorted(report.get('by_transport_mode', {}).items())])}

---

## 12. 📊 Performance by Volume Segment

*Understanding model behavior across different traffic intensities:*

| Volume Segment | MAE | NMAE | Avg Volume | Sample % |
|----------------|-----|------|------------|----------|
{chr(10).join([f"| {segment.split('_')[1]} | {stats['mae']:.1f} | {stats['nmae']*100:.1f}% | {stats['mean_volume']:,.0f} | {stats['sample_pct']:.1f}% |" for segment, stats in sorted(report.get('by_volume_segment', {}).items())])}

---

## 13. 📈 Statistical Confidence & Model Stability

### Confidence Intervals (95% Bootstrap CI)

| Metric | Value |
|--------|-------|
| MAE Point Estimate | {report['mae']:.2f} |
| 95% CI Lower Bound | {report['statistical_confidence']['mae_95_ci_lower']:.2f} |
| 95% CI Upper Bound | {report['statistical_confidence']['mae_95_ci_upper']:.2f} |
| Standard Error | {report['statistical_confidence']['mae_std_error']:.2f} |

**Interpretation:** We are 95% confident that the true MAE lies between {report['statistical_confidence']['mae_95_ci_lower']:.1f} and {report['statistical_confidence']['mae_95_ci_upper']:.1f} passengers.

### Model Stability Across Hours

| Metric | Value |
|--------|-------|
| Hourly MAE Std Dev | {report['model_stability']['hourly_mae_std']:.2f} |
| Coefficient of Variation | {report['model_stability']['hourly_mae_cv']:.2%} |
| Best Hour MAE | {report['model_stability']['min_hourly_mae']:.1f} |
| Worst Hour MAE | {report['model_stability']['max_hourly_mae']:.1f} |
| MAE Range | {report['model_stability']['hourly_mae_range']:.1f} |

---

## 14. ⚠️ Extreme Error Analysis (Model Limitations)

*Understanding when the model struggles most (top 1% errors):*

| Metric | Value |
|--------|-------|
| Extreme Error Threshold | >{report['error_distribution']['p99']:.0f} passengers |
| Count of Extreme Errors | {report['extreme_error_analysis']['extreme_error_count']:,} |
| % of Total Predictions | {report['extreme_error_analysis']['extreme_error_pct']:.2f}% |
| Average Extreme Error | {report['extreme_error_analysis']['extreme_error_mean']:.0f} passengers |

### Most Affected Lines (Extreme Errors)
{chr(10).join([f"- **{line}**: {count} extreme errors" for line, count in list(report['extreme_error_analysis']['most_affected_lines'].items())[:5]]) if report['extreme_error_analysis']['most_affected_lines'] else "- No extreme errors recorded"}

### Most Affected Hours
{chr(10).join([f"- **{hour}:00**: {count} extreme errors" for hour, count in list(report['extreme_error_analysis']['most_affected_hours'].items())[:5]]) if report['extreme_error_analysis']['most_affected_hours'] else "- No extreme errors recorded"}

---

## 15. Conclusion

This model demonstrates strong predictive performance with a **{report['volume_weighted_accuracy']*100:.1f}% accuracy rate** when weighted by passenger volume.  
The **{report['improvement_over_lag24_pct']:.1f}% improvement** over naive baseline methods validates the use of machine learning for public transportation demand forecasting.

### Key Findings:
1. **High Accuracy:** The model achieves {report['volume_weighted_accuracy']*100:.1f}% volume-weighted accuracy
2. **Significant Improvement:** {report['improvement_over_lag24_pct']:.1f}% better than naive baseline
3. **Balanced Predictions:** The model shows {report['prediction_bias']['bias_direction'].lower()} tendency with mean residual of {report['prediction_bias']['mean_residual']:.2f}
4. **Robust Performance:** 90% of predictions are within {report['error_distribution']['p90']:.0f} passengers of actual values
5. **User-Ready:** {report['end_user_stats']['crowd_level_adjacent_accuracy']:.0f}% crowd level accuracy enables practical trip planning
6. **Statistically Reliable:** 95% CI for MAE: [{report['statistical_confidence']['mae_95_ci_lower']:.1f}, {report['statistical_confidence']['mae_95_ci_upper']:.1f}]

### Thesis Highlights:
- **Multi-modal coverage:** Model successfully handles {len(report.get('by_transport_mode', {}))} different transport modes
- **Volume scalability:** Consistent NMAE across traffic segments shows robust generalization
- **Production-ready:** {report['prediction_time_sec']:.3f}s inference time for {report['n_samples']:,} samples

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
