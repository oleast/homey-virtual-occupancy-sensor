import { HomeyAPIV3Local } from 'homey-api';

export async function findDeviceById(homeyApi: HomeyAPIV3Local, id: string): Promise<HomeyAPIV3Local.ManagerDevices.Device | null> {
  try {
    const device = await homeyApi.devices.getDevice({ id });
    return device;
  } catch (error) {
    return null;
  }
}

export async function getAllDevices(homeyApi: HomeyAPIV3Local): Promise<Record<string, HomeyAPIV3Local.ManagerDevices.Device>> {
  const devicesArray = await homeyApi.devices.getDevices();
  return devicesArray;
}

export async function getDevicesWithCapability(
  homeyApi: HomeyAPIV3Local,
  capabilityId: string,
  includeUnavailable: boolean = false,
): Promise<HomeyAPIV3Local.ManagerDevices.Device[]> {
  const allDevices = await homeyApi.devices.getDevices();
  return Object.values(allDevices).filter((device) => {
    const hasCapability = device.capabilities.includes(capabilityId);
    const isAvailable = includeUnavailable || device.available;
    return hasCapability && isAvailable;
  });
}

export function deviceHasCapability(
  device: HomeyAPIV3Local.ManagerDevices.Device,
  capabilityId: string,
): boolean {
  return device.capabilities.includes(capabilityId);
}
