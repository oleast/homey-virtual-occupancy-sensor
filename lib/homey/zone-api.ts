import { HomeyAPIV3Local } from 'homey-api';

/**
 * Get all zones from the Homey API
 */
export async function getAllZones(
  homeyApi: HomeyAPIV3Local,
): Promise<Record<string, HomeyAPIV3Local.ManagerZones.Zone>> {
  return homeyApi.zones.getZones();
}

/**
 * Get direct child zones of a given zone
 */
export function getDirectChildZones(
  allZones: Record<string, HomeyAPIV3Local.ManagerZones.Zone>,
  parentZoneId: string,
): HomeyAPIV3Local.ManagerZones.Zone[] {
  return Object.values(allZones).filter((zone) => zone.parent === parentZoneId);
}

/**
 * Get all child zone IDs recursively (children, grandchildren, etc.)
 * @param allZones - All zones from the Homey API
 * @param parentZoneId - The zone ID to get children for
 * @returns Array of zone IDs that are descendants of the parent zone
 */
export function getChildZoneIdsRecursive(
  allZones: Record<string, HomeyAPIV3Local.ManagerZones.Zone>,
  parentZoneId: string,
): string[] {
  const result: string[] = [];

  const directChildren = getDirectChildZones(allZones, parentZoneId);

  for (const child of directChildren) {
    result.push(child.id);
    // Recursively get children of this child
    const grandchildren = getChildZoneIdsRecursive(allZones, child.id);
    result.push(...grandchildren);
  }

  return result;
}

/**
 * Get all zone IDs including the current zone and optionally all child zones
 * @param allZones - All zones from the Homey API
 * @param zoneId - The current zone ID
 * @param includeChildZones - Whether to include child zones recursively
 * @returns Array of zone IDs
 */
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
