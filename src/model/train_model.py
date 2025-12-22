"""
Train LightGBM models for the Istanbul Transit Crowding project.

v5 Update: This script runs Time-Series Cross-Validation (TSCV)
to validate parameters and log the average MAE to MLflow.
It then trains ONE final model on all data and saves it.

Usage:
  python src/model/train_model.py --version v7
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import lightgbm as lgb
import mlflow
import mlflow.lightgbm
import numpy as np
import pandas as pd
import yaml
from sklearn.model_selection import TimeSeriesSplit

from utils.config_loader import load_config
from utils.paths import MODEL_DIR, SPLIT_FEATURES_DIR, ensure_dirs


# === MLflow Setup  ===
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MLFLOW_DIR = PROJECT_ROOT / "mlruns"
mlflow.set_tracking_uri(f"file://{MLFLOW_DIR}")
mlflow.set_experiment("IstanbulCrowdingForecast")


def load_and_sort_all_data(cfg: dict) -> pd.DataFrame | None:
    """
    Loads, merges, and time-sorts all data for TSCV.
    """
    print("Loading and merging 'train' and 'val' features...")
    try:
        train_df = pd.read_parquet(SPLIT_FEATURES_DIR / "train_features.parquet")
        val_df = pd.read_parquet(SPLIT_FEATURES_DIR / "val_features.parquet")
        full_df = pd.concat([train_df, val_df], ignore_index=True)
    except Exception as e:
        print(f"ERROR: Could not read data files. Error: {e}")
        return None

    print(f"Total {len(full_df)} rows loaded.")

    sort_col = cfg["train"]["datetime_sort_col"]
    if sort_col not in full_df.columns:
        print(f"ERROR: '{sort_col}' column not found for sorting.")
        return None

    print(f"Sorting data by '{sort_col}'...")
    return full_df.sort_values(by=sort_col).reset_index(drop=True)


def save_final_model(model: lgb.Booster, cfg: dict) -> Path:
    """Save final trained model to /models directory."""
    ensure_dirs()
    model_name = cfg["model"]["final_model_name"]
    model_path = MODEL_DIR / model_name
    model.save_model(str(model_path), num_iteration=model.best_iteration)
    print(f"Final model saved -> {model_path}")
    return model_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--version",
        default="v6",
        help="Model config version to train (e.g. v6, v7). Default: v6",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.version)

    print(f"\n=== Starting {cfg['model']['name']} Training with TSCV ===")
    start_time = time.time()

    full_df = load_and_sort_all_data(cfg)
    if full_df is None:
        return

    # Get categorical features from common.yaml (shared across versions)
    with open(PROJECT_ROOT / "src/model/config/common.yaml") as f:
        common_cfg = yaml.safe_load(f)
    common_cat_features = common_cfg["features"]["categorical"]

    features = cfg["features"]["all"]
    cat_features = common_cat_features
    target_col = cfg["train"]["target_col"]

    for col in cat_features:
        if col in full_df.columns:
            full_df[col] = full_df[col].astype("category")

    X_all = full_df[features]
    y_all = full_df[target_col]

    n_splits = cfg["train"]["n_splits"]
    tscv = TimeSeriesSplit(n_splits=n_splits)
    fold_scores: list[float] = []

    with mlflow.start_run(run_name=f"{cfg['model']['name']}_TSCV") as parent_run:
        print(f"MLflow Parent Run started (ID: {parent_run.info.run_id})")
        mlflow.log_params(cfg["params"])
        mlflow.log_param("n_splits", n_splits)
        mlflow.log_param("config_name", cfg["model"]["name"])

        print(f"Running {n_splits}-Fold TSCV for validation...")
        last_val_index = None
        for fold, (train_index, val_index) in enumerate(tscv.split(X_all)):
            last_val_index = val_index
            print(f"--- Fold {fold + 1}/{n_splits} ---")

            with mlflow.start_run(run_name=f"Fold_{fold+1}", nested=True):
                X_train, X_val = X_all.iloc[train_index], X_all.iloc[val_index]
                y_train, y_val = y_all.iloc[train_index], y_all.iloc[val_index]

                mlflow.log_params({"fold": fold + 1, "train_rows": len(X_train), "val_rows": len(X_val)})

                train_set = lgb.Dataset(X_train, label=y_train, categorical_feature=cat_features)
                val_set = lgb.Dataset(X_val, label=y_val, categorical_feature=cat_features, reference=train_set)

                model = lgb.train(
                    cfg["params"],
                    train_set,
                    num_boost_round=cfg["model"]["num_boost_round"],
                    valid_sets=[train_set, val_set],
                    valid_names=["train", "valid"],
                    callbacks=[
                        lgb.early_stopping(cfg["train"]["early_stopping_rounds"]),
                        lgb.log_evaluation(cfg["train"]["eval_freq"]),
                    ],
                )

                fold_mae = model.best_score["valid"]["l1"]
                fold_scores.append(float(fold_mae))
                mlflow.log_metric("fold_mae", float(fold_mae))
                mlflow.log_metric("best_iteration", int(model.best_iteration))
                print(f"  Fold {fold + 1} MAE: {fold_mae:.2f}")

        if last_val_index is None:
            print("ERROR: TSCV did not produce any folds.")
            return

        avg_mae = float(np.mean(fold_scores))
        print("\n--- TSCV Complete ---")
        print(f"Average 'Honest' MAE: {avg_mae:.2f}")
        mlflow.log_metric("avg_mae_tscv", avg_mae)

        print("\nTraining final model on all data...")

        final_train_idx = X_all.index.difference(last_val_index)
        final_val_idx = last_val_index

        X_train_final = X_all.iloc[final_train_idx]
        y_train_final = y_all.iloc[final_train_idx]
        X_val_final = X_all.iloc[final_val_idx]
        y_val_final = y_all.iloc[final_val_idx]

        train_set_final = lgb.Dataset(X_train_final, label=y_train_final, categorical_feature=cat_features)
        val_set_final = lgb.Dataset(X_val_final, label=y_val_final, categorical_feature=cat_features, reference=train_set_final)

        final_model = lgb.train(
            cfg["params"],
            train_set_final,
            num_boost_round=cfg["model"]["num_boost_round"],
            valid_sets=[val_set_final],
            valid_names=["valid"],
            callbacks=[
                lgb.early_stopping(cfg["train"]["early_stopping_rounds"]),
                lgb.log_evaluation(cfg["train"]["eval_freq"]),
            ],
        )

        model_path = save_final_model(final_model, cfg)
        mlflow.lightgbm.log_model(final_model, name="final_model")
        mlflow.log_artifact(str(model_path))
        print(f"✅ Training finished — best_iteration={final_model.best_iteration}")

    print(f"\nTotal script time: {(time.time() - start_time) / 60:.2f} minutes.")
    print("MLflow run logged successfully.\n")


if __name__ == "__main__":
    main()
