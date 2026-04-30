/* eslint-disable import/prefer-default-export */
import { VirtualOccupancySensorDevice, OnSettingsEvent } from '../drivers/virtual-occupancy-sensor/device';
import { OccupancyState, TriggerContext } from '../lib/types';
import { VirtualOccupancySensorControllerForTest } from './virtual-occupancy-sensor-controller-for-test';

export class VirtualOccupancySensorDeviceForTest extends VirtualOccupancySensorDevice {
  protected declare controller: VirtualOccupancySensorControllerForTest;

  async onInit() {
    await super.onInit();
    // Create test controller AFTER super.onInit() with the resolved state
    const persistedState = this.getCapabilityValue('occupancy_state') as OccupancyState | null;
    let restoredState: OccupancyState;
    switch (persistedState) {
      case 'occupied':
      case 'empty':
      case 'door_open':
        restoredState = persistedState;
        break;
      case 'checking':
        restoredState = 'door_open';
        break;
      default:
        restoredState = 'empty';
    }
    this.controller = new VirtualOccupancySensorControllerForTest(
      (state: OccupancyState, context: TriggerContext) => {
        this.onStateChange(state, context).catch(this.error);
      },
      this.log.bind(this),
      this.error.bind(this),
      restoredState,
    );
  }

  public forceOccupancyState(state: OccupancyState) {
    this.controller.setOccupancyState(state);
  }

  public async callOnSettings(event: OnSettingsEvent): Promise<void> {
    return this.onSettings(event);
  }
}
