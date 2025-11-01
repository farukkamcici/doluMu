import polars as pl

features = pl.read_parquet("../../data/processed/features_pl.parquet")

features.to_pandas().to_parquet("../../data/processed/features_pd.parquet", index=False)