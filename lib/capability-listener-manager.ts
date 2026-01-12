// capability-listener-manager.ts
import { CapabilityInstance, MonitorCallbacks } from './types';

type EventHandler = (
    deviceId: string,
    capabilityId: string,
    value: boolean
) => Promise<void>;

export default class CapabilityListenerManager {
  private capabilityInstances: Map<string, CapabilityInstance> = new Map();
  private callbacks: MonitorCallbacks;
  private handler: EventHandler;

  constructor(callbacks: MonitorCallbacks, handler: EventHandler) {
    this.callbacks = callbacks;
    this.handler = handler;
  }

  public register(device: HomeyDevice, capabilityId: string) {
    // Avoid double registration
    const key = `${device.id}:${capabilityId}`;
    if (this.capabilityInstances.has(key)) return;

    try {
      const instance = device.makeCapabilityInstance(capabilityId, (value: unknown) => {
        this.callbacks.log(`[EVENT] ${device.name} (${capabilityId}) -> ${value}`);
        if (typeof value === 'boolean') {
          this.handler(device.id, capabilityId, value)
            .catch((err) => this.callbacks.error('Error in event handler', err));
        }
      });

      this.capabilityInstances.set(key, instance);
      this.callbacks.log(`Registered listener for ${device.name}:${capabilityId}`);
    } catch (err) {
      this.callbacks.error(`Failed to register listener for ${device.name}:${capabilityId}`, err);
    }
  }

  public clear() {
    for (const [, instance] of this.capabilityInstances) {
      if (typeof instance.destroy === 'function') {
        instance.destroy();
      }
    }
    this.capabilityInstances.clear();
  }
}
