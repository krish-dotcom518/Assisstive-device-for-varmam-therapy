/**
 * ESP32/Arduino Firmware: USB Serial Mode
 * 
 * Target Board: ESP32 Dev Module (or similar)
 * 
 * Description:
 * Reads a simulated 8x8 sensor matrix (64 channels) and transmits the data
 * continuously over the USB Serial interface in CSV format: v1,v2,...,v64.
 * Transmission rate is set to 200 ms (5Hz).
 */

#define ROWS 8
#define COLS 8
#define SENSORS_COUNT 64

unsigned long lastTxTime = 0;
const unsigned long txInterval = 200; // Send packet every 200ms

void setup() {
  // Initialize Serial port at 115200 baud rate
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial port to connect (needed for native USB)
  }
  
  randomSeed(analogRead(0));
  Serial.println("ESP32 Sensor Matrix (USB Serial) initialized.");
}

void loop() {
  unsigned long currentMillis = millis();
  
  if (currentMillis - lastTxTime >= txInterval) {
    lastTxTime = currentMillis;
    
    float sensorValues[SENSORS_COUNT];
    
    // Simulate reading the pressure matrix
    // Generates a bell-curve pressure profile centered dynamically
    float center_x = 3.5 + sin(currentMillis / 5000.0) * 1.5;
    float center_y = 3.5 + cos(currentMillis / 5000.0) * 1.5;
    float amplitude = 40.0 + sin(currentMillis / 1000.0) * 30.0; // Oscillates between 10N and 70N
    
    for (int r = 0; r < ROWS; r++) {
      for (int c = 0; c < COLS; c++) {
        int index = r * COLS + c;
        
        float dx = r - center_x;
        float dy = c - center_y;
        float dist = sqrt(dx * dx + dy * dy);
        
        // Gaussian spread formula
        float val = amplitude * exp(-dist * dist / 5.0);
        float noise = random(-20, 20) / 10.0; // add slight noise +/- 2N
        
        sensorValues[index] = val + noise;
        if (sensorValues[index] < 0.0) {
          sensorValues[index] = 0.0;
        } else if (sensorValues[index] > 100.0) {
          sensorValues[index] = 100.0;
        }
      }
    }
    
    // Format and transmit CSV packet
    // Format: v1,v2,v3,...,v64
    for (int i = 0; i < SENSORS_COUNT; i++) {
      Serial.print(sensorValues[i], 1); // 1 decimal point precision
      if (i < SENSORS_COUNT - 1) {
        Serial.print(",");
      }
    }
    Serial.println(); // Terminal delimiter \n
  }
}
