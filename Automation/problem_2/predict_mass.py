import numpy as np
import pandas as pd

from tensorflow.keras.models import load_model
from sklearn.preprocessing import MinMaxScaler

# Load dataset scaler
df = pd.read_csv(
    "varmam_mass_dataset.csv"
)

X = df[
    [f"adc{i}" for i in range(1,65)]
].values

scaler = MinMaxScaler()
scaler.fit(X)

# Load trained model
model = load_model(
    "mass_predictor.keras"
)

# Example matrix (replace with real values)
matrix = np.random.randint(
    0,
    1023,
    64
)

matrix = matrix.reshape(1,64)

matrix = scaler.transform(matrix)

prediction = model.predict(
    matrix,
    verbose=0
)

print(
    f"Estimated Mass = {prediction[0][0]:.2f} g"
)