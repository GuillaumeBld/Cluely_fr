import { IpcEventBus } from './IpcEventBus';

export class AgentStateManager {
  private _isCallActive = false;

  private onStarted = () => { this._isCallActive = true; };
  private onEnded = () => { this._isCallActive = false; };

  constructor() {
    IpcEventBus.onTyped('meeting:started', this.onStarted);
    IpcEventBus.onTyped('meeting:ended', this.onEnded);
  }

  isPaused(): boolean {
    return this._isCallActive;
  }

  dispose(): void {
    IpcEventBus.offTyped('meeting:started', this.onStarted);
    IpcEventBus.offTyped('meeting:ended', this.onEnded);
  }
}
