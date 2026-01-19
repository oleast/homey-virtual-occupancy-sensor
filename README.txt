This Homey app provides a "Virtual Occupancy Sensor" that automatically determines if a room is occupied based on door sensors and motion sensors. It attempts to solve the problem of motion sensors timing out in a zone when you simply haven't moved or been visible for the sensor in a while, by using contact sensors to track doors.

It does so by listening to a configurable set of motion sensors and contact sensors to set the sensor into one of four states: "occupied", "empty", "door open", or "checking". Speaking simply, whenever all doors to a room have been closed, the sensor will check for recent motion events after that event to determine if the room is occupied.


How It Works:
1. When a door opens, the sensor enters "Door Open" state
2. When all doors close, the sensor enters "Checking" state
3. If motion is detected within the configured timeout, the sensor enters "Occupied" state
4. If no motion is detected within the timeout, the sensor enters "Empty" state
5. If motion is detected while "Empty", it automatically changes to "Occupied"
