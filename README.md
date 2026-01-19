# Virtual Room Occupancy for Homey

This Homey app provides a "Virtual Occupancy Sensor" that automatically determines if a room is occupied based on door sensors and motion sensors. It attempts to solve the problem of motion sensors timing out in a zone when you simply haven't moved or been visible for the sensor in a while, by using contact sensors to track doors.

It does so by listening to a configurable set of motion sensors and contact sensors to set the sensor into one of four states: "occupied", "empty", "door open", or "checking". Speaking simply, whenever all doors to a room have been closed, the sensor will check for recent motion events after that event to determine if the room is occupied.

## How It Works

1. When a door opens, the sensor enters "Door Open" state
2. When all doors close, the sensor enters "Checking" state
3. If motion is detected within the configured timeout, the sensor enters "Occupied" state
4. If no motion is detected within the timeout, the sensor enters "Empty" state
5. If motion is detected while "Empty", it automatically changes to "Occupied"

## Main features
- The device can be configured to set zone activity for the desired states individually. By default "occupied", "door open", and "checking" will trigger 
- Auto detection of motion and contact sensors in the same and child zones from where the device has been placed. Same zone without child zones is on by default. This should also handle when the this device is moved to a different zone, or another device is moved/created/deleted.
- Option to manually set motion and contact sensors by id.
- Automatically learn the timeouts of each motion sensor, or setting a manual motion timeout for all devices.
- Use the sensor state to trigger flows.
- Auto correction if motion is triggered.

## Use cases

The main reason for the existence of this project is quite simple. I was standing in the shower while the lights suddenly turned off because the motion sensor could not see me. I thought that was stupid, since the system should know motion was detected in the room, and no door has been opened since that motion was detected. So just like a finite state machine, no change should happen from that state.

### The Bathroom

The most simple use case for this virtual sensor is a small room with a single door, like a bathroom. 

### The Apartment

This sensor can be used as an implementation of "is anybody home". Placing the virtual sensor in the main zone of the apartment, setting it to use all motion sensors in all zones, and configuring door sensors manually to the main door(s). This will provide instant feedback, and can trigger home activity on anyone anonymously, without any tracking apps. The only caveat is that motion has to be detected within the checking state if anyone is still in the apartment when someone else leaves. But I don't currently have that problem :fire:

## Implementation details

### The checking state

The "checking" state is a necessary part of this sensor since we can't trust that a motion event triggered during the "door open" state actually leads to the room being occupied. You could open a door, walk into the room, walk out again, and close the door. This would lead to a false positive. The checking state is designed to set the room to occupied in two cases:

1. A new motion event is triggered after the sensor has been put in the checking state.
2. Motion is still active after the timeout of the checking state has passed.

Since motion sensors will just prolong a current motion event instead of sending new events while motion is detected within the sensors internal timeout, we listen for motion events that continue longer than the sensor timeout, counting from when the door closed (entered checking state).

To make this as smooth as possible from the user perspective we can either set the timeout as close to the actual timeout of the sensor as possible. This will work as long as the sensor detects something during the checking event. Or we can set a far longer motion timeout, and hope for the sensor not to see movement, allowing it to trigger a new motion event.

### Automatic timeout learning

Since we cannot easily let the user set the motion timeout of each individual sensor using settings, we try to find the motion timeout by learning it. This system will simply continually look for the smallest timespan between a "motion detected" event and a "no motion detected" event from the same sensor. Before any events have been registered, the system will use the default configured timeout from settings (default is 30 seconds). To "calibrate" this process you can simply open the door to the configured room, make sure you are detected by the motion sensor, leave and close the door as fast as possible.

When placed in a room with a single motion sensor, the best solution is to turn off automatic learning, and setting the motion timeout manually.

### Window sensors

Since there is no way to distinguish between door sensors and window sensors in Homey (they are all contact sensors), using automatic device detection will find all window sensors as well (or any other type of contact sensor for that matter). In this case you will have to configure door sensors manually by ID.

### Configuring sensors manually by ID

To get the device ID you have to use the Homey web app.
1. Go to https://my.homey.app
2. Go to Devices.
3. Click on the device you want to find the ID of.
4. Look at the URL in your web browser, it should look something like this: `https://my.homey.app/homeys/<your-homey-id>/devices/<device-id>`. The device ID will be on this format: `aaaabbbbb-cccc-dddd-eeee-ffffgggghhhh`, as a combination of letters and numbers.
5. Copy the device ID into the settings of the virtual sensor, use commas to separate multiple device IDs.

## Support

For issues and feature requests, please visit the GitHub repository.
