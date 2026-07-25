const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const readline = require("readline");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

class HardwareInterface {
  constructor() {
    this.callback = null;
    this.status = "Disconnected"; // "Disconnected", "Connecting", "Connected"
  }

  connect() {}
  disconnect() {}
  startReading() {}
  stopReading() {}

  onSensorData(callback) {
    this.callback = callback;
  }
}

class USBSerialInterface extends HardwareInterface {
  constructor(portPath) {
    super();
    this.path = portPath;
    this.port = null;
    this.parser = null;
    this.reconnectTimer = null;
    this.isClosedIntentionally = false;
    this.lastMaxForce = null;
  }

  connect() {
    if (!this.path) {
      this.status = "Disconnected";
      console.log("[USB] No COM port configured.");
      return;
    }

    console.log(`[USB] Connecting to ${this.path}...`);
    this.status = "Connecting";
    this.isClosedIntentionally = false;

    try {
      this.port = new SerialPort({
        path: this.path,
        baudRate: 115200,
        autoOpen: false
      });

      this.port.open((err) => {
        if (err) {
          console.error(`[USB] Open error on ${this.path}:`, err.message);
          this.status = "Disconnected";
          this.scheduleReconnect();
          return;
        }

        console.log(`[USB] ✓ Port Connected: ${this.path}`);
        this.status = "Connected";
        
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));
        this.parser.on("data", (line) => {
          this.parseAndEmit(line);
        });
      });

      this.port.on("close", () => {
        console.log("[USB] Port closed.");
        this.status = "Disconnected";
        if (!this.isClosedIntentionally) {
          this.scheduleReconnect();
        }
      });

      this.port.on("error", (err) => {
        console.error("[USB] Port error:", err.message);
        this.status = "Disconnected";
        if (!this.isClosedIntentionally) {
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      console.error("[USB] Initialization failed:", err.message);
      this.status = "Disconnected";
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.isClosedIntentionally = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.status = "Disconnected";
    console.log("[USB] Disconnected.");
  }
  
  startReading() {
    if (this.port && this.port.isOpen) {
        this.port.write("START\n");
        console.log("[USB] START command sent");
    }
}

stopReading() {
    if (this.port && this.port.isOpen) {
        this.port.write("STOP\n");
        console.log("[USB] STOP command sent");
    }
}

  scheduleReconnect() {
    if (this.isClosedIntentionally) return;
    if (this.reconnectTimer) return;

    console.log("[USB] Reconnecting in 5s...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  parseAndEmit(line) {
    try {
      const parts = line.trim().split(",");
      const values = parts.map(Number);
      if (values.length !== 64 || values.some(isNaN)) {
        return;
      }

      const avg_force = parseFloat((values.reduce((a, b) => a + b, 0) / 64).toFixed(2));
      const max_force = parseFloat(Math.max(...values).toFixed(2));
      
      let status = "steady";
      if (this.lastMaxForce !== null) {
        const diff = max_force - this.lastMaxForce;
        if (diff > 1.5) status = "loading";
        else if (diff < -1.5) status = "unloading";
      }
      this.lastMaxForce = max_force;

      if (this.callback) {
        this.callback({ matrix: values, avg_force, max_force, status });
      }
    } catch (parseErr) {
      // Ignore invalid packet parses
    }
  }
}

class WiFiInterface extends HardwareInterface {
  constructor(ip, port) {
    super();
    this.ip = ip;
    this.port = parseInt(port) || 8080;
    this.client = null;
    this.reconnectTimer = null;
    this.isClosedIntentionally = false;
    this.lastMaxForce = null;
    this.buffer = "";
  }

  connect() {
    if (!this.ip) {
      this.status = "Disconnected";
      console.log("[Wi-Fi] No IP address configured.");
      return;
    }

    console.log(`[Wi-Fi] Connecting to ${this.ip}:${this.port}...`);
    this.status = "Connecting";
    this.isClosedIntentionally = false;

    this.client = new net.Socket();

    this.client.connect(this.port, this.ip, () => {
      console.log(`[Wi-Fi] ✓ Connected to ${this.ip}:${this.port}`);
      this.status = "Connected";
    });

    this.client.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      let boundary = this.buffer.indexOf("\n");
      while (boundary !== -1) {
        const line = this.buffer.substring(0, boundary).trim();
        this.buffer = this.buffer.substring(boundary + 1);
        if (line) {
          this.parseAndEmit(line);
        }
        boundary = this.buffer.indexOf("\n");
      }
    });

    this.client.on("close", () => {
      console.log("[Wi-Fi] Connection closed.");
      this.status = "Disconnected";
      if (!this.isClosedIntentionally) {
        this.scheduleReconnect();
      }
    });

    this.client.on("error", (err) => {
      console.error("[Wi-Fi] Socket error:", err.message);
      this.status = "Disconnected";
      if (!this.isClosedIntentionally) {
        this.scheduleReconnect();
      }
    });
  }

  disconnect() {
    this.isClosedIntentionally = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.status = "Disconnected";
    console.log("[Wi-Fi] Disconnected.");
  }
  startReading() {

    if (this.client) {

        this.client.write("START\n");
        console.log("[Wi-Fi] START command sent");

    }

}

stopReading() {

    if (this.client) {

        this.client.write("STOP\n");
        console.log("[Wi-Fi] STOP command sent");

    }

}
  scheduleReconnect() {
    if (this.isClosedIntentionally) return;
    if (this.reconnectTimer) return;

    console.log("[Wi-Fi] Reconnecting in 5s...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  parseAndEmit(line) {
    try {
      const parts = line.trim().split(",");
      const values = parts.map(Number);
      if (values.length !== 64 || values.some(isNaN)) {
        return;
      }

      const avg_force = parseFloat((values.reduce((a, b) => a + b, 0) / 64).toFixed(2));
      const max_force = parseFloat(Math.max(...values).toFixed(2));
      
      let status = "steady";
      if (this.lastMaxForce !== null) {
        const diff = max_force - this.lastMaxForce;
        if (diff > 1.5) status = "loading";
        else if (diff < -1.5) status = "unloading";
      }
      this.lastMaxForce = max_force;

      if (this.callback) {
        this.callback({ matrix: values, avg_force, max_force, status });
      }
    } catch (parseErr) {
      // Ignore
    }
  }
}

class BLEInterface extends HardwareInterface {
  constructor(deviceName) {
    super();
    this.deviceName = deviceName || "Varmam_Therapy_BLE";
    this.pyProcess = null;
    this.reconnectTimer = null;
    this.isClosedIntentionally = false;
    this.lastMaxForce = null;
  }

  connect() {
    console.log(`[Bluetooth] Connecting to BLE device: ${this.deviceName}...`);
    this.status = "Connecting";
    this.isClosedIntentionally = false;

    // Use root-level venv python
    const pythonPath = path.join(__dirname, "..", "venv", "Scripts", "python.exe");
    const scriptPath = path.join(__dirname, "ble_client.py");

    try {
      this.pyProcess = spawn(pythonPath, [scriptPath, this.deviceName]);

      const rl = readline.createInterface({
        input: this.pyProcess.stdout,
        terminal: false
      });

      rl.on("line", (line) => {
        line = line.trim();
        if (line === "SCANNING" || line === "CONNECTING") {
          this.status = "Connecting";
        } else if (line === "CONNECTED") {
          console.log(`[Bluetooth] ✓ BLE Connected to ${this.deviceName}`);
          this.status = "Connected";
        } else if (line === "NOT_FOUND") {
          console.error(`[Bluetooth] BLE device ${this.deviceName} not found.`);
          this.status = "Disconnected";
        } else if (line.startsWith("DATA:")) {
          this.status = "Connected";
          const csvData = line.substring(5);
          this.parseAndEmit(csvData);
        }
      });

      this.pyProcess.stderr.on("data", (data) => {
        console.error(`[Bluetooth BLE Helper stderr] ${data.toString().trim()}`);
      });

      this.pyProcess.on("close", (code) => {
        console.log(`[Bluetooth] BLE Helper exited with code ${code}`);
        this.status = "Disconnected";
        if (!this.isClosedIntentionally) {
          this.scheduleReconnect();
        }
      });
    } catch (err) {
      console.error("[Bluetooth] Failed to spawn BLE helper:", err.message);
      this.status = "Disconnected";
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.isClosedIntentionally = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pyProcess) {
      this.pyProcess.kill();
      this.pyProcess = null;
    }
    this.status = "Disconnected";
    console.log("[Bluetooth] Disconnected.");
  }

  scheduleReconnect() {
    if (this.isClosedIntentionally) return;
    if (this.reconnectTimer) return;

    console.log("[Bluetooth] Reconnecting in 5s...");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  parseAndEmit(line) {
    try {
      const parts = line.trim().split(",");
      const values = parts.map(Number);
      if (values.length !== 64 || values.some(isNaN)) {
        return;
      }

      const avg_force = parseFloat((values.reduce((a, b) => a + b, 0) / 64).toFixed(2));
      const max_force = parseFloat(Math.max(...values).toFixed(2));
      
      let status = "steady";
      if (this.lastMaxForce !== null) {
        const diff = max_force - this.lastMaxForce;
        if (diff > 1.5) status = "loading";
        else if (diff < -1.5) status = "unloading";
      }
      this.lastMaxForce = max_force;

      if (this.callback) {
        this.callback({ matrix: values, avg_force, max_force, status });
      }
    } catch (parseErr) {
      // Ignore
    }
  }
}

class HardwareManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = this.loadConfig();
    this.currentInterface = null;
    this.sensorCallback = null;
    this.activeMode = this.config.activeMode || "USB";
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
        // Ensure default structure
        return {
          activeMode: data.activeMode || "USB",
          usb: data.usb || { path: "" },
          bluetooth: data.bluetooth || { deviceName: "Varmam_Therapy_BLE" },
          wifi: data.wifi || { ip: "192.168.4.1", port: 8080 },
          thresholds: data.thresholds || { low: 35.0, high: 75.0 }
        };
      }
    } catch (e) {
      console.error("Error loading hardware config, using defaults:", e);
    }
    return {
      activeMode: "USB",
      usb: { path: "" },
      bluetooth: { deviceName: "Varmam_Therapy_BLE" },
      wifi: { ip: "192.168.4.1", port: 8080 },
      thresholds: { low: 35.0, high: 75.0 }
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
    } catch (e) {
      console.error("Error saving hardware config:", e);
    }
  }

  setActiveMode(mode) {
    let normalizedMode = "USB";
    if (mode === "WiFi" || mode === "Wi-Fi") {
      normalizedMode = "WiFi";
    } else if (mode === "Bluetooth" || mode === "BLE") {
      normalizedMode = "Bluetooth";
    }

    if (this.activeMode !== normalizedMode || !this.currentInterface) {
      console.log(`[HardwareManager] Switching mode from ${this.activeMode} to ${normalizedMode}`);
      this.activeMode = normalizedMode;
      this.config.activeMode = normalizedMode;
      this.saveConfig();
      this.reconnect();
    }
  }

  onSensorData(callback) {
    this.sensorCallback = callback;
    if (this.currentInterface) {
      this.currentInterface.onSensorData(callback);
    }
  }

  getStatus() {
    return {
      mode: this.activeMode,
      status: this.currentInterface ? this.currentInterface.status : "Disconnected",
      config: this.config
    };
  }
  
  startMonitoring() {
    if (
        this.currentInterface &&
        typeof this.currentInterface.startReading === "function"
    ) {
        this.currentInterface.startReading();
    }
}

stopMonitoring() {
    if (
        this.currentInterface &&
        typeof this.currentInterface.stopReading === "function"
    ) {
        this.currentInterface.stopReading();
    }
}

  reconnect() {
    if (this.currentInterface) {
      console.log(`[HardwareManager] Stopping previous interface...`);
      this.currentInterface.disconnect();
      this.currentInterface = null;
    }

    console.log(`[HardwareManager] Starting interface for mode: ${this.activeMode}...`);
    if (this.activeMode === "USB") {
      this.currentInterface = new USBSerialInterface(this.config.usb.path);
    } else if (this.activeMode === "WiFi") {
      this.currentInterface = new WiFiInterface(this.config.wifi.ip, this.config.wifi.port);
    } else if (this.activeMode === "Bluetooth") {
      this.currentInterface = new BLEInterface(this.config.bluetooth.deviceName);
    }

    if (this.currentInterface) {
      if (this.sensorCallback) {
        this.currentInterface.onSensorData(this.sensorCallback);
      }
      this.currentInterface.connect();
    }
  }
}

module.exports = {
  HardwareManager,
  USBSerialInterface,
  WiFiInterface,
  BLEInterface
};
