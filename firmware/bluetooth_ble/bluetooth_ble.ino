/**
 * ESP32/Arduino Firmware: Bluetooth BLE Mode
 * 
 * Target Board: ESP32 Dev Module
 * 
 * Description:
 * Initializes the ESP32 as a BLE Server, advertises with the name "Varmam_Therapy_BLE",
 * and updates a notification characteristic with 64 comma-separated values every 200 ms.
 * Includes connection status handling and handles automatic advertising restarts.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define ROWS 8
#define COLS 8
#define SENSORS_COUNT 64

// Must match the UUIDs configured in the backend's ble_client.py
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;
unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Send packet every 200ms

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("✓ Client Connected via BLE");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("✗ Client Disconnected from BLE");
    }
};

void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

  // Initialize BLE Device
  BLEDevice::init("Varmam_Therapy_BLE");

  // Create BLE Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create BLE Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_WRITE  |
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  // Create BLE Descriptor (needed for notifications)
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // set value to 0x00 to not advertise this parameter
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("BLE Server Advertising started. Waiting for connection...");
}

void loop() {
  unsigned long currentMillis = millis();

  // Disconnection handling: Restart advertising when client disconnects
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); // give the bluetooth stack the chance to get things ready
      pServer->startAdvertising(); // restart advertising
      Serial.println("BLE Advertising restarted...");
      oldDeviceConnected = deviceConnected;
  }
  
  // Connection handling: Update connection state
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }

  // Stream data if connected
  if (deviceConnected && (currentMillis - lastTxTime >= txInterval)) {
    lastTxTime = currentMillis;

    // Generate sensor data
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

    // Format packet to CSV string
    String csvPacket = "";
    for (int i = 0; i < SENSORS_COUNT; i++) {
      csvPacket += String(sensorValues[i], 1);
      if (i < SENSORS_COUNT - 1) {
        csvPacket += ",";
      }
    }

    // Set value and send notify
    pCharacteristic->setValue(csvPacket.c_str());
    pCharacteristic->notify();
    
    // Log occasionally in console to keep Serial clean
    if (random(0, 50) == 0) {
      Serial.println("Emitting BLE packet: " + csvPacket.substring(0, 30) + "...");
    }
  }
}
