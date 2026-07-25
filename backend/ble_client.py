import sys
import asyncio
import logging
from bleak import BleakScanner, BleakClient

# ======================================================
# BLE UUIDs (Must match ESP32 firmware)
# ======================================================

SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

logging.basicConfig(level=logging.ERROR)

client = None


# ======================================================
# Listen for commands from Node.js
# ======================================================

async def command_listener():

    global client

    while True:

        command = await asyncio.to_thread(sys.stdin.readline)

        if not command:
            continue

        command = command.strip().upper()

        if client is None:
            continue

        if not client.is_connected:
            continue

        try:

            if command == "START":

                await client.write_gatt_char(
                    CHARACTERISTIC_UUID,
                    b"START"
                )

                print("START_SENT", flush=True)

            elif command == "STOP":

                await client.write_gatt_char(
                    CHARACTERISTIC_UUID,
                    b"STOP"
                )

                print("STOP_SENT", flush=True)

        except Exception as e:

            print(f"ERROR:{e}", flush=True)


# ======================================================
# Main
# ======================================================

async def main():

    global client

    target_name = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Varmam_Therapy_BLE"
    )

    print("SCANNING", flush=True)

    device = None

    try:

        devices = await BleakScanner.discover(timeout=5)

        for d in devices:

            if d.name and target_name.lower() in d.name.lower():

                device = d
                break

    except Exception as e:

        print(f"ERROR:Scan failed - {e}", flush=True)
        return

    if device is None:

        print("NOT_FOUND", flush=True)
        return

    print("CONNECTING", flush=True)

    try:

        client = BleakClient(device.address)

        await client.connect()

        if not client.is_connected:

            print("DISCONNECTED", flush=True)
            return

        print("CONNECTED", flush=True)

        def notification_handler(sender, data):

            try:

                text = data.decode("utf-8").strip()

                print(f"DATA:{text}", flush=True)

            except:

                pass

        await client.start_notify(
            CHARACTERISTIC_UUID,
            notification_handler
        )

        asyncio.create_task(command_listener())

        while client.is_connected:

            await asyncio.sleep(1)

        print("DISCONNECTED", flush=True)

    except Exception as e:

        print(f"ERROR:Connection failed - {e}", flush=True)


if __name__ == "__main__":

    try:

        asyncio.run(main())

    except KeyboardInterrupt:

        pass