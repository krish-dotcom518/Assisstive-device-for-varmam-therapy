/**
 * ESP32/Arduino Firmware: USB Serial Mode (Physical Sensor Pad)
 * 
 * Target Board: ESP32 Dev Module (or similar Arduino-compatible board)
 * 
 * Description:
 * Scans an 8x8 physical pressure matrix sensor pad by driving the rows
 * sequentially (Outputs) and reading the columns (Analog Inputs).
 * Transmits the 64 sensor readings continuously over USB Serial in CSV format.
 * 
 * Electrical Wiring:
 * 1. Connect the 8 Row pins of your sensor pad to the GPIOs defined in `rowPins`.
 * 2. Connect the 8 Column pins of your sensor pad to the ADC GPIOs defined in `colPins`.
 * 3. Connect a pull-down resistor (e.g., 10k Ohm or 47k Ohm) from each Column pin to Ground (GND).
 */

#define ROWS 8
#define COLS 8
#define SENSORS_COUNT 64

// 1. Row Pins Configuration (Digital Outputs)
// Drive rows HIGH one by one to scan the grid.
const int rowPins[ROWS] = {12, 13, 14, 15, 2, 4, 5, 18};

// 2. Column Pins Configuration (Analog Inputs - must support ADC)
// Recommended to use ESP32 ADC1 pins to avoid conflicts if WiFi/Bluetooth is ever active.
// ADC1 Pins on ESP32: 32, 33, 34, 35, 36, 39
const int colPins[COLS] = {32, 33, 34, 35, 36, 39, 25, 26};

unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Scan rate: send data every 200ms (5Hz)
bool monitoring = false;
void setup() {
  // Initialize Serial port at 115200 baud rate
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for USB connection (needed for native USB boards)
  }

  // Configure all row pins as INPUT (high impedance state to prevent cross-talk)
  for (int r = 0; r < ROWS; r++) {
    pinMode(rowPins[r], INPUT);
  }

  // Configure all column pins as INPUT
  for (int c = 0; c < COLS; c++) {
    pinMode(colPins[c], INPUT);
  }

  Serial.println("ESP32 Physical Sensor Matrix Scanner (USB Serial) initialized.");
}

void loop() {

  // Listen for commands from the backend
  if (Serial.available()) {

    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "START") {

      monitoring = true;
      Serial.println("MONITORING_STARTED");

    }

    else if (command == "STOP") {

      monitoring = false;
      Serial.println("MONITORING_STOPPED");

    }
  }

  // Don't scan unless monitoring is enabled
  if (!monitoring)
    return;

  unsigned long currentMillis = millis();

  if (currentMillis - lastTxTime >= txInterval) {

    lastTxTime = currentMillis;

    float sensorValues[SENSORS_COUNT];

    // Scan the matrix
    for (int r = 0; r < ROWS; r++) {

      pinMode(rowPins[r], OUTPUT);
      digitalWrite(rowPins[r], HIGH);

      delayMicroseconds(50);

      for (int c = 0; c < COLS; c++) {

        int index = r * COLS + c;

        int rawAdc = analogRead(colPins[c]);

        sensorValues[index] = (rawAdc / 4095.0) * 100.0;

        if (sensorValues[index] < 0.0)
          sensorValues[index] = 0.0;

        if (sensorValues[index] > 100.0)
          sensorValues[index] = 100.0;
      }

      digitalWrite(rowPins[r], LOW);
      pinMode(rowPins[r], INPUT);
    }

    // Send CSV values
    for (int i = 0; i < SENSORS_COUNT; i++) {

      Serial.print(sensorValues[i], 1);

      if (i < SENSORS_COUNT - 1)
        Serial.print(",");

    }

    Serial.println();
  }
}