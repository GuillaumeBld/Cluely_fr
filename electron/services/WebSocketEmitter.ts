import WebSocket from 'ws';
import { IpcEventBus, ProactiveNudgePayload, LiveNoteSnapshot, DecisionCapturedEvent, TranscriptTurnPayload } from './IpcEventBus';
import { getWsConfig } from '../config/wsConfig';

export class WebSocketEmitter {
  private wss: WebSocket.Server | null = null;

  // Bound handlers for offTyped compatibility
  private _onTranscript = (p: TranscriptTurnPayload) => this._broadcast('transcript:turn', p);
  private _onNudge = (p: ProactiveNudgePayload) => this._broadcast('proactive:nudge', p);
  private _onNotes = (p: LiveNoteSnapshot) => this._broadcast('notes:updated', p);
  private _onDecision = (p: DecisionCapturedEvent) => this._broadcast('decision:captured', p);
  private _onMeetingStarted = (p: { meeting_id: string }) => this._broadcast('meeting:started', p);
  private _onMeetingEnded = (p: { meeting_id: string }) => this._broadcast('meeting:ended', p);

  start(port?: number): void {
    this.stop();
    const resolvedPort = port ?? getWsConfig().port;
    try {
      this.wss = new WebSocket.Server({ port: resolvedPort });
      this.wss.on('connection', (ws) => {
        console.log('[WebSocketEmitter] Client connected');
        ws.on('close', () => console.log('[WebSocketEmitter] Client disconnected'));
      });
      this.wss.on('error', (err) => console.error('[WebSocketEmitter] Server error:', err));
      console.log(`[WebSocketEmitter] Listening on port ${resolvedPort}`);
      // Subscribe to events
      IpcEventBus.onTyped('transcript:turn', this._onTranscript);
      IpcEventBus.onTyped('proactive:nudge', this._onNudge);
      IpcEventBus.onTyped('notes:updated', this._onNotes);
      IpcEventBus.onTyped('decision:captured', this._onDecision);
      IpcEventBus.onTyped('meeting:started', this._onMeetingStarted);
      IpcEventBus.onTyped('meeting:ended', this._onMeetingEnded);
    } catch (err) {
      console.error('[WebSocketEmitter] Failed to start:', err);
    }
  }

  stop(): void {
    IpcEventBus.offTyped('transcript:turn', this._onTranscript);
    IpcEventBus.offTyped('proactive:nudge', this._onNudge);
    IpcEventBus.offTyped('notes:updated', this._onNotes);
    IpcEventBus.offTyped('decision:captured', this._onDecision);
    IpcEventBus.offTyped('meeting:started', this._onMeetingStarted);
    IpcEventBus.offTyped('meeting:ended', this._onMeetingEnded);
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      console.log('[WebSocketEmitter] Stopped');
    }
  }

  private _broadcast(event: string, payload: unknown): void {
    if (!this.wss) return;
    const msg = JSON.stringify({ event, payload, timestamp: Date.now() });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(msg);
        } catch (err) {
          console.warn('[WebSocketEmitter] Failed to send to client:', err);
        }
      }
    });
  }
}
