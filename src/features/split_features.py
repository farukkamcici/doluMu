from __future__ import annotations

from pathlib import Path

import pandas as pd
import yaml


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FILTER_CFG_PATH = PROJECT_ROOT / "config" / "data_filters.yaml"


def load_filter_cfg() -> dict:
    if not FILTER_CFG_PATH.exists():
        return {"exclude_road_types": [], "exclude_line_names": []}

    with open(FILTER_CFG_PATH, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    return {
        "exclude_road_types": cfg.get("exclude_road_types", []) or [],
        "exclude_line_names": cfg.get("exclude_line_names", []) or [],
    }


def apply_line_filters(features: pd.DataFrame) -> pd.DataFrame:
    cfg = load_filter_cfg()
    exclude_road_types = set(cfg["exclude_road_types"])
    exclude_line_names = set(cfg["exclude_line_names"])

    if not exclude_road_types and not exclude_line_names:
        return features

    filtered = features
    if exclude_line_names:
        filtered = filtered[~filtered["line_name"].isin(exclude_line_names)]

    # Only load/merge metadata if we actually need road_type filtering.
    if exclude_road_types:
        meta_path = PROJECT_ROOT / "data" / "processed" / "transport_meta.parquet"
        meta = pd.read_parquet(meta_path, columns=["line_name", "road_type"])
        meta = meta.drop_duplicates(subset=["line_name"])

        merged = filtered.merge(meta, on="line_name", how="left")
        merged = merged[~merged["road_type"].isin(exclude_road_types)]
        return merged.drop(columns=["road_type"], errors="ignore")

    return filtered


def main() -> None:
    features_path = PROJECT_ROOT / "data" / "processed" / "features_pd.parquet"
    features = pd.read_parquet(features_path)

    features["datetime"] = pd.to_datetime(features["datetime"])
    features = apply_line_filters(features)

    train_df = features[features["datetime"] <= "2024-04-30"]
    val_df = features[(features["datetime"] > "2024-04-30") & (features["datetime"] <= "2024-06-30")]
    test_df = features[features["datetime"] > "2024-06-30"]

    train_df = train_df.drop(columns=["year"], errors="ignore")
    val_df = val_df.drop(columns=["year"], errors="ignore")
    test_df = test_df.drop(columns=["year"], errors="ignore")

    out_dir = PROJECT_ROOT / "data" / "processed" / "split_features"
    out_dir.mkdir(parents=True, exist_ok=True)

    train_df.to_parquet(out_dir / "train_features.parquet", index=False)
    val_df.to_parquet(out_dir / "val_features.parquet", index=False)
    test_df.to_parquet(out_dir / "test_features.parquet", index=False)

    print("✅ Split features written:")
    print(f"  train: {len(train_df):,} rows")
    print(f"  val:   {len(val_df):,} rows")
    print(f"  test:  {len(test_df):,} rows")


if __name__ == "__main__":
    main()
