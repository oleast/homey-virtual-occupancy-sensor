# Virtual Room Occupancy - Testing Guide

## Manual Testing Steps

### 1. Device Pairing
1. In Homey, go to Devices
2. Add a new device
3. Select "Virtual Room Occupancy" app
4. Add a "Virtual Room Occupancy" device
5. Verify the device appears with initial state "Empty"

### 2. Configure Device Settings
1. Open device settings
2. Add door sensor device IDs (comma-separated)
3. Add motion sensor device IDs (comma-separated)
4. Set motion timeout (e.g., 30 seconds)
5. Save settings

### 3. Test State Transitions

#### Test 1: Door Opens
- **Action**: Open a configured door sensor
- **Expected**: Virtual sensor state → "Door Open"
- **Expected**: alarm_motion capability → true

#### Test 2: Door Closes with No Motion
- **Action**: Close the door and wait for timeout (30 seconds)
- **Expected**: Virtual sensor state → "Checking" (immediate)
- **Expected**: After timeout, state → "Empty"
- **Expected**: alarm_motion capability → false

#### Test 3: Door Closes with Motion Detected
- **Action**: Close the door
- **Expected**: Virtual sensor state → "Checking"
- **Action**: Trigger motion sensor within timeout
- **Expected**: Virtual sensor state → "Occupied"
- **Expected**: alarm_motion capability → true

#### Test 4: Motion in Empty Room
- **Action**: With doors closed and room "Empty", trigger motion sensor
- **Expected**: Virtual sensor state → "Occupied"
- **Expected**: alarm_motion capability → true

### 4. Test Flow Cards

#### Trigger Cards
Create test flows to verify:
- "Occupancy state changed" triggers with correct state token
- "Room became occupied" triggers
- "Room became empty" triggers
- "Door opened" triggers
- "Started checking for motion" triggers

#### Condition Cards
Create flows that check:
- "Room is occupied" condition
- "Occupancy state is [state]" condition

#### Action Cards (for manual control mode)
Test each action card:
- "Door opened" - should set state to "Door Open"
- "Door closed" - should start checking phase
- "Motion detected" - should set to occupied if checking
- "Reset to empty state" - should reset to empty

### 5. Zone Activity Integration
1. Go to Zones in Homey
2. Select a zone where the virtual sensor is located
3. Verify that when sensor is "Occupied" or "Door Open", the zone shows activity
4. Verify that when sensor is "Empty", the zone shows no activity

### 6. Settings Changes
1. Change door/motion sensor IDs in settings
2. Verify new sensors are monitored
3. Change timeout value
4. Verify new timeout is used in checking phase

## Expected Behavior Summary

| Current State | Event            | New State | alarm_motion |
|---------------|------------------|-----------|--------------|
| Any           | Door Opens       | Door Open | true         |
| Door Open     | All Doors Close  | Checking  | true         |
| Checking      | Motion Detected  | Occupied  | true         |
| Checking      | Timeout Expires  | Empty     | false        |
| Empty         | Motion Detected  | Occupied  | true         |
| Occupied      | Door Opens       | Door Open | true         |

## Known Limitations

1. Device IDs must be manually entered in settings (use Advanced device settings to find IDs)
2. Only monitors `alarm_contact` capability for doors (contact sensors)
3. Only monitors `alarm_motion` capability for motion sensors
4. Real-time monitoring requires `homey:manager:api` permission

## Troubleshooting

### Virtual sensor not responding to physical sensors
- Check that device IDs are correct in settings
- Verify physical sensors are working (check their status in Homey)
- Check app logs for errors
- Try removing and re-adding sensor IDs in settings

### State stuck in "Checking"
- Verify motion sensors are configured
- Check motion timeout setting
- Motion must occur AFTER door closes
- Use "Reset to empty state" action to manually reset

### Flow cards not triggering
- Verify the virtual sensor is selected in the flow card
- Check that state actually changed (cards only trigger on state change)
- Review app logs for any errors
