import pandas as pd
import joblib

model = joblib.load(
    "weight_prediction_mlp.pkl"
)

df = pd.read_csv(
    "preprocessed_mlp_dataset.csv"
)

sample = df.drop(
    "weight_g",
    axis=1
).iloc[-1:]

prediction = model.predict(
    sample
)

print(
    "Predicted Weight:",
    prediction[0],
    "g"
)