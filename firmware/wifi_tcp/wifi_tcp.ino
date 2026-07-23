/**
 * ESP32/Arduino Firmware: Wi-Fi TCP Server Mode
 * 
 * Target Board: ESP32 Dev Module
 * 
 * Description:
 * Connects to a local Wi-Fi access point and instantiates a TCP Server on port 8080.
 * Once the Node.js backend client connects to the ESP32's IP, the firmware streams
 * the 64-value sensor matrix as CSV lines: v1,v2,...,v64\n.
 * Includes Wi-Fi reconnection logic and multi-client disconnect cleanup.
 */

#include <WiFi.h>

#define ROWS 8
#define COLS 8
#define SENSORS_COUNT 64

// Wi-Fi credentials configuration
const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// TCP Server on port 8080
WiFiServer server(8080);
WiFiClient client;

unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Send packet every 200ms

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

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
  // Check Wi-Fi connection status
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

  // If a client is connected, stream sensor data
  if (client && client.connected()) {
    unsigned long currentMillis = millis();

    if (currentMillis - lastTxTime >= txInterval) {
      lastTxTime = currentMillis;

      // Generate simulated sensor matrix data
      float sensorValues[SENSORS_COUNT];
      float center_x = 3.5 + sin(currentMillis / 5000.0) * 1.5;
      float center_y = 3.5 + cos(currentMillis / 5000.0) * 1.5;
      float amplitude = 40.0 + sin(currentMillis / 1000.0) * 30.0;
      
      for (int r = 0; r < ROWS; r++) {
        for (int c = 0; c < COLS; c++) {
          int index = r * COLS + c;
          float dx = r - center_x;
          float dy = c - center_y;
          float dist = sqrt(dx * dx + dy * dy);
          float val = amplitude * exp(-dist * dist / 5.0);
          float noise = random(-20, 20) / 10.0;
          sensorValues[index] = val + noise;
          if (sensorValues[index] < 0.0) sensorValues[index] = 0.0;
          if (sensorValues[index] > 100.0) sensorValues[index] = 100.0;
        }
      }

      // Format as CSV: v1,v2,v3,...,v64\n
      String csvPacket = "";
      for (int i = 0; i < SENSORS_COUNT; i++) {
        csvPacket += String(sensorValues[i], 1);
        if (i < SENSORS_COUNT - 1) {
          csvPacket += ",";
        }
      }

      // Send to the connected client
      client.println(csvPacket);
      
      // Log occasionally to Serial
      if (random(0, 50) == 0) {
        Serial.println("Streaming TCP packet: " + csvPacket.substring(0, 30) + "...");
      }
    }
  }
}
