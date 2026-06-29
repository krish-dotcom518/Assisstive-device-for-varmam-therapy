import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
import joblib

df = pd.read_csv("varmam_conductance_ml_dataset.csv")

print("Original Shape:", df.shape)

df = df.drop_duplicates()
df = df.fillna(0)

# Timestamp
df["timestamp"] = pd.to_numeric(
    df["timestamp"],
    errors="coerce"
).fillna(0)

df = df.sort_values(
    ["cycle_number", "timestamp"]
)

# Delta time
df["delta_t"] = (
    df.groupby("cycle_number")["timestamp"]
      .diff()
      .fillna(0)
)

# Encode state
encoder = LabelEncoder()

df["state_encoded"] = encoder.fit_transform(
    df["state_label"].astype(str)
)

joblib.dump(
    encoder,
    "state_encoder.pkl"
)

# Active pixels
def count_pixels(x):
    x = str(x)

    if x in ["[]", "", "nan"]:
        return 0

    x = x.strip("[]")

    if x == "":
        return 0

    return len(x.split(";"))

df["active_pixel_count"] = (
    df["active_pixels"]
      .apply(count_pixels)
)

df["active_ratio"] = (
    df["active_pixel_count"] / 64.0
)

# Conductance columns
g_cols = [
    f"g{i}"
    for i in range(64)
]

# Statistical features
df["g_mean"] = df[g_cols].mean(axis=1)
df["g_max"] = df[g_cols].max(axis=1)
df["g_min"] = df[g_cols].min(axis=1)
df["g_std"] = df[g_cols].std(axis=1)
df["g_sum"] = df[g_cols].sum(axis=1)

# Pseudo load cell force
df["target_force_N"] = (
    df["weight_g"] / 1000.0
) * 9.81

# Normalize features
feature_cols = (
    g_cols
    + [
        "delta_t",
        "state_encoded",
        "active_pixel_count",
        "active_ratio",
        "g_mean",
        "g_max",
        "g_min",
        "g_std",
        "g_sum"
    ]
)

scaler = StandardScaler()

df[feature_cols] = scaler.fit_transform(
    df[feature_cols]
)

joblib.dump(
    scaler,
    "hysteresis_scaler.pkl"
)

final_columns = (
    [
        "timestamp",
        "cycle_number",
        "weight_g",
        "target_force_N"
    ]
    + feature_cols
)

df = df[final_columns]

df.to_csv(
    "preprocessed_hysteresis_dataset.csv",
    index=False
)

print(df.head())
print(df.shape)