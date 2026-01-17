/* eslint-disable import/prefer-default-export */
export function parseSensorIdsSetting(setting: string | undefined): string[] {
  if (!setting || setting.trim().length === 0) {
    return [];
  }
  return setting.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
}
