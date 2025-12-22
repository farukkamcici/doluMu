"""Shared constants for API business rules."""

METROBUS_CODE = "METROBUS"

# Metrobus variants that should be pooled into one virtual line.
METROBUS_POOL = ["34", "34A", "34AS", "34BZ", "34C", "34G", "34Z"]

# Fixed per-vehicle capacity for metrobus (used in pooled capacity calculations).
METROBUS_CAPACITY = 193

# When schedule is unavailable, fall back to a non-zero capacity to avoid
# division-by-zero and infinite occupancy in clients.
METROBUS_MIN_TRIPS_FALLBACK = 6

