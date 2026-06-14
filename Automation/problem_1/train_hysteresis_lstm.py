import json
import numpy as np
import pandas as pd

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

# =====================================================
# LOAD JSON
# =====================================================

with open("varmamDB.sessions.json", "r", encoding="utf-8") as f:
    sessions = json.load(f)

frames = []
targets = []

# =====================================================
# EXTRACT MATRIX + AVG_FORCE
# =====================================================

for session in sessions:

    readings = session.get("readings", [])

    readings.sort(
        key=lambda r: r["time"]["$date"]
    )

    for r in readings:

        matrix = r.get("matrix", [])

        if len(matrix) != 64:
            continue

        frames.append(matrix)

        targets.append(
            r.get("avg_force", 0)
        )

frames = np.array(frames, dtype=np.float32)
targets = np.array(targets, dtype=np.float32)

print("Frames Shape:", frames.shape)

# =====================================================
# CREATE 6-FRAME SEQUENCES
# =====================================================

X = []
y = []

for i in range(5, len(frames)):

    sequence = frames[i-5:i+1]

    X.append(sequence)

    y.append(targets[i])

X = np.array(X)
y = np.array(y)

print("X Shape:", X.shape)
print("Y Shape:", y.shape)

# =====================================================
# TRAIN / TEST SPLIT
# =====================================================

split = int(len(X) * 0.8)

X_train = X[:split]
X_test = X[split:]

y_train = y[:split]
y_test = y[split:]

# =====================================================
# LSTM MODEL
# =====================================================

model = Sequential([

    LSTM(
        128,
        input_shape=(6, 64),
        return_sequences=True
    ),

    Dropout(0.2),

    LSTM(
        64,
        return_sequences=False
    ),

    Dense(
        64,
        activation="relu"
    ),

    Dense(
        32,
        activation="relu"
    ),

    Dense(
        1,
        activation="linear"
    )
])

model.compile(
    optimizer="adam",
    loss="mse",
    metrics=["mae"]
)

model.summary()

# =====================================================
# TRAIN
# =====================================================

early_stop = EarlyStopping(
    monitor="val_loss",
    patience=10,
    restore_best_weights=True
)

history = model.fit(
    X_train,
    y_train,
    validation_split=0.2,
    epochs=100,
    batch_size=16,
    callbacks=[early_stop]
)

# =====================================================
# TEST
# =====================================================

loss, mae = model.evaluate(
    X_test,
    y_test
)

print("\nTest MAE =", mae)

# =====================================================
# SAVE MODEL
# =====================================================

model.save(
    "varmam_hysteresis_lstm.keras"
)

print("\nModel saved as varmam_hysteresis_lstm.keras")