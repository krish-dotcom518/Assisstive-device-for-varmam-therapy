/**
 * ESP32/Arduino Firmware: Wi-Fi TCP Server Mode (Physical Sensor Pad)
 * 
 * Target Board: ESP32 Dev Module
 * 
 * Description:
 * Connects to a local Wi-Fi access point, instantiates a TCP Server on port 8080,
 * and scans an 8x8 physical pressure matrix sensor pad by driving rows sequentially (Outputs)
 * and reading columns (Analog Inputs). Streams the real-time sensor values to the connected client.
 * 
 * Electrical Wiring:
 * 1. Connect the 8 Row pins of your sensor pad to the GPIOs defined in `rowPins`.
 * 2. Connect the 8 Column pins of your sensor pad to the ADC GPIOs defined in `colPins`.
 * 3. Connect a pull-down resistor (e.g., 10k Ohm or 47k Ohm) from each Column pin to Ground (GND).
 */

#include <WiFi.h>

#define ROWS 8
#define COLS 8
#define SENSORS_COUNT 64

// Wi-Fi credentials configuration
const char* ssid     = "krishika";
const char* password = "krishi123";

// TCP Server on port 8080
WiFiServer server(8080);
WiFiClient client;

// 1. Row Pins Configuration (Digital Outputs)
const int rowPins[ROWS] = {12, 13, 14, 15, 2, 4, 5, 18};

// 2. Column Pins Configuration (Analog Inputs - must support ADC)
const int colPins[COLS] = {32, 33, 34, 35, 36, 39, 25, 26};

unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Scan rate: send data every 200ms (5Hz)
bool monitoring = false;
void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

  // Configure row pins as INPUT (high impedance)
  for (int r = 0; r < ROWS; r++) {
    pinMode(rowPins[r], INPUT);
  }

  // Configure column pins as INPUT
  for (int c = 0; c < COLS; c++) {
    pinMode(colPins[c], INPUT);
  }

  // Initialize Wi-Fi connection
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("✓ Wi-Fi Connected");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // Start the TCP Server
  server.begin();
  Serial.println("TCP Server started on port 8080. Waiting for client...");
}

void loop() {
  // Check Wi-Fi connection status and reconnect if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection lost. Reconnecting...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
      delay(1000);
      Serial.print(".");
    }
    Serial.println("\n✓ Wi-Fi Reconnected");
    return;
  }

  // Check if a client has connected or if we need to accept a new one
  if (!client || !client.connected()) {
    client = server.available();
    if (client) {
      Serial.print("✓ Client connected from IP: ");
      Serial.println(client.remoteIP());
    }
  }
  if (!client || !client.connected()) {
    client = server.available();
    if (client) {
        Serial.print("✓ Client connected from IP: ");
        Serial.println(client.remoteIP());
    }
}

  // If a client is connected, scan the physical sensor matrix and stream data
  if (client &&
    client.connected() &&
    monitoring) {
    unsigned long currentMillis = millis();

    if (currentMillis - lastTxTime >= txInterval) {
      lastTxTime = currentMillis;

      float sensorValues[SENSORS_COUNT];

      // Scan the 8x8 physical sensor grid
      for (int r = 0; r < ROWS; r++) {
        // Activate row: set as OUTPUT and drive HIGH (3.3V)
        pinMode(rowPins[r], OUTPUT);
        digitalWrite(rowPins[r], HIGH);

        // Short delay to allow analog signals to stabilize
        delayMicroseconds(50);

        // Read analog voltage from columns
        for (int c = 0; c < COLS; c++) {
          int index = r * COLS + c;
          int rawAdc = analogRead(colPins[c]);

          // Convert 12-bit ADC (0 - 4095) to force percentage (0.0 - 100.0)
          sensorValues[index] = (rawAdc / 4095.0) * 100.0;
          
          if (sensorValues[index] < 0.0) sensorValues[index] = 0.0;
          if (sensorValues[index] > 100.0) sensorValues[index] = 100.0;
        }

        // Deactivate row: set to INPUT (high impedance)
        digitalWrite(rowPins[r], LOW);
        pinMode(rowPins[r], INPUT);
      }

      // Format as CSV: v1,v2,v3,...,v64\n
      String csvPacket = "";
      for (int i = 0; i < SENSORS_COUNT; i++) {
        csvPacket += String(sensorValues[i], 1);
        if (i < SENSORS_COUNT - 1) {
          csvPacket += ",";
        }
      }

      // Send packet to the connected backend client
      client.println(csvPacket);
      
      // Log occasionally to Serial
      if (random(0, 50) == 0) {
        Serial.println("Streaming TCP packet: " + csvPacket.substring(0, 30) + "...");
      }
    }
  }
}
