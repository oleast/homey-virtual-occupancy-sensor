import { HomeyAPIV3Local } from 'homey-api';

/**
 * Find the virtual device instance in the list of all devices
 */
export function findVirtualDevice(
  allDevices: Record<string, HomeyAPIV3Local.ManagerDevices.Device>,
  internalId: string,
): { device: HomeyAPIV3Local.ManagerDevices.Device, uuid: string } | null {
  for (const [uuid, device] of Object.entries(allDevices)) {
    if (!device.data) {
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deviceData = device.data as any;
    if (!deviceData.id) {
      continue;
    }
    if (deviceData.id === internalId) {
      return { device, uuid };
    }
  }
  return null;
}

/**
 * Find all sensors in a specific zone
 */
export function findSensorsInZone(
  allDevices: Record<string, HomeyAPIV3Local.ManagerDevices.Device>,
  zoneId: string,
  ignoreUuid: string,
): { doorSensorIds: string[], motionSensorIds: string[] } {
  const doorSensorIds: string[] = [];
  const motionSensorIds: string[] = [];

  for (const [deviceId, device] of Object.entries(allDevices)) {
    if (deviceId === ignoreUuid) continue;

    const deviceObj = device as unknown as HomeyAPIV3Local.ManagerDevices.Device;
    if (deviceObj.zone === zoneId) {
      if (deviceObj.capabilitiesObj?.alarm_contact) {
        doorSensorIds.push(deviceId);
      }
      if (deviceObj.capabilitiesObj?.alarm_motion) {
        motionSensorIds.push(deviceId);
      }
    }
  }

  return { doorSensorIds, motionSensorIds };
}

/**
 * Check if any device in the list has a specific boolean capability active (true)
 */
export async function isAnyCapabilityActive(
  devicesApi: ManagerDevicesWithConnect,
  deviceIds: string[],
  capabilityId: string,
): Promise<boolean> {
  if (!devicesApi || deviceIds.length === 0) return false;

  const devices = await devicesApi.getDevices();

  for (const id of deviceIds) {
    const device = devices[id];
    if (device?.capabilitiesObj?.[capabilityId]?.value === true) {
      return true;
    }
  }
  return false;
}

export function parseSensorIdsSetting(setting: string | undefined): string[] {
  if (!setting || setting.trim().length === 0) {
    return [];
  }
  return setting.split(',').map(id => id.trim()).filter(id => id.length > 0);
};
