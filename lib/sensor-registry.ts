export default class SensorRegistry {
  private currentZoneId: string | null = null;
  private doorSensorIds: Set<string> = new Set();
  private motionSensorIds: Set<string> = new Set();
  private virtualSensorUuid: string | null = null;
  private manualDoorSensors: string[] = [];
  private manualMotionSensors: string[] = [];

  public setManualConfig(doors: string[], motions: string[]) {
    this.manualDoorSensors = doors;
    this.manualMotionSensors = motions;
  }

  public setZone(zoneId: string | null) {
    this.currentZoneId = zoneId;
  }

  public setVirtualSensorUuid(uuid: string) {
    this.virtualSensorUuid = uuid;
  }

  public getVirtualSensorUuid() {
    return this.virtualSensorUuid;
  }

  public getCurrentZoneId() {
    return this.currentZoneId;
  }

  public setAutoDetectSensors(doors: string[], motions: string[]) {
    this.doorSensorIds = new Set(doors);
    this.motionSensorIds = new Set(motions);
  }

  public useManualConfig() {
    this.doorSensorIds = new Set(this.manualDoorSensors);
    this.motionSensorIds = new Set(this.manualMotionSensors);
    this.currentZoneId = null;
  }

  public isDoorSensor(id: string): boolean {
    return this.doorSensorIds.has(id);
  }

  public isMotionSensor(id: string): boolean {
    return this.motionSensorIds.has(id);
  }

  public getAllDoorSensorIds(): string[] {
    return Array.from(this.doorSensorIds);
  }

  public getAllMotionSensorIds(): string[] {
    return Array.from(this.motionSensorIds);
  }

  public shouldRescan(id: string, newZone?: string): boolean {
    return (
      this.virtualSensorUuid !== null
      && id === this.virtualSensorUuid
      && newZone !== undefined
      && newZone !== this.currentZoneId
    );
  }
}
