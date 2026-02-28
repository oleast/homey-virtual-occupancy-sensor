/* eslint-disable import/prefer-default-export */
import { VirtualOccupancySensorDevice, OnSettingsEvent } from '../drivers/virtual-occupancy-sensor/device';
import { OccupancyState, TriggerContext } from '../lib/types';
import { VirtualOccupancySensorControllerForTest } from './virtual-occupancy-sensor-controller-for-test';

export class VirtualOccupancySensorDeviceForTest extends VirtualOccupancySensorDevice {
  protected declare controller: VirtualOccupancySensorControllerForTest;

  async onInit() {
    // Create our test controller BEFORE calling super.onInit()
    // This will be immediately overwritten by super.onInit(), so we save it
    const testController = new VirtualOccupancySensorControllerForTest(
      (state: OccupancyState, context: TriggerContext) => {
        this.onStateChange(state, context).catch(this.error);
      },
      this.log.bind(this),
      this.error.bind(this),
    );
    await super.onInit();
    // Override the controller with our test controller after super.onInit()
    this.controller = testController;
  }

  public forceOccupancyState(state: OccupancyState) {
    this.controller.setOccupancyState(state);
  }

  public async callOnSettings(event: OnSettingsEvent): Promise<void> {
    return this.onSettings(event);
  }
}
