import sys
import asyncio
import logging
from bleak import BleakScanner, BleakClient

# ESP32 BLE Service/Characteristic UUIDs (must match the firmware)
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# Suppress bleak logs to keep stdout clean for the Node backend
logging.basicConfig(level=logging.ERROR)

async def main():
    target_name = sys.argv[1] if len(sys.argv) > 1 else "Varmam_Therapy_BLE"
    
    print("SCANNING", flush=True)
    
    device = None
    try:
        devices = await BleakScanner.discover(timeout=5.0)
        for d in devices:
            if d.name and target_name.lower() in d.name.lower():
                device = d
                break
    except Exception as scan_err:
        print(f"ERROR:Scan failed - {scan_err}", flush=True)
        return

    if not device:
        print("NOT_FOUND", flush=True)
        return

    print("CONNECTING", flush=True)
    
    try:
        async with BleakClient(device.address) as client:
            if client.is_connected:
                print("CONNECTED", flush=True)
                
                def notification_handler(sender, data):
                    try:
                        # Decode incoming CSV bytes and print to stdout
                        text = data.decode("utf-8").strip()
                        print(f"DATA:{text}", flush=True)
                    except Exception as e:
                        pass
                
                await client.start_notify(CHARACTERISTIC_UUID, notification_handler)
                
                # Keep running until disconnected or terminated
                while client.is_connected:
                    await asyncio.sleep(1.0)
            else:
                print("DISCONNECTED", flush=True)
    except Exception as conn_err:
        print(f"ERROR:Connection failed - {conn_err}", flush=True)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
