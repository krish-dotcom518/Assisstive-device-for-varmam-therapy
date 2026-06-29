import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score
)

df = pd.read_csv(
    "preprocessed_mlp_dataset.csv"
)

X = df.drop(
    "weight_g",
    axis=1
)

y = df["weight_g"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42
)

model = MLPRegressor(
    hidden_layer_sizes=(256,128,64),
    activation="relu",
    solver="adam",
    learning_rate_init=0.001,
    max_iter=1000,
    random_state=42
)

model.fit(
    X_train,
    y_train
)

pred = model.predict(
    X_test
)

print("\n========== METRICS ==========")

print(
    "MAE:",
    mean_absolute_error(
        y_test,
        pred
    )
)

print(
    "RMSE:",
    mean_squared_error(
        y_test,
        pred
    )**0.5
)

print(
    "R²:",
    r2_score(
        y_test,
        pred
    )
)

print("\n========== EXAMPLES ==========")

for i in range(10):
    print(
        f"Actual: {y_test.iloc[i]:.2f} g"
        f" | Predicted: {pred[i]:.2f} g"
    )

joblib.dump(
    model,
    "weight_prediction_mlp.pkl"
)

print(
    "\nModel Saved."
)