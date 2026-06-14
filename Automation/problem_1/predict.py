import numpy as np
from tensorflow.keras.models import load_model

model = load_model(
    "varmam_hysteresis_lstm.keras"
)

# Replace with your latest 6 sensor frames
sequence = np.random.rand(6,64)

sequence = sequence.reshape(
    1,
    6,
    64
)

prediction = model.predict(
    sequence,
    verbose=0
)

print(
    "Predicted Force:",
    prediction[0][0]
)