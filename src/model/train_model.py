"""
Train LightGBM models for the Istanbul Transit Crowding project.

This script:
 - Loads train/validation data
 - Builds LightGBM datasets
 - Trains the model according to YAML configuration
 - Logs all parameters and artifacts to MLflow
 - Saves the trained model
"""

from pathlib import Path
import pandas as pd
import lightgbm as lgb
import mlflow
import mlflow.lightgbm

from utils.paths import SPLIT_FEATURES_DIR, MODEL_DIR, ensure_dirs
from utils.data_prep import prepare_data
from utils.config_loader import load_config


# === Load configuration ===
CFG = load_config("v2")  # choose model version


# === Force MLflow to use a consistent local directory ===
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MLFLOW_DIR = PROJECT_ROOT / "mlruns"
mlflow.set_tracking_uri(f"file://{MLFLOW_DIR}")
mlflow.set_experiment("IstanbulCrowdingForecast")


# === Data loading ===
def load_data():
    """Load preprocessed training and validation feature datasets."""
    train_df = pd.read_parquet(SPLIT_FEATURES_DIR / "train_features.parquet")
    val_df = pd.read_parquet(SPLIT_FEATURES_DIR / "val_features.parquet")
    print(f"Train shape: {train_df.shape}, Val shape: {val_df.shape}")
    return train_df, val_df


# === Model training ===
def train_model(train_set, val_set):
    """Train LightGBM model using parameters from config."""
    params = CFG["params"]
    model = lgb.train(
        params,
        train_set,
        num_boost_round=CFG["model"]["num_boost_round"],
        valid_sets=[train_set, val_set],
        valid_names=["train", "valid"],
        callbacks=[
            # lgb.early_stopping(CFG["train"]["early_stopping_rounds"]),
            lgb.log_evaluation(CFG["train"]["eval_freq"]),
        ],
    )
    return model


# === Save model ===
def save_model(model):
    """Save trained model to /models directory."""
    ensure_dirs()
    model_name = CFG["model"]["name"]
    model_path = MODEL_DIR / f"{model_name}.txt"
    model.save_model(str(model_path), num_iteration=model.best_iteration)
    print(f"Model saved → {model_path}")



# === Main pipeline ===
def main():
    print(f"\n=== Training {CFG['model']['name']} ===")

    # Load datasets
    train_df, val_df = load_data()
    X_train, y_train, X_val, y_val, train_set, val_set = prepare_data(train_df, val_df, CFG)

    # Start MLflow run
    with mlflow.start_run(run_name=CFG["model"]["name"]):
        # Log parameters
        mlflow.log_params(CFG["params"])
        mlflow.log_param("num_boost_round", CFG["model"]["num_boost_round"])

        # Train model
        model = train_model(train_set, val_set)

        # Log trained model as artifact
        mlflow.lightgbm.log_model(
            model,
            name="model",
        )

        # Log key metadata
        mlflow.log_metric("best_iteration", model.best_iteration)
        mlflow.log_param("num_features", model.num_feature())
        if "valid" in model.best_score:
            mlflow.log_metric("val_mae_l1", model.best_score["valid"]["l1"])
            mlflow.log_metric("val_mse_l2", model.best_score["valid"]["l2"])

        # Save local model file
        save_model(model)

    print(f"✅ Training finished — best_iteration={model.best_iteration}")
    print("MLflow run logged successfully.\n")


if __name__ == "__main__":
    main()



#----DART v3------------------------------------------------


"""
Train LightGBM DART model for the Istanbul Transit Crowding project.

This script:
 - Loads train/validation data
 - Builds LightGBM datasets
 - Trains the model according to YAML configuration
 - Logs parameters and metrics to MLflow
 - Saves the trained model
"""

# from pathlib import Path
# import pandas as pd
# import lightgbm as lgb
# import mlflow
# import mlflow.lightgbm
#
# from utils.paths import SPLIT_FEATURES_DIR, MODEL_DIR, ensure_dirs
# from utils.data_prep import prepare_data
# from utils.config_loader import load_config
#
#
# # === Load configuration ===
# CFG = load_config("v3")  # choose model version
#
#
# # === MLflow setup ===
# PROJECT_ROOT = Path(__file__).resolve().parents[2]
# MLFLOW_DIR = PROJECT_ROOT / "mlruns"
# mlflow.set_tracking_uri(f"file://{MLFLOW_DIR}")
# mlflow.set_experiment("IstanbulCrowdingForecast")
#
#
# # === Data loading ===
# def load_data():
#     """Load preprocessed training and validation feature datasets."""
#     train_df = pd.read_parquet(SPLIT_FEATURES_DIR / "train_features.parquet")
#     val_df = pd.read_parquet(SPLIT_FEATURES_DIR / "val_features.parquet")
#     print(f"Train shape: {train_df.shape}, Val shape: {val_df.shape}")
#     return train_df, val_df
#
#
# # === Model training ===
# def train_model(train_set, val_set):
#     """Train LightGBM DART model using parameters from YAML."""
#     params = CFG["params"]
#     model = lgb.train(
#         params,
#         train_set,
#         num_boost_round=CFG["model"]["num_boost_round"],
#         valid_sets=[train_set, val_set],
#         valid_names=["train", "valid"],
#         callbacks=[
#             # early stopping yok → DART desteklemiyor
#             lgb.log_evaluation(CFG["train"]["eval_freq"]),
#         ],
#     )
#     return model
#
#
# # === Save model ===
# def save_model(model):
#     """Save trained model to /models directory."""
#     ensure_dirs()
#     model_name = CFG["model"]["name"]
#     model_path = MODEL_DIR / f"{model_name}.txt"
#     model.save_model(str(model_path))
#     print(f"Model saved → {model_path}")
#
#
# # === Main pipeline ===
# def main():
#     print(f"\n=== Training {CFG['model']['name']} (DART) ===")
#
#     # Load datasets
#     train_df, val_df = load_data()
#     X_train, y_train, X_val, y_val, train_set, val_set = prepare_data(train_df, val_df, CFG)
#
#     # Start MLflow run
#     with mlflow.start_run(run_name=CFG["model"]["name"]):
#         # Log configuration
#         mlflow.log_params(CFG["params"])
#         mlflow.log_param("num_boost_round", CFG["model"]["num_boost_round"])
#
#         # Train
#         model = train_model(train_set, val_set)
#
#         # Log model + metadata
#         mlflow.lightgbm.log_model(model, name="model")
#         mlflow.log_param("num_features", model.num_feature())
#
#         # Log validation metrics if available
#         if "valid" in model.best_score:
#             mlflow.log_metric("val_l1", model.best_score["valid"]["l1"])
#             mlflow.log_metric("val_l2", model.best_score["valid"]["l2"])
#
#         # Save model locally
#         save_model(model)
#
#     print("✅ Training finished successfully.")
#     print("MLflow run logged.\n")
#
#
# if __name__ == "__main__":
#     main()