'use strict';

import Homey from 'homey';

module.exports = class VirtualOccupancySensorApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Virtual Occupancy Sensor App has been initialized');
  }

};
