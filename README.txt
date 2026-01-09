# Virtual Occupancy Sensor for Homey

This Homey app provides a virtual occupancy sensor that intelligently detects room occupancy based on door and motion sensors.

## Features

- **Smart Occupancy Detection**: Determines room occupancy based on door and motion sensor events
- **Automatic Room Detection**: Automatically detects and monitors all door and motion sensors in the same room/zone
- **Multiple States**: Tracks four occupancy states:
  - Empty: No one is in the room
  - Occupied: Someone is in the room
  - Door Open: A door to the room is open
  - Checking: Waiting to detect motion after door closes
- **Auto-Correction**: If motion is detected when the room is marked as "Empty", it automatically corrects to "Occupied"
- **Configurable Timeout**: Set how long to wait for motion after door closes
- **Flow Integration**: Trigger flows based on occupancy state changes
- **Zone Activity**: Acts as a motion sensor for Homey Zone Activity

## How It Works

1. When a door opens, the sensor enters "Door Open" state
2. When all doors close, the sensor enters "Checking" state
3. If motion is detected within the configured timeout, the sensor enters "Occupied" state
4. If no motion is detected within the timeout, the sensor enters "Empty" state
5. If motion is detected while "Empty", it automatically changes to "Occupied"

## Setup

### Automatic Room Detection (Recommended)

1. Add a Virtual Occupancy Sensor device
2. **Assign the device to a room/zone** in Homey
3. The sensor will automatically detect and monitor:
   - All door sensors (devices with `alarm_contact` capability) in the same room
   - All motion sensors (devices with `alarm_motion` capability) in the same room
4. Configure the motion detection timeout in device settings (default: 30 seconds)
5. Done! The sensor will automatically track room occupancy

**Important**: Make sure to assign the virtual sensor to the correct room/zone, as it will only monitor sensors in that room.

### Manual Sensor Configuration (Optional)

If you want to monitor sensors from other rooms or have specific requirements:

1. Add a Virtual Occupancy Sensor device
2. Go to device settings
3. Enter the device IDs of your door sensors (comma-separated) - OPTIONAL
4. Enter the device IDs of your motion sensors (comma-separated) - OPTIONAL
5. Configure the motion detection timeout

To find device IDs:
- Go to the device settings of each sensor
- Look for the device ID (usually shown in advanced settings)

### Manual Control via Flows (Alternative)

1. Add a Virtual Occupancy Sensor device
2. Configure the motion detection timeout in device settings
3. Create Flows to connect your physical sensors to the virtual sensor:
   - When door sensor opens → trigger "Door opened" action on virtual sensor
   - When door sensor closes → trigger "Door closed" action on virtual sensor
   - When motion sensor detects motion → trigger "Motion detected" action on virtual sensor

## Flow Cards

### Trigger Cards
- **Occupancy state changed**: Triggers when state changes (includes state token)
- **Room became occupied**: Triggers when someone enters the room
- **Room became empty**: Triggers when room becomes empty
- **Door opened**: Triggers when door is opened
- **Started checking for motion**: Triggers when checking phase begins

### Condition Cards
- **Room is occupied/not occupied**: Check if room is currently occupied
- **Occupancy state is/is not [state]**: Check specific occupancy state

### Action Cards (for manual control)
- **Door opened**: Manually signal that a door was opened
- **Door closed**: Manually signal that a door was closed
- **Motion detected**: Manually signal that motion was detected
- **Reset to empty state**: Reset the sensor to empty state

## Example Flows

### Using Automatic Room Detection
Simply assign the virtual sensor to a room/zone in Homey, and it will automatically detect and monitor all door and motion sensors in that room!

**Flow Example: Turn on Lights When Occupied**
- WHEN: Virtual Occupancy Sensor → Room became occupied
- THEN: Turn on lights in the room

**Flow Example: Turn off Lights When Empty**
- WHEN: Virtual Occupancy Sensor → Room became empty
- THEN: Turn off lights after 5 minutes

### Using Manual Flow Cards (If Not Using Auto-Detection)
**Flow 1: Front Door Opens**
- WHEN: Front door sensor opens
- THEN: Virtual Occupancy Sensor → Door opened

**Flow 2: Front Door Closes**
- WHEN: Front door sensor closes
- THEN: Virtual Occupancy Sensor → Door closed

**Flow 3: Motion Detected**
- WHEN: Living room motion sensor detects motion
- THEN: Virtual Occupancy Sensor → Motion detected

## Troubleshooting

### Virtual sensor not detecting room sensors
- Make sure the virtual sensor is assigned to a room/zone in Homey
- Verify that door and motion sensors are also assigned to the same room/zone
- Check that sensors have the correct capabilities (`alarm_contact` for doors, `alarm_motion` for motion)
- Look at device logs for auto-detection messages

### Moving the sensor to a different room
If you move the virtual sensor to a different room/zone, it will automatically re-detect sensors in the new room on the next state update or when settings are changed.

## Support

For issues and feature requests, please visit the GitHub repository.
