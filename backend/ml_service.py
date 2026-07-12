import os
import numpy as np
import pandas as pd
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
from tensorflow.keras.models import load_model

app = Flask(__name__)
CORS(app)

# Paths to models
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Load models and scalers
print("Loading Machine Learning Models...")
try:
    mlp_model = joblib.load(os.path.join(MODELS_DIR, "weight_prediction_mlp.pkl"))
    mlp_scaler = joblib.load(os.path.join(MODELS_DIR, "mlp_scaler.pkl"))
    state_encoder_mlp = joblib.load(os.path.join(MODELS_DIR, "state_encoder_mlp.pkl"))
    print("MLP Model loaded successfully")
except Exception as e:
    print(f"Error loading MLP: {e}")
    mlp_model = None

try:
    lstm_model = load_model(os.path.join(MODELS_DIR, "hysteresis_compensation_lstm.keras"))
    lstm_scaler = joblib.load(os.path.join(MODELS_DIR, "hysteresis_scaler.pkl"))
    state_encoder_lstm = joblib.load(os.path.join(MODELS_DIR, "state_encoder_lstm.pkl"))
    print("LSTM Model loaded successfully")
except Exception as e:
    print(f"Error loading LSTM: {e}")
    lstm_model = None

# Sliding window history buffer per session for the LSTM model
# Structure: { sessionId: [ feature_vector_1, feature_vector_2, ... ] }
session_histories = {}
MAX_SEQ_LENGTH = 6

def compute_features(matrix, state_label):
    """
    Computes statistical and status features from raw 64 conductance values
    """
    matrix_arr = np.array(matrix, dtype=float)
    g_mean = float(np.mean(matrix_arr))
    g_max = float(np.max(matrix_arr))
    g_min = float(np.min(matrix_arr))
    g_std = float(np.std(matrix_arr))
    g_sum = float(np.sum(matrix_arr))
    
    # Active pixels count (> 5.0 threshold)
    active_pixel_count = int(np.sum(matrix_arr > 5.0))
    active_ratio = float(active_pixel_count / 64.0)
    
    # State encoding
    state_lbl = str(state_label) if state_label else "steady"
    
    try:
        state_encoded_mlp = int(state_encoder_mlp.transform([state_lbl])[0])
    except Exception:
        state_encoded_mlp = 0
        
    try:
        state_encoded_lstm = int(state_encoder_lstm.transform([state_lbl])[0])
    except Exception:
        state_encoded_lstm = 0
        
    return {
        "g_mean": g_mean,
        "g_max": g_max,
        "g_min": g_min,
        "g_std": g_std,
        "g_sum": g_sum,
        "active_pixel_count": active_pixel_count,
        "active_ratio": active_ratio,
        "state_encoded_mlp": state_encoded_mlp,
        "state_encoded_lstm": state_encoded_lstm
    }

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "online",
        "mlp_ready": mlp_model is not None,
        "lstm_ready": lstm_model is not None
    })

@app.route("/predict", methods=["POST"])
def predict():
    data = request.json or {}
    matrix = data.get("matrix")
    delta_t = float(data.get("delta_t", 0.2))  # default 200ms
    state_label = data.get("state_label", "steady")
    session_id = data.get("sessionId", "default")
    
    if not matrix or len(matrix) != 64:
        return jsonify({"error": "Invalid matrix shape, expected 64 values"}), 400
        
    # 1. Compute common features
    feats = compute_features(matrix, state_label)
    
    # 2. MLP Inference (Weight prediction)
    predicted_weight = 0.0
    if mlp_model and mlp_scaler:
        try:
            # Build feature array in same order as preprocess_mlp.py
            # order: g0..g63, active_pixel_count, active_ratio, state_encoded, g_mean, g_max, g_min, g_std, g_sum
            mlp_features = (
                list(matrix) + 
                [
                    feats["active_pixel_count"],
                    feats["active_ratio"],
                    feats["state_encoded_mlp"],
                    feats["g_mean"],
                    feats["g_max"],
                    feats["g_min"],
                    feats["g_std"],
                    feats["g_sum"]
                ]
            )
            # Scale features
            scaled_mlp = mlp_scaler.transform([mlp_features])
            mlp_pred = mlp_model.predict(scaled_mlp)
            predicted_weight = float(mlp_pred[0])
            # Ensure predicted weight isn't negative
            predicted_weight = max(0.0, predicted_weight)
        except Exception as e:
            print(f"MLP prediction error: {e}")
            
    # 3. LSTM Inference (Drift-compensated Force prediction)
    predicted_force = 0.0
    if lstm_model and lstm_scaler:
        try:
            # Build current feature step in same order as preprocess_hysteresis.py
            # order: g0..g63, delta_t, state_encoded, active_pixel_count, active_ratio, g_mean, g_max, g_min, g_std, g_sum
            lstm_step_features = (
                list(matrix) + 
                [
                    delta_t,
                    feats["state_encoded_lstm"],
                    feats["active_pixel_count"],
                    feats["active_ratio"],
                    feats["g_mean"],
                    feats["g_max"],
                    feats["g_min"],
                    feats["g_std"],
                    feats["g_sum"]
                ]
            )
            
            # Maintain sliding window history for this session
            if session_id not in session_histories:
                session_histories[session_id] = []
                
            history = session_histories[session_id]
            history.append(lstm_step_features)
            
            # Keep only the last 6 steps
            if len(history) > MAX_SEQ_LENGTH:
                history.pop(0)
                
            # If sequence is not full yet, pad by repeating the first step
            padded_seq = list(history)
            while len(padded_seq) < MAX_SEQ_LENGTH:
                padded_seq.insert(0, lstm_step_features)
                
            # Scale the entire sequence step-by-step
            # Standard Scaler transform expect shape (N_samples, N_features)
            scaled_seq = lstm_scaler.transform(padded_seq)
            
            # Reshape scaled sequence to (1, sequence_length, features)
            input_seq = np.expand_dims(scaled_seq, axis=0)
            
            # Run model prediction
            lstm_pred = lstm_model.predict(input_seq, verbose=0)
            predicted_force = float(lstm_pred[0][0])
            predicted_force = max(0.0, predicted_force)
        except Exception as e:
            print(f"LSTM prediction error: {e}")
            
    return jsonify({
        "predicted_weight": predicted_weight,
        "predicted_force": predicted_force
    })

@app.route("/clear-session/<session_id>", methods=["POST"])
def clear_session(session_id):
    if session_id in session_histories:
        del session_histories[session_id]
        return jsonify({"success": True, "message": f"Cleared session {session_id}"})
    return jsonify({"success": False, "message": "Session not found"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
