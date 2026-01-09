'use strict';

import Homey from 'homey';

module.exports = class VirtualOccupancySensorDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('VirtualOccupancySensorDriver has been initialized');

    // Register flow cards
    this.registerFlowCards();
  }

  /**
   * Register flow card listeners
   */
  registerFlowCards() {
    // Condition: is_occupied
    const isOccupiedCondition = this.homey.flow.getConditionCard('is_occupied');
    isOccupiedCondition.registerRunListener(async (args, state) => {
      const { device } = args;
      const occupancyState = device.getCapabilityValue('occupancy_state');
      return occupancyState === 'occupied';
    });

    // Condition: occupancy_state_is
    const occupancyStateIsCondition = this.homey.flow.getConditionCard('occupancy_state_is');
    occupancyStateIsCondition.registerRunListener(async (args, state) => {
      const { device } = args;
      const currentState = device.getCapabilityValue('occupancy_state');
      return currentState === args.state;
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' template is selected.
   * This method should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return [
      {
        name: 'Virtual Occupancy Sensor',
        data: {
          id: `virtual-occupancy-${Date.now()}`,
        },
      },
    ];
  }

};
