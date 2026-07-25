/**
 * ESP32/Arduino Firmware: Bluetooth BLE Mode (Physical Sensor Pad)
 * 
 * Target Board: ESP32 Dev Module
 * 
 * Description:
 * Initializes the ESP32 as a BLE Server, advertises with the name "Varmam_Therapy_BLE",
 * scans a physical 8x8 pressure matrix sensor pad by driving the rows sequentially (Outputs)
 * and reading columns (Analog Inputs), and transmits notifications in CSV format.
 * 
 * Electrical Wiring:
 * 1. Connect the 8 Row pins of your sensor pad to the GPIOs defined in `rowPins`.
 * 2. Connect the 8 Column pins of your sensor pad to the ADC GPIOs defined in `colPins`.
 * 3. Connect a pull-down resistor (e.g., 10k Ohm or 47k Ohm) from each Column pin to Ground (GND).
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

// 1. Row Pins Configuration (Digital Outputs)
const int rowPins[ROWS] = {12, 13, 14, 15, 2, 4, 5, 18};

// 2. Column Pins Configuration (Analog Inputs - must support ADC)
const int colPins[COLS] = {32, 33, 34, 35, 36, 39, 25, 26};

BLEServer* pServer = nullptr;
BLECharacteristic* pCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;
unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Send packet every 200ms
bool monitoring = false;
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
class CommandCallbacks : public BLECharacteristicCallbacks {

    void onWrite(BLECharacteristic *pCharacteristic) {

        String value = pCharacteristic->getValue().c_str();
        value.trim();

        if (value == "START") {

            monitoring = true;
            Serial.println("MONITORING_STARTED");

        }
        else if (value == "STOP") {

            monitoring = false;
            Serial.println("MONITORING_STOPPED");

        }
    }
};
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
  pCharacteristic->setCallbacks(new CommandCallbacks());
  // Create BLE Descriptor (needed for notifications)
  pCharacteristic->addDescriptor(new BLE2902());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("BLE Server Advertising started. Waiting for connection...");
}

void loop() {
  unsigned long currentMillis = millis();

  // Disconnection handling: Restart advertising when client disconnects
  if (!deviceConnected && oldDeviceConnected) {
      delay(500); 
      pServer->startAdvertising(); 
      Serial.println("BLE Advertising restarted...");
      oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
      oldDeviceConnected = deviceConnected;
  }

  // Stream data if connected
  // Stream data only when monitoring is active
if (deviceConnected &&
    monitoring &&
    (currentMillis - lastTxTime >= txInterval)) { {
    lastTxTime = currentMillis;

    float sensorValues[SENSORS_COUNT];
    
    // Scan the 8x8 physical sensor grid
    for (int r = 0; r < ROWS; r++) {
      // Activate row: set as OUTPUT and drive HIGH
      pinMode(rowPins[r], OUTPUT);
      digitalWrite(rowPins[r], HIGH);

      // Short delay to allow analog signals to stabilize
      delayMicroseconds(50);

      // Read analog voltage from columns
      for (int c = 0; c < COLS; c++) {
        int index = r * COLS + c;
        int rawAdc = analogRead(colPins[c]);

        // Map the 12-bit ADC (0 - 4095) to force percentage (0.0 - 100.0)
        sensorValues[index] = (rawAdc / 4095.0) * 100.0;
        
        if (sensorValues[index] < 0.0) sensorValues[index] = 0.0;
        if (sensorValues[index] > 100.0) sensorValues[index] = 100.0;
      }

      // Deactivate row: set to INPUT (high impedance)
      digitalWrite(rowPins[r], LOW);
      pinMode(rowPins[r], INPUT);
    }

    // Format packet to CSV string: v1,v2,v3,...,v64
    String csvPacket = "";
    for (int i = 0; i < SENSORS_COUNT; i++) {
      csvPacket += String(sensorValues[i], 1);
      if (i < SENSORS_COUNT - 1) {
        csvPacket += ",";
      }
    }

    // Set value and notify connected client
    pCharacteristic->setValue(csvPacket.c_str());
    pCharacteristic->notify();
    
    // Log occasionally in console to keep Serial clean
    if (random(0, 50) == 0) {
      Serial.println("Emitting BLE packet: " + csvPacket.substring(0, 30) + "...");
    }
  }
}
}
