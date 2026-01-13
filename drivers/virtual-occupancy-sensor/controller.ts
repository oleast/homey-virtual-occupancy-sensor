import { OccupancyState } from '../../lib/types';

export type StateChangeCallback = (state: OccupancyState) => void;
export type TimerCallback = (durationMs: number) => void;
export type CancelTimerCallback = () => void;

type EventType = 'door_open' | 'door_close' | 'motion' | 'timeout';

export class VirtualOccupancySensorController {
  private currentState: OccupancyState = 'empty';
  private onStateChange: StateChangeCallback;
  private startTimer: TimerCallback;
  private cancelTimer: CancelTimerCallback;
  private log: (message: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private error: (message: string, error?: unknown) => void;
  private motionTimeoutMs: number = 30 * 1000; // Default 30s

  constructor(
    onStateChange: StateChangeCallback,
    startTimer: TimerCallback,
    cancelTimer: CancelTimerCallback,
    log: (message: string) => void,
    error: (message: string, error?: unknown) => void,
  ) {
    this.onStateChange = onStateChange;
    this.startTimer = startTimer;
    this.cancelTimer = cancelTimer;
    this.log = log;
    this.error = error;
  }

  public setMotionTimeout(seconds: number) {
    this.motionTimeoutMs = seconds * 1000;
  }

  public registerEvent(eventType: EventType, deviceId?: string) {
    this.log(`Received event: ${eventType} from ${deviceId || 'system'}. Current state: ${this.currentState}`);

    switch (this.currentState) {
      case 'empty':
        this.handleEventInEmpty(eventType);
        break;
      case 'occupied':
        this.handleEventInOccupied(eventType);
        break;
      case 'door_open':
        this.handleEventInDoorOpen(eventType);
        break;
      case 'checking':
        this.handleEventInChecking(eventType);
        break;
      default:
        this.error(`Unknown state: ${this.currentState}`);
    }
  }

  public async setOccupancyState(state: OccupancyState) {
    await this.transitionTo(state);
  }

  private transitionTo(newState: OccupancyState) {
    if (this.currentState === newState) return;
    this.log(`Transitioning from ${this.currentState} to ${newState}`);
    this.currentState = newState;
    this.onStateChange(newState);
  }

  // --- State Handlers ---

  private handleEventInEmpty(event: EventType) {
    if (event === 'motion') {
      this.transitionTo('occupied');
    } else if (event === 'door_open') {
      this.transitionTo('door_open');
    }
  }

  private handleEventInOccupied(event: EventType) {
    if (event === 'door_open') {
      this.transitionTo('door_open');
    }
    // Ignore motion in occupied state (already occupied)
  }

  private handleEventInDoorOpen(event: EventType) {
    if (event === 'door_close') {
      // Ambiguous state: Did user leave or stay?
      // Logic: Transition to checking to verify presence.
      this.transitionTo('checking');
      this.startTimer(this.motionTimeoutMs);
    }
    // Keep internal track of motion? Not effectively needed if we always go to checking upon close.
    // The previous implementation tried to guess immediately.
    // Reliable FSM approach: Always check -> Verify -> Occupied/Empty.
  }

  private handleEventInChecking(event: EventType) {
    if (event === 'motion') {
      // Motion confirmed: User stayed.
      this.cancelTimer();
      this.transitionTo('occupied');
    } else if (event === 'door_open') {
      // Door opened again: Reset checking logic.
      this.cancelTimer();
      this.transitionTo('door_open');
    } else if (event === 'timeout') {
      // No motion detected within window: User left.
      this.transitionTo('empty');
    }
  }
}
