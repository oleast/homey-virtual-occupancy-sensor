import { HomeyAPIV3Local } from 'homey-api';

export async function getAllZones(
  homeyApi: HomeyAPIV3Local,
): Promise<Record<string, HomeyAPIV3Local.ManagerZones.Zone>> {
  return homeyApi.zones.getZones();
}

export function getDirectChildZones(
  allZones: Record<string, HomeyAPIV3Local.ManagerZones.Zone>,
  parentZoneId: string,
): HomeyAPIV3Local.ManagerZones.Zone[] {
  return Object.values(allZones).filter((zone) => zone.parent === parentZoneId);
}

export function getChildZoneIdsRecursive(
  allZones: Record<string, HomeyAPIV3Local.ManagerZones.Zone>,
  parentZoneId: string,
): string[] {
  const result: string[] = [];

  const directChildren = getDirectChildZones(allZones, parentZoneId);

  for (const child of directChildren) {
    result.push(child.id);
    const grandchildren = getChildZoneIdsRecursive(allZones, child.id);
    result.push(...grandchildren);
  }

  return result;
}

export function getZoneIdsForSearch(
  allZones: Record<string, HomeyAPIV3Local.ManagerZones.Zone>,
  zoneId: string,
  includeChildZones: boolean,
): string[] {
  const zoneIds = [zoneId];

  if (includeChildZones) {
    const childZoneIds = getChildZoneIdsRecursive(allZones, zoneId);
    zoneIds.push(...childZoneIds);
  }

  return zoneIds;
}
