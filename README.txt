# Virtual Occupancy Sensor for Homey

This Homey app provides a virtual occupancy sensor that intelligently detects room occupancy based on door and motion sensors.

## Features

- **Smart Occupancy Detection**: Determines room occupancy based on door and motion sensor events
- **Multiple States**: Tracks four occupancy states:
  - Empty: No one is in the room
  - Occupied: Someone is in the room
  - Door Open: A door to the room is open
  - Checking: Waiting to detect motion after door closes
- **Configurable Timeout**: Set how long to wait for motion after door closes
- **Flow Integration**: Trigger flows based on occupancy state changes
- **Zone Activity**: Acts as a motion sensor for Homey Zone Activity
- **Two Integration Methods**: Use device settings for automatic monitoring OR use flow cards for manual control

## How It Works

1. When a door opens, the sensor enters "Door Open" state
2. When all doors close, the sensor enters "Checking" state
3. If motion is detected within the configured timeout, the sensor enters "Occupied" state
4. If no motion is detected within the timeout, the sensor enters "Empty" state

## Setup

### Method 1: Automatic Monitoring (Recommended)

1. Add a Virtual Occupancy Sensor device
2. Go to device settings
3. Enter the device IDs of your door sensors (comma-separated)
4. Enter the device IDs of your motion sensors (comma-separated)
5. Configure the motion detection timeout
6. The virtual sensor will automatically monitor these devices and update its state

To find device IDs:
- Go to the device settings of each sensor
- Look for the device ID (usually shown in advanced settings)

### Method 2: Manual Control via Flows

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

### Using Automatic Monitoring
Simply configure the sensor device IDs in settings, and the virtual sensor will automatically track room occupancy.

### Using Flow Cards
**Flow 1: Front Door Opens**
- WHEN: Front door sensor opens
- THEN: Virtual Occupancy Sensor → Door opened

**Flow 2: Front Door Closes**
- WHEN: Front door sensor closes
- THEN: Virtual Occupancy Sensor → Door closed

**Flow 3: Motion Detected**
- WHEN: Living room motion sensor detects motion
- THEN: Virtual Occupancy Sensor → Motion detected

**Flow 4: Turn on Lights When Occupied**
- WHEN: Virtual Occupancy Sensor → Room became occupied
- THEN: Turn on lights

**Flow 5: Turn off Lights When Empty**
- WHEN: Virtual Occupancy Sensor → Room became empty
- THEN: Turn off lights

## Support

For issues and feature requests, please visit the GitHub repository.
