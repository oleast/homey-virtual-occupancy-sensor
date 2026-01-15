/* eslint-disable max-classes-per-file */
/* eslint-disable homey-app/global-timers */
/* eslint-disable no-console */
// tests/__mocks__/homey.ts
import { EventEmitter } from 'events';

export class Device extends EventEmitter {
  // Add an index signature to allow setting arbitrary properties if needed
  [key: string]: unknown;

  log(...args: unknown[]) {
    console.log(...args);
  }

  error(...args: unknown[]) {
    console.error(...args);
  }

  async setCapabilityValue(id: string, value: unknown) {
    // Intentionally empty logic, to be spied on
    return Promise.resolve();
  }

  getCapabilityValue(id: string) {
    return null;
  }

  hasCapability(id: string) {
    return true;
  }

  onInit() {}
  onDeleted() {}
  getSettings() {
    return {};
  }

  getData() {
    return { id: 'virtual-device-id' };
  }

  homey = {
    setTimeout: (callback: () => void, delay?: number | undefined) => setTimeout(callback, delay),
    clearTimeout: (timeout: string | number | NodeJS.Timeout | undefined) => clearTimeout(timeout),
    flow: {
      getDeviceTriggerCard: () => ({ trigger: async () => true }),
      getActionCard: () => ({ registerRunListener: () => {} }),
    },
    api: {
      getLocalUrl: async () => 'http://localhost',
      getOwnerApiToken: async () => 'token',
    },
  };
}

export class FlowCardDeviceTrigger {}

const Homey = {
  Device,
  FlowCardDeviceTrigger,
};

export default Homey;
