import { IpcEventBus, TokenAnomalyEvent } from "./IpcEventBus";

export class TokenUsageTracker {
  private window: number[] = [];
  private activeMeetingId = "";

  constructor(
    private readonly windowSize: number = 10,
    private readonly anomalyMultiple: number = 2.0
  ) {}

  start(meetingId: string): void {
    this.activeMeetingId = meetingId;
    this.window = [];
  }

  stop(): void {
    this.activeMeetingId = "";
    this.window = [];
  }

  record(tokenCount: number): void {
    if (!this.activeMeetingId) return;

    if (this.window.length >= 2) {
      const mean = this.window.reduce((a, b) => a + b, 0) / this.window.length;
      if (tokenCount > this.anomalyMultiple * mean) {
        IpcEventBus.emitTyped("token:anomaly", {
          meeting_id: this.activeMeetingId,
          token_count: tokenCount,
          rolling_avg: mean,
          threshold_multiple: this.anomalyMultiple,
          timestamp: Date.now(),
        });
      }
    }

    this.window.push(tokenCount);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }
  }
}
