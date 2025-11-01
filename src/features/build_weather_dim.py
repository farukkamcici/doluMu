import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry
cache_session = requests_cache.CachedSession('../../data/cache', expire_after=1)
retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
openmeteo = openmeteo_requests.Client(session =retry_session)

url = "https://archive-api.open-meteo.com/v1/archive"
latitude, longitude = 41.0082, 28.9784
variables = ["temperature_2m", "precipitation", "wind_speed_10m"]
timezone = "Europe/Istanbul"

batches = [
    ("2022-01-01", "2022-12-31"),
    ("2023-01-01", "2023-12-31"),
    ("2024-01-01", "2024-09-30")
]

all_frames = []

for start_date, end_date in batches:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": variables,
        "timezone": timezone
    }

    print(f"Fetching weather data for {start_date} to {end_date}")
    responses = openmeteo.weather_api(url, params=params)
    r = responses[0]
    hourly = r.Hourly()

    hourly_Data = {
        "datetime": pd.date_range(
            start=pd.to_datetime(hourly.Time(), unit="s"),
            end=pd.to_datetime(hourly.TimeEnd(), unit="s"),
            freq=pd.Timedelta(seconds=hourly.Interval()),
            inclusive="left"
        ),
        "temperature_2m": hourly.Variables(0).ValuesAsNumpy(),
        "precipitation": hourly.Variables(1).ValuesAsNumpy(),
        "wind_speed_10m": hourly.Variables(2).ValuesAsNumpy()
    }

    df = pd.DataFrame(hourly_Data)
    all_frames.append(df)

weather_df = pd.concat(all_frames).reset_index(drop=True)

weather_df.to_parquet("../../data/processed/weather_dim.parquet")

print(f"Toplam kayıt: {len(weather_df)} satır ({weather_df['datetime'].min()} → {weather_df['datetime'].max()})")
