import pandas as pd
import numpy as np

df = pd.read_csv(
    "preprocessed_hysteresis_dataset.csv"
)

feature_cols = (
    [f"g{i}" for i in range(64)]
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

X = df[feature_cols].values
y = df["target_force_N"].values

sequence_length = 6

X_seq = []
y_seq = []

for cycle in df["cycle_number"].unique():

    cycle_df = (
        df[df["cycle_number"] == cycle]
        .reset_index(drop=True)
    )

    X_cycle = cycle_df[
        feature_cols
    ].values

    y_cycle = cycle_df[
        "target_force_N"
    ].values

    for i in range(
        sequence_length,
        len(cycle_df)
    ):

        X_seq.append(
            X_cycle[
                i-sequence_length:i
            ]
        )

        y_seq.append(
            y_cycle[i]
        )

X_seq = np.array(X_seq)
y_seq = np.array(y_seq)

np.save(
    "X_hysteresis.npy",
    X_seq
)

np.save(
    "y_hysteresis.npy",
    y_seq
)

print("X:", X_seq.shape)
print("y:", y_seq.shape)