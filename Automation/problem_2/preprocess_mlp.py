import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler
import joblib

df = pd.read_csv(
    "varmam_conductance_ml_dataset.csv"
)

print("Original:", df.shape)

df = df.drop_duplicates()
df = df.fillna(0)

# ==========================
# Active Pixel Count
# ==========================

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

# ==========================
# State Encoding
# ==========================

encoder = LabelEncoder()

df["state_encoded"] = (
    encoder.fit_transform(
        df["state_label"].astype(str)
    )
)

joblib.dump(
    encoder,
    "state_encoder.pkl"
)

# ==========================
# Conductance Features
# ==========================

g_cols = [
    f"g{i}"
    for i in range(64)
]

df["g_mean"] = df[g_cols].mean(axis=1)
df["g_max"] = df[g_cols].max(axis=1)
df["g_min"] = df[g_cols].min(axis=1)
df["g_std"] = df[g_cols].std(axis=1)
df["g_sum"] = df[g_cols].sum(axis=1)

feature_cols = (
    g_cols
    + [
        "active_pixel_count",
        "active_ratio",
        "state_encoded",
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
    "mlp_scaler.pkl"
)

final_df = df[
    feature_cols
    + ["weight_g"]
]

final_df.to_csv(
    "preprocessed_mlp_dataset.csv",
    index=False
)

print(final_df.head())
print("Shape:", final_df.shape)