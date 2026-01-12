import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import CapabilityListenerManager from '../lib/capability-listener-manager';
import { HomeyDevice, MonitorCallbacks } from '../lib/types';

describe('CapabilityListenerManager', () => {
  let manager: CapabilityListenerManager;
  let mockCallbacks: MonitorCallbacks;
  let mockHandler: (value: unknown) => Promise<void>;

  beforeEach(() => {
    mockCallbacks = {
      log: vi.fn(),
      error: vi.fn(),
    } as unknown as MonitorCallbacks;
    mockHandler = vi.fn().mockResolvedValue(undefined);
    manager = new CapabilityListenerManager(mockCallbacks, mockHandler);
  });

  it('should register a listener and handle events', () => {
    let capturedCallback: ((val: unknown) => void) | undefined;

    const mockInstance = {
      destroy: vi.fn(),
    };

    const mockDevice = {
      id: 'd1',
      name: 'Device 1',
      makeCapabilityInstance: vi.fn((capId, callback) => {
        capturedCallback = callback;
        return mockInstance;
      }),
    } as unknown as HomeyDevice;

    manager.register(mockDevice, 'alarm_contact');

    expect(mockDevice.makeCapabilityInstance).toHaveBeenCalledWith('alarm_contact', expect.any(Function));

    // Simulate event
    if (capturedCallback) {
      capturedCallback(true);
    }

    expect(mockHandler).toHaveBeenCalledWith('d1', 'alarm_contact', true);
  });

  it('should not register duplicate listeners', () => {
    const mockDevice = {
      id: 'd1',
      name: 'Device 1',
      makeCapabilityInstance: vi.fn(),
    } as unknown as HomeyDevice;

    manager.register(mockDevice, 'cap1');
    manager.register(mockDevice, 'cap1'); // Duplicate

    expect(mockDevice.makeCapabilityInstance).toHaveBeenCalledTimes(1);
  });

  it('should cleanup listeners on clear', () => {
    const mockDestroy = vi.fn();
    const mockDevice = {
      id: 'd1',
      name: 'Device 1',
      makeCapabilityInstance: vi.fn().mockReturnValue({ destroy: mockDestroy }),
    } as unknown as HomeyDevice;

    manager.register(mockDevice, 'cap1');
    manager.clear();

    expect(mockDestroy).toHaveBeenCalled();
  });
});
