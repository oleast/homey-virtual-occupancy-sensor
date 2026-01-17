# Virtual Room Occupancy for Homey

This Homey app provides a "Virtual Occupancy Sensor" that automatically determines if a room is occupied based on door sensors and motion sensors. It attempts to solve the problem of motion sensors timing out in a zone when you simply haven't moved or been visible for the sensor in a while, by using contact sensors to track doors.

It does so by listening to a configurable set of motion sensors and contact sensors to set the sensor into onr of four states: "occupied", "empty", "door open", or "checking". Speaking simply, whenever a all doors to a room have been closed, the sensor will check for recent motion events after that event to determine if the room is occupied.

## How It Works

1. When a door opens, the sensor enters "Door Open" state
2. When all doors close, the sensor enters "Checking" state
3. If motion is detected within the configured timeout, the sensor enters "Occupied" state
4. If no motion is detected within the timeout, the sensor enters "Empty" state
5. If motion is detected while "Empty", it automatically changes to "Occupied"

## Main features
- The device can be configured to set zone activity for the desired states individually. By default "occupied", "door open", and "checking" will trigger 
- Auto detection of motion and contact sensors in the same and child zones from where the device has been places. Same zone without child zones in on by default. This should also handle when the this device is moved to a different zone, or another device is moved/created/deleted.
- Option to manually set motion and contact sensors by id.
- Automatically learn the timouts of each motion sensor, or setting a manual motion timeout for all devices.
- Use the sensor state to trigger flows.
- Auto correction if motion is triggered.

## Support

For issues and feature requests, please visit the GitHub repository.
