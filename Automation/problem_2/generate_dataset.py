import json
import pandas as pd
import numpy as np

# =====================================================
# LOAD JSON
# =====================================================

with open("varmamDB.sessions.json", "r", encoding="utf-8") as f:
    sessions = json.load(f)

dataset = []

all_pressures = []

# =====================================================
# FIRST PASS
# Collect pressure scores
# =====================================================

for session in sessions:

    for reading in session.get("readings", []):

        avg_force = float(
            reading.get("avg_force", 0)
        )

        max_force = float(
            reading.get("max_force", 0)
        )

        pressure_score = (
            0.7 * avg_force +
            0.3 * max_force
        )

        all_pressures.append(
            pressure_score
        )

# =====================================================
# NORMALIZATION RANGE
# =====================================================

p_min = min(all_pressures)
p_max = max(all_pressures)

print("Min Pressure:", p_min)
print("Max Pressure:", p_max)

# =====================================================
# SECOND PASS
# Build Dataset
# =====================================================

for session in sessions:

    for reading in session.get("readings", []):

        matrix = reading.get("matrix", [])

        if len(matrix) != 64:
            continue

        row = {}

        for i in range(64):
            row[f"adc{i+1}"] = matrix[i]

        avg_force = float(
            reading.get("avg_force", 0)
        )

        max_force = float(
            reading.get("max_force", 0)
        )

        pressure_score = (
            0.7 * avg_force +
            0.3 * max_force
        )

        # Scale to 0-2000g
        estimated_mass_g = (
            (pressure_score - p_min)
            /
            (p_max - p_min)
        ) * 2000

        row["estimated_mass_g"] = round(
            estimated_mass_g,
            2
        )

        row["avg_force"] = avg_force
        row["max_force"] = max_force

        dataset.append(row)

# =====================================================
# SAVE
# =====================================================

df = pd.DataFrame(dataset)

df.to_csv(
    "varmam_mass_dataset.csv",
    index=False
)

print("\nDataset Generated Successfully")
print("Rows:", len(df))
print("Columns:", len(df.columns))

print("\nEstimated Mass Range:")
print(
    df["estimated_mass_g"].min(),
    "to",
    df["estimated_mass_g"].max(),
    "grams"
)