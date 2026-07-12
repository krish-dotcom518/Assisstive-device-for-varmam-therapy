const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

// ======================================================
// APP SETUP
// ======================================================
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ======================================================
// MONGODB CONNECTION
// ======================================================
mongoose.connect(
  "mongodb+srv://krishikavenkatesan55_db_user:GxzufwGvdJCjhmga@cluster0.o9r7xyh.mongodb.net/varmamDB?retryWrites=true&w=majority&appName=Cluster0"
)
.then(() => console.log("✓ MongoDB Atlas Connected"))
.catch((err) => console.log("MongoDB connection error:", err));

// ======================================================
// SCHEMA
// ======================================================
const sessionSchema = new mongoose.Schema({
  doctorName: String,
  doctorExp: String,
  designation: String,
  patientName: String,
  patientAge: Number,
  gender: String,
  diseaseWitnessed: String,
  varmamPoint: String,
  varmamTechnique: String,
  visitDate: String,
  sessionNumber: Number,
  startTime: Date,
  endTime: Date,
  readings: [
    {
      time: Date,
      avg_force: Number,
      max_force: Number,
      matrix: [Number],
      status: String,
      validation: String,
      mode: String,
      predicted_weight: Number,
      predicted_force: Number
    }
  ]
});

const Session = mongoose.model("Session", sessionSchema);

// ======================================================
// STATE VARIABLES
// ======================================================
let currentSession = null;
let lastReadingTime = null;
let simulationMode = false;
let simulationInterval = null;
let serialPortInstance = null;
let activePortPath = null;

// ======================================================
// HELPER FOR ML SERVICE PREDICTION
// ======================================================
async function getMLPredictions(matrix, status, sessionId) {
  const now = Date.now();
  let delta_t = 0.2; // default 200ms
  if (lastReadingTime) {
    delta_t = (now - lastReadingTime) / 1000;
  }
  lastReadingTime = now;

  try {
    const response = await fetch("http://localhost:5001/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matrix,
        delta_t,
        state_label: status || "steady",
        sessionId
      })
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    // Graceful degradation when the Python ML microservice isn't running
    console.log("⚠️ ML Service offline, using default calculations");
  }
  return null;
}

// ======================================================
// SENSOR DATA PROCESSOR
// ======================================================
async function processSensorData(data, mode) {
  try {
    if (!currentSession) {
      return;
    }

    if (!data.matrix || data.matrix.length !== 64) {
      console.log("Invalid matrix length received:", data.matrix ? data.matrix.length : 0);
      return;
    }

    const sessionId = `${currentSession.patientName}_${currentSession.sessionNumber}`;
    
    // Get predictions from the Python ML service
    const predictions = await getMLPredictions(data.matrix, data.status, sessionId);
    
    // Set predicted values or fallback to default raw values
    const predicted_weight = predictions ? predictions.predicted_weight : 0;
    
    // If the ML service is ready, we use the drift-compensated force;
    // otherwise we fallback to the raw maximum force.
    const predicted_force = predictions ? predictions.predicted_force : Number(data.max_force);

    // Perform clinical validation check (based on drift-compensated force if available)
    let validation = "Correct Pressure";
    if (predicted_force < 35.0) {
      validation = "Low Pressure";
    } else if (predicted_force > 75.0) {
      validation = "High Pressure";
    }

    const sensorPacket = {
      time: new Date(),
      avg_force: Number(data.avg_force),
      max_force: Number(data.max_force),
      matrix: data.matrix,
      status: data.status || "steady",
      validation,
      mode,
      predicted_weight,
      predicted_force
    };

    // Emit live packet to Socket.io frontend clients
    io.emit("sensorData", sensorPacket);

    // Save reading to MongoDB Atlas database session document
    await Session.updateOne(
      {
        patientName: currentSession.patientName,
        sessionNumber: currentSession.sessionNumber
      },
      {
        $push: {
          readings: sensorPacket
        }
      }
    );

    console.log(`[${mode}] Stored data | Peak Raw Force: ${data.max_force}N | ML Force: ${predicted_force.toFixed(2)}N | Weight: ${predicted_weight.toFixed(1)}g`);
  } catch (err) {
    console.log("Sensor Processing Error:", err);
  }
}

// ======================================================
// ESP32 SIMULATION SERVICE
// ======================================================
function startSimulator() {
  if (simulationInterval) clearInterval(simulationInterval);
  
  console.log("🔌 Simulator service started");
  simulationInterval = setInterval(async () => {
    if (!currentSession) return;

    // Generate a bell-shaped Gaussian pressure matrix centered around the middle (3.5, 3.5)
    // The peak amplitude oscillates slowly over time to simulate a therapist applying/releasing force.
    const tick = Date.now() / 1000;
    const baseOsc = Math.sin(tick / 4); // oscillates between -1 and 1
    const peakVal = 42 + baseOsc * 30 + (Math.random() - 0.5) * 6; // oscillates ~12 to ~72 N
    
    const matrix = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const dx = r - 3.5;
        const dy = c - 3.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Gaussian spread: force decreases with distance from center
        const rawVal = peakVal * Math.exp(-dist * dist / 7.5);
        const noise = (Math.random() - 0.5) * 3.5;
        const val = Math.max(0, Math.min(100, rawVal + noise));
        matrix.push(parseFloat(val.toFixed(1)));
      }
    }

    const avg_force = parseFloat((matrix.reduce((a, b) => a + b, 0) / 64).toFixed(2));
    const max_force = parseFloat(Math.max(...matrix).toFixed(2));
    
    // Force increasing = "loading", decreasing = "unloading", otherwise "steady"
    let status = "steady";
    if (baseOsc > 0.1) status = "loading";
    else if (baseOsc < -0.1) status = "unloading";

    await processSensorData({ matrix, avg_force, max_force, status }, "Simulated");
  }, 350); // Emit sensor frame every 350ms (~3Hz)
}

function stopSimulator() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log("🔌 Simulator service stopped");
  }
}

// ======================================================
// REST ENDPOINTS
// ======================================================

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Varmam Clinical Backend Running Successfully");
});

// List all sessions (excluding full readings array for efficiency)
app.get("/sessions", async (req, res) => {
  try {
    const list = await Session.find({}, { readings: 0 }).sort({ startTime: -1 });
    res.send(list);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching sessions");
  }
});

// Fetch detailed readings for a specific session
app.get("/sessions/:id", async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).send("Session not found");
    res.send(session);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching session details");
  }
});

// Fetch next session number for a patient
app.get("/next-session/:patientName", async (req, res) => {
  try {
    const patientName = decodeURIComponent(req.params.patientName);
    const latest = await Session.findOne({ patientName }).sort({ sessionNumber: -1 });
    const nextSession = latest ? latest.sessionNumber + 1 : 1;
    res.send({ nextSession });
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching session number");
  }
});

// Start session
app.post("/session-start", async (req, res) => {
  try {
    currentSession = {
      ...req.body,
      startTime: new Date(),
      readings: []
    };

    lastReadingTime = null;

    // Upsert session details in MongoDB Atlas
    await Session.updateOne(
      {
        patientName: currentSession.patientName,
        sessionNumber: currentSession.sessionNumber
      },
      {
        $set: {
          doctorName: currentSession.doctorName,
          doctorExp: currentSession.doctorExp,
          designation: currentSession.designation,
          patientName: currentSession.patientName,
          patientAge: currentSession.patientAge,
          gender: currentSession.gender,
          diseaseWitnessed: currentSession.diseaseWitnessed,
          varmamPoint: currentSession.varmamPoint,
          varmamTechnique: currentSession.varmamTechnique,
          visitDate: currentSession.visitDate,
          startTime: currentSession.startTime
        }
      },
      { upsert: true }
    );

    console.log(`✓ Session Started for patient: ${currentSession.patientName}`);
    
    // Clear models sequence history
    try {
      const sessionId = `${currentSession.patientName}_${currentSession.sessionNumber}`;
      await fetch(`http://localhost:5001/clear-session/${sessionId}`, { method: "POST" });
    } catch (e) {}

    // Auto-trigger simulation mode if configured
    if (simulationMode) {
      startSimulator();
    }

    res.send({ message: "Session started successfully", currentSession });
  } catch (err) {
    console.log(err);
    res.status(500).send("Session start failed");
  }
});

// End session
app.post("/end-session", async (req, res) => {
  try {
    if (!currentSession) {
      return res.status(400).send("No active session");
    }

    stopSimulator();

    await Session.updateOne(
      {
        patientName: currentSession.patientName,
        sessionNumber: currentSession.sessionNumber
      },
      {
        $set: {
          endTime: new Date()
        }
      }
    );

    console.log(`✓ Session Ended for patient: ${currentSession.patientName}`);
    currentSession = null;
    res.send({ message: "Session ended successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).send("Database update failed");
  }
});

// Toggle ESP32 simulation mode
app.post("/toggle-simulation", (req, res) => {
  simulationMode = req.body.enable;
  console.log(`Simulator setting updated: ${simulationMode}`);
  
  if (simulationMode && currentSession) {
    startSimulator();
  } else {
    stopSimulator();
  }
  res.send({ success: true, simulationMode });
});

// List available USB COM Ports
app.get("/com-ports", async (req, res) => {
  try {
    const list = await SerialPort.list();
    const paths = list.map(p => p.path);
    res.send({ paths, activePortPath });
  } catch (err) {
    console.log("COM Listing error:", err);
    res.status(500).send({ paths: [], activePortPath: null });
  }
});

// Connect to a specific COM Port
app.post("/connect-usb", async (req, res) => {
  const { path } = req.body;
  
  try {
    // Close existing connection if any
    if (serialPortInstance && serialPortInstance.isOpen) {
      await new Promise(resolve => serialPortInstance.close(resolve));
      serialPortInstance = null;
      activePortPath = null;
    }

    if (!path) {
      return res.send({ success: true, message: "Disconnected USB Serial" });
    }

    serialPortInstance = new SerialPort({
      path,
      baudRate: 115200,
      autoOpen: false
    });

    serialPortInstance.open((err) => {
      if (err) {
        console.log("USB serial open error:", err.message);
        return res.status(500).send({ success: false, message: err.message });
      }

      activePortPath = path;
      console.log(`✓ USB Serial Port Connected: ${path}`);
      
      const parser = serialPortInstance.pipe(new ReadlineParser({ delimiter: "\n" }));
      parser.on("data", async (line) => {
        try {
          const sensorData = JSON.parse(line.trim());
          await processSensorData(sensorData, "USB");
        } catch (parseErr) {
          // Ignore lines that don't match JSON
        }
      });
      
      res.send({ success: true, message: `Connected to ${path}` });
    });
  } catch (err) {
    console.log("USB connection error:", err);
    res.status(500).send({ success: false, message: err.message });
  }
});

// WiFi REST data ingestion endpoint
app.post("/esp-data", async (req, res) => {
  try {
    await processSensorData(req.body, "WiFi");
    res.send({ success: true, message: "WiFi Data Received" });
  } catch (err) {
    console.log(err);
    res.status(500).send("WiFi Ingestion Error");
  }
});

// Bluetooth REST data ingestion endpoint
app.post("/bluetooth-data", async (req, res) => {
  try {
    await processSensorData(req.body, "Bluetooth");
    res.send({ success: true, message: "Bluetooth Data Received" });
  } catch (err) {
    console.log(err);
    res.status(500).send("Bluetooth Ingestion Error");
  }
});

// ======================================================
// SERVER RUN
// ======================================================
server.listen(5000, "0.0.0.0", () => {
  console.log("✓ Node.js Server running on http://localhost:5000");
});