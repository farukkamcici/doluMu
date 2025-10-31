import pandas as pd

weather_df = pd.read_parquet("../../data/processed/weather_dim.parquet")

weather_df = weather_df.round(
    {
        "temperature_2m": 1,
        "precipitation": 2,
        "wind_speed_10m": 1
    }
)

weather_df.to_parquet("../../data/processed/weather_dim.parquet", index=False)