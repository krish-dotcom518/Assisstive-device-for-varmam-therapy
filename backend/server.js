const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");

// USB SERIAL
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
.then(() => console.log("MongoDB Atlas Connected"))
.catch((err) => console.log("DB Error:", err));

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
      mode: String
    }
  ]
});

const Session = mongoose.model("Session", sessionSchema);

// ======================================================
// CURRENT SESSION
// ======================================================

let currentSession = null;

// ======================================================
// TEST ROUTE
// ======================================================

app.get("/", (req, res) => {
  res.send("Backend Running Successfully");
});

// ======================================================
// NEXT SESSION NUMBER
// ======================================================

app.get("/next-session/:patientName", async (req, res) => {

  try {

    const patientName = decodeURIComponent(req.params.patientName);

    const latest = await Session.findOne({ patientName })
      .sort({ sessionNumber: -1 });

    const nextSession = latest
      ? latest.sessionNumber + 1
      : 1;

    res.send({ nextSession });

  } catch (err) {

    console.log(err);

    res.status(500).send("Error fetching session");
  }
});

// ======================================================
// START SESSION
// ======================================================

app.post("/session-start", async (req, res) => {

  try {

    currentSession = {

      ...req.body,

      startTime: new Date(),

      readings: []
    };

    // UPSERT SESSION
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

    console.log("Session Started");

    res.send({
      message: "Session started successfully"
    });

  } catch (err) {

    console.log(err);

    res.status(500).send("Session start failed");
  }
});

// ======================================================
// SENSOR DATA PROCESSOR
// ======================================================

async function processSensorData(data, mode) {

  try {

    if (!currentSession) {

      console.log("⚠️ No active session");

      return;
    }

    if (!data.matrix || data.matrix.length !== 64) {

      console.log("Invalid matrix");

      return;
    }

    let validation = "Correct Pressure";

    if (Number(data.max_force) < 0.02) {
      validation = "Low Pressure";
    }

    if (Number(data.max_force) > 0.30) {
      validation = "High Pressure";
    }

    const sensorPacket = {

      time: new Date(),

      avg_force: Number(data.avg_force),

      max_force: Number(data.max_force),

      matrix: data.matrix,

      status: data.status || "Unknown",

      validation,

      mode
    };

    // LIVE DASHBOARD UPDATE
    io.emit("sensorData", sensorPacket);

    // DATABASE UPDATE
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

    console.log(`${mode} Data Stored`);

  } catch (err) {

    console.log("Sensor Processing Error:", err);
  }
}

// ======================================================
// WIFI API
// ======================================================

app.post("/esp-data", async (req, res) => {

  try {

    console.log("WiFi ESP32 DATA");

    await processSensorData(req.body, "WiFi");

    res.send({
      success: true,
      message: "WiFi Data Received"
    });

  } catch (err) {

    console.log(err);

    res.status(500).send("WiFi Error");
  }
});

// ======================================================
// BLUETOOTH API
// ======================================================

app.post("/bluetooth-data", async (req, res) => {

  try {

    console.log("Bluetooth DATA");

    await processSensorData(req.body, "Bluetooth");

    res.send({
      success: true,
      message: "Bluetooth Data Received"
    });

  } catch (err) {

    console.log(err);

    res.status(500).send("Bluetooth Error");
  }
});

// ======================================================
// USB SERIAL CONNECTION
// ======================================================

// CHANGE THIS TO YOUR ARDUINO COM PORT
/*const USB_COM_PORT = "COM5";

let port;

try {

  port = new SerialPort({

    path: USB_COM_PORT,

    baudRate: 115200
  });

  console.log("USB Serial Connected");

} catch (err) {

  console.log("USB Serial Not Connected");
}

if (port) {

  const parser = port.pipe(

    new ReadlineParser({

      delimiter: "\n"
    })
  );

  parser.on("data", async (line) => {

    try {

      const sensorData = JSON.parse(line);

      console.log("📥 USB SENSOR DATA");

      await processSensorData(sensorData, "USB");

    } catch (err) {

      console.log("Serial Parse Error");
    }
  });
}*/

// ======================================================
// END SESSION
// ======================================================

app.post("/end-session", async (req, res) => {

  try {

    if (!currentSession) {

      return res.status(400).send("No active session");
    }

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

    console.log("Session Ended");

    currentSession = null;

    res.send({
      message: "Session updated successfully"
    });

  } catch (err) {

    console.log(err);

    res.status(500).send("Database update failed");
  }
});

// ======================================================
// SERVER
// ======================================================

server.listen(5000, "0.0.0.0", () => {

  console.log("Server running on http://localhost:5000");
});