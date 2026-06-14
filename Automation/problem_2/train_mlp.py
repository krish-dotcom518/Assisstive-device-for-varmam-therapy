import pandas as pd
import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense
from tensorflow.keras.callbacks import EarlyStopping

# =====================================================
# LOAD DATASET
# =====================================================

df = pd.read_csv(
    "varmam_mass_dataset.csv"
)

# =====================================================
# FEATURES
# =====================================================

X = df[
    [f"adc{i}" for i in range(1,65)]
].values

# =====================================================
# TARGET
# =====================================================

y = df[
    "estimated_mass_g"
].values

# =====================================================
# NORMALIZE
# =====================================================

scaler = MinMaxScaler()

X = scaler.fit_transform(X)

# =====================================================
# SPLIT
# =====================================================

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

# =====================================================
# MODEL
# =====================================================

model = Sequential([

    Dense(
        128,
        activation="relu",
        input_shape=(64,)
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
# EVALUATE
# =====================================================

loss, mae = model.evaluate(
    X_test,
    y_test
)

print("\nTest MAE:", mae)

# =====================================================
# SAVE
# =====================================================

model.save(
    "mass_predictor.keras"
)

print(
    "\nModel Saved: mass_predictor.keras"
)