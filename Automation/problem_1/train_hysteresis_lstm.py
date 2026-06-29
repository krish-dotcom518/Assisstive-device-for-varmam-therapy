import numpy as np

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (
    LSTM,
    Dense,
    Dropout
)
from tensorflow.keras.callbacks import (
    EarlyStopping
)

X = np.load(
    "X_hysteresis.npy"
)

y = np.load(
    "y_hysteresis.npy"
)

print("X:", X.shape)
print("y:", y.shape)

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    shuffle=False
)

model = Sequential([

    LSTM(
        128,
        return_sequences=True,
        input_shape=(
            X.shape[1],
            X.shape[2]
        )
    ),

    Dropout(0.2),

    LSTM(
        64
    ),

    Dropout(0.2),

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
    batch_size=32,
    callbacks=[early_stop]
)

pred = model.predict(
    X_test
).flatten()

print(
    "\nMAE:",
    mean_absolute_error(
        y_test,
        pred
    )
)

print(
    "RMSE:",
    np.sqrt(
        mean_squared_error(
            y_test,
            pred
        )
    )
)

print(
    "R2:",
    r2_score(
        y_test,
        pred
    )
)

model.save(
    "hysteresis_compensation_lstm.keras"
)

print(
    "\nModel saved."
)