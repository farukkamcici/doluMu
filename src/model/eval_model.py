"""
Unified model evaluation script for LightGBM crowding models.

Behavior:
- Discover ALL model files under /models (e.g. v1, v2, v3 ...)
- For EACH model:
    - If metrics/artifacts exist → load them
    - If some artifacts are missing → generate only the missing ones
- After all models are processed, generate a fresh global comparison
  (evaluation_summary_all.json/csv) that includes ALL models that have metrics
- Existing pairwise or older comparison files are NOT deleted

Expected per-model artifacts:
  reports/logs/metrics_<model>.json
  reports/logs/metrics_<model>.csv
  reports/logs/feature_importance_<model>.csv
  reports/figs/feature_importance_<model>.png
  reports/figs/shap_summary_<model>.png
"""

import json
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
import matplotlib.pyplot as plt
import shap

from utils.paths import SPLIT_FEATURES_DIR, MODEL_DIR, REPORT_DIR, FIG_DIR, ensure_dirs


# ============================================================
# Metric helpers
# ============================================================
def mae(y_true, y_pred):
    return float(np.mean(np.abs(y_true - y_pred)))


def rmse(y_true, y_pred):
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def smape(y_true, y_pred):
    return float(
        np.mean(2 * np.abs(y_true - y_pred) / (np.abs(y_true) + np.abs(y_pred) + 1e-8))
    )


def improvement(base, model):
    return float((base - model) / base * 100) if base else np.nan


# ============================================================
# Data loading
# ============================================================
def load_datasets():
    """Load pre-split train/validation feature sets."""
    train_df = pd.read_parquet(SPLIT_FEATURES_DIR / "train_features.parquet")
    val_df = pd.read_parquet(SPLIT_FEATURES_DIR / "val_features.parquet")
    print(f"Validation rows: {len(val_df):,}")
    return train_df, val_df


# ============================================================
# Baselines and helpers
# ============================================================
def denormalize_predictions(train_df, val_df, y_pred_norm):
    """Restore per-line normalized predictions to real scale."""
    stats = train_df.groupby("line_name")["y"].agg(["mean", "std"]).reset_index()
    merged = val_df[["line_name"]].merge(stats, on="line_name", how="left")
    line_mean = merged["mean"].values
    line_std = merged["std"].values + 1e-6
    return y_pred_norm * line_std + line_mean


def compute_baselines(train_df, val_df):
    """Compute lag_24h, lag_168h and line+hour mean baselines."""
    baseline_24 = val_df["lag_24h"]
    baseline_168 = val_df["lag_168h"]

    ref = (
        train_df.groupby(["line_name", "hour_of_day"])["y"]
        .mean()
        .reset_index()
        .rename(columns={"y": "mean_y_line_hour"})
    )
    val_df = val_df.merge(ref, on=["line_name", "hour_of_day"], how="left")
    baseline_linehour = val_df["mean_y_line_hour"]
    return val_df, baseline_24, baseline_168, baseline_linehour


def segment_eval(df, y_true, y_pred, col):
    """Compute MAE per segment in df[col]."""
    seg = {}
    for v in sorted(df[col].unique()):
        mask = df[col] == v
        seg[str(v)] = mae(y_true[mask], y_pred[mask])
    return seg


# ============================================================
# Artifact generators
# ============================================================
def generate_feature_importance(model, model_name, X_val):
    """Generate feature importance CSV + plot if missing."""
    csv_path = REPORT_DIR / f"feature_importance_{model_name}.csv"
    fig_path = FIG_DIR / f"feature_importance_{model_name}.png"

    if not csv_path.exists():
        importance = model.feature_importance(importance_type="gain")
        imp_df = pd.DataFrame(
            {"feature": X_val.columns, "importance": importance}
        ).sort_values("importance", ascending=False)
        imp_df.to_csv(csv_path, index=False)

    if not fig_path.exists():
        plt.figure(figsize=(8, 10))
        lgb.plot_importance(model, max_num_features=20, importance_type="gain")
        plt.title(f"Feature Importance — {model_name}")
        plt.tight_layout()
        plt.savefig(fig_path)
        plt.close()

    return csv_path, fig_path


def generate_shap(model, model_name, X_val):
    """Generate SHAP summary plot if missing."""
    shap_path = FIG_DIR / f"shap_summary_{model_name}.png"
    if shap_path.exists():
        return shap_path

    sample_size = min(5000, len(X_val))
    sample_X = X_val.sample(sample_size, random_state=42)

    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(sample_X)

    plt.figure()
    shap.summary_plot(shap_values, sample_X, max_display=20, show=False)
    plt.tight_layout()
    plt.savefig(shap_path)
    plt.close()
    return shap_path


# ============================================================
# Per-model evaluation (fresh)
# ============================================================
def evaluate_model_fresh(model_name, model, train_df, val_df):
    """
    Run full evaluation for a model and write JSON/CSV + artifacts.
    """
    # Prepare X, y
    X_val = val_df.drop(columns=["y"])
    y_val = val_df["y"]
    for c in ["line_name", "season"]:
        if c in X_val.columns:
            X_val[c] = X_val[c].astype("category")

    # Baselines
    val_df_bl, b24, b168, blinehour = compute_baselines(train_df, val_df)

    # Predict (normalized -> real)
    # start = time.time()
    # y_pred_norm = model.predict(X_val, num_iteration=model.best_iteration)
    # pred_time = time.time() - start
    # y_pred_real = denormalize_predictions(train_df, val_df, y_pred_norm)

    # Predict (real scale)
    start = time.time()
    y_pred_real = model.predict(X_val, num_iteration=model.best_iteration)
    pred_time = time.time() - start

    # Core metrics
    m = {
        "model_name": model_name,
        "timestamp": datetime.now().isoformat(),
        "n_samples": int(len(X_val)),
        "best_iteration": int(model.best_iteration),
        "num_features": int(model.num_feature()),
    }

    # Real-scale metrics
    m["mae"] = mae(y_val, y_pred_real)
    m["rmse"] = rmse(y_val, y_pred_real)
    m["smape"] = smape(y_val, y_pred_real)

    # Baseline metrics
    base_lag24_mae = mae(y_val, b24)
    base_linehour_mae = mae(y_val, blinehour)
    m["baseline_mae_lag24"] = base_lag24_mae
    m["baseline_mae_lag168"] = mae(y_val, b168)
    m["baseline_mae_linehour"] = base_linehour_mae

    # Improvements
    m["improvement_over_lag24"] = improvement(base_lag24_mae, m["mae"])
    m["improvement_over_linehour"] = improvement(base_linehour_mae, m["mae"])

    # Segment metrics
    m["by_hour"] = segment_eval(val_df_bl, y_val, y_pred_real, "hour_of_day")

    # Worst 10 lines
    worst_lines = (
        val_df.assign(err=np.abs(y_val - y_pred_real))
        .groupby("line_name")["err"]
        .mean()
        .sort_values(ascending=False)
        .head(10)
        .to_dict()
    )
    m["top10_worst_lines"] = {str(k): float(v) for k, v in worst_lines.items()}

    # Artifacts
    fi_csv, fi_plot = generate_feature_importance(model, model_name, X_val)
    shap_plot = generate_shap(model, model_name, X_val)

    m["feature_importance_csv"] = str(fi_csv)
    m["feature_importance_plot"] = str(fi_plot)
    m["shap_plot"] = str(shap_plot)
    m["prediction_time_sec"] = pred_time

    # Save
    metrics_json = REPORT_DIR / f"metrics_{model_name}.json"
    metrics_csv = REPORT_DIR / f"metrics_{model_name}.csv"
    metrics_json.write_text(json.dumps(m, indent=2))
    pd.DataFrame([m]).to_csv(metrics_csv, index=False)
    print(f"✅ created metrics for {model_name} → {metrics_json}")
    return m


# ============================================================
# Per-model completion (fill missing)
# ============================================================
def ensure_model_metrics_and_artifacts(model_file, train_df, val_df):
    """
    For a given model file, ensure that metrics JSON/CSV,
    feature importance CSV/PNG, and SHAP PNG exist.
    If metrics JSON exists, load it and only fill missing artifacts.
    """
    model_name = model_file.stem
    metrics_json = REPORT_DIR / f"metrics_{model_name}.json"

    # If metrics do not exist, run full eval
    if not metrics_json.exists():
        model = lgb.Booster(model_file=str(model_file))
        return evaluate_model_fresh(model_name, model, train_df, val_df)

    # If metrics exist, load them and check artifacts
    with open(metrics_json, "r") as f:
        m = json.load(f)

    # We still need X_val to generate missing artifacts
    val_df_local = val_df.copy()
    X_val = val_df_local.drop(columns=["y"])
    for c in ["line_name", "season"]:
        if c in X_val.columns:
            X_val[c] = X_val[c].astype("category")

    model = lgb.Booster(model_file=str(model_file))

    # feature importance
    fi_csv = REPORT_DIR / f"feature_importance_{model_name}.csv"
    fi_plot = FIG_DIR / f"feature_importance_{model_name}.png"
    if (not fi_csv.exists()) or (not fi_plot.exists()):
        fi_csv, fi_plot = generate_feature_importance(model, model_name, X_val)
        m["feature_importance_csv"] = str(fi_csv)
        m["feature_importance_plot"] = str(fi_plot)

    # shap
    shap_plot = FIG_DIR / f"shap_summary_{model_name}.png"
    if not shap_plot.exists():
        shap_plot = generate_shap(model, model_name, X_val)
        m["shap_plot"] = str(shap_plot)

    # persist updated metrics if modified
    (REPORT_DIR / f"metrics_{model_name}.json").write_text(json.dumps(m, indent=2))
    pd.DataFrame([m]).to_csv(REPORT_DIR / f"metrics_{model_name}.csv", index=False)
    print(f"ℹ︎ updated existing metrics for {model_name}")
    return m


# ============================================================
# Global comparison
# ============================================================
def write_global_comparison(all_metrics):
    """Write one global comparison file that contains ALL models' metrics."""
    df = pd.DataFrame(all_metrics)
    summary_csv = REPORT_DIR / "evaluation_summary_all.csv"
    summary_json = REPORT_DIR / "evaluation_summary_all.json"
    df.to_csv(summary_csv, index=False)
    summary_json.write_text(json.dumps(all_metrics, indent=2))
    print(f"\n📊 global comparison written → {summary_csv}")


# ============================================================
# Main
# ============================================================
def main():
    ensure_dirs()

    train_df, val_df = load_datasets()

    # discover ALL model files
    model_files = sorted(MODEL_DIR.glob("*.txt"))
    if not model_files:
        print("No model files found in /models. Nothing to evaluate.")
        return

    all_metrics = []
    for model_file in model_files:
        print(f"\n=== processing model: {model_file.name} ===")
        m = ensure_model_metrics_and_artifacts(model_file, train_df, val_df)
        all_metrics.append(m)

    # After all models are normalized/completed, write a new global comparison
    if all_metrics:
        write_global_comparison(all_metrics)

    print("\n✅ evaluation finished for all models.")


if __name__ == "__main__":
    main()


