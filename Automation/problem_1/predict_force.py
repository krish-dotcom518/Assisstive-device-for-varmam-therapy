import numpy as np
from tensorflow.keras.models import load_model

model = load_model(
    "hysteresis_compensation_lstm.keras"
)

X = np.load(
    "X_hysteresis.npy"
)

sample = X[-1:]

prediction = model.predict(
    sample,
    verbose=0
)

print(
    "Predicted Force:",
    prediction[0][0],
    "N"
)
