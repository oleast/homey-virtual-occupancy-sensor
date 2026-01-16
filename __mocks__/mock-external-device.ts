/* eslint-disable import/prefer-default-export */

/**
 * MockExternalDevice simulates an external Homey device (motion sensor, door sensor, etc.)
 * for testing purposes. It allows tests to trigger capability changes and observe
 * how the device under test responds to those events.
 */
export class MockExternalDevice {
  public id: string;
  public name: string;
  public capabilities: string[];
  public capabilitiesObj: Record<string, { value: unknown }>;
  public listeners: Map<string, (val: unknown) => void> = new Map();

  constructor(id: string, capabilities: string[]) {
    this.id = id;
    this.name = `Device ${id}`;
    this.capabilities = capabilities;
    this.capabilitiesObj = {};
    capabilities.forEach((cap) => {
      this.capabilitiesObj[cap] = { value: false }; // Default false
    });
  }

  makeCapabilityInstance(capabilityId: string, listener: (val: unknown) => void) {
    console.log(`[MockExternalDevice] makeCapabilityInstance called for ${this.id}, cap: ${capabilityId}`);
    if (!this.capabilities.includes(capabilityId)) {
      throw new Error(`Capability ${capabilityId} not found on device ${this.id}`);
    }
    this.listeners.set(capabilityId, listener);
    return {
      destroy: () => {
        this.listeners.delete(capabilityId);
      },
    };
  }

  async setCapabilityValue(capabilityId: string, value: unknown) {
    console.log(`[MockExternalDevice] setCapabilityValue called for ${this.id}, cap: ${capabilityId} = ${value}`);
    this.capabilitiesObj[capabilityId] = { value };
    const listener = this.listeners.get(capabilityId);
    if (listener) {
      console.log(`[MockExternalDevice] Triggering listener for ${this.id}`);
      await listener(value);
    } else {
      console.log(`[MockExternalDevice] NO LISTENER found for ${this.id}, cap: ${capabilityId}`);
      console.log('Listeners keys:', Array.from(this.listeners.keys()));
    }
  }
}
