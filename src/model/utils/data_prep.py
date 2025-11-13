import numpy as np
import pandas as pd
import lightgbm as lgb

# === Outlier filter ===
def cap_outliers(df, col="y", z_thresh=3.0):
    df[col] = df[col].astype(float)
    def _cap(x):
        mean, std = x.mean(), x.std() + 1e-6
        z = np.abs((x - mean) / std)
        capped = mean + np.sign(x - mean) * z_thresh * std
        return np.where(z > z_thresh, capped, x)
    df[col] = df.groupby("line_name")[col].transform(_cap)
    return df

# === Line-based normalization ===
def normalize_by_line(df):
    df["y_norm"] = df.groupby("line_name")["y"].transform(
        lambda x: (x - x.mean()) / (x.std() + 1e-6)
    )
    return df

# === Prepare train/val ===
def prepare_data(train_df, val_df, cfg):
    """Aykırı değer kırpma, normalize etme, dataset objeleri oluşturma"""
    from .paths import SPLIT_FEATURES_DIR

    z_thresh = cfg["features"]["outlier_cap_z"]
    target_col = cfg["features"]["target"]
    cat_cols = cfg["features"]["categorical"]

    # Aykırı ve normalize
    train_df = cap_outliers(train_df, "y", z_thresh)
    val_df = cap_outliers(val_df, "y", z_thresh)

    if cfg["features"]["normalize_by_line"]:
        train_df = normalize_by_line(train_df)
        val_df = normalize_by_line(val_df)

        X_train = train_df.drop(columns=["y", target_col])
        y_train = train_df[target_col]
        X_val = val_df.drop(columns=["y", target_col])
        y_val = val_df[target_col]
    else:
        X_train = train_df.drop(columns=[target_col])
        y_train = train_df[target_col]
        X_val = val_df.drop(columns=[target_col])
        y_val = val_df[target_col]


    for c in cat_cols:
        if c in X_train.columns:
            X_train[c] = X_train[c].astype("category")
        if c in X_val.columns:
            X_val[c] = X_val[c].astype("category")

    train_set = lgb.Dataset(X_train, label=y_train, categorical_feature=cat_cols)
    val_set = lgb.Dataset(X_val, label=y_val, categorical_feature=cat_cols, reference=train_set)
    return X_train, y_train, X_val, y_val, train_set, val_set
