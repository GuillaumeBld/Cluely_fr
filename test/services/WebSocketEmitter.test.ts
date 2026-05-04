import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ws module before importing WebSocketEmitter
const mockClose = vi.fn();
const mockOn = vi.fn();
let mockClients: Set<any>;

vi.mock('ws', () => {
  const MockServer = vi.fn().mockImplementation(() => {
    mockClients = new Set();
    return {
      clients: mockClients,
      on: mockOn,
      close: mockClose,
    };
  });
  return {
    default: Object.assign(MockServer, {
      Server: MockServer,
      OPEN: 1,
    }),
  };
});

import WebSocket from 'ws';
import { WebSocketEmitter } from '../../electron/services/WebSocketEmitter';
import { IpcEventBus } from '../../electron/services/IpcEventBus';

describe('WebSocketEmitter', () => {
  let emitter: WebSocketEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    emitter = new WebSocketEmitter();
  });

  afterEach(() => {
    emitter.stop();
  });

  it('start() creates a ws.Server and logs the port', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitter.start(9999);
    expect(logSpy).toHaveBeenCalledWith('[WebSocketEmitter] Listening on port 9999');
    logSpy.mockRestore();
  });

  it('stop() closes the server and logs', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    emitter.start(9999);
    emitter.stop();
    expect(mockClose).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('[WebSocketEmitter] Stopped');
    logSpy.mockRestore();
  });

  it('stop() before start() does not throw', () => {
    expect(() => emitter.stop()).not.toThrow();
  });

  it('start() called twice stops the first server (idempotent restart)', () => {
    emitter.start(9999);
    emitter.start(9999);
    // close() called once by the second start() stopping the first
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('broadcasts event to connected OPEN clients', () => {
    emitter.start(9999);
    const sendSpy = vi.fn();
    mockClients.add({ readyState: 1, send: sendSpy, terminate: vi.fn() }); // OPEN = 1

    IpcEventBus.emitTyped('proactive:nudge', {
      message: 'test nudge',
      meeting_id: 'mtg-1',
      timestamp: 123,
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sendSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('proactive:nudge');
    expect(parsed.payload.message).toBe('test nudge');
    expect(parsed.timestamp).toBeTypeOf('number');
  });

  it('skips non-OPEN clients during broadcast', () => {
    emitter.start(9999);
    const openSend = vi.fn();
    const closedSend = vi.fn();
    mockClients.add({ readyState: 1, send: openSend, terminate: vi.fn() });   // OPEN
    mockClients.add({ readyState: 3, send: closedSend, terminate: vi.fn() });  // CLOSED

    IpcEventBus.emitTyped('meeting:started', { meeting_id: 'mtg-1' });

    expect(openSend).toHaveBeenCalledTimes(1);
    expect(closedSend).not.toHaveBeenCalled();
  });

  it('handles client.send() errors gracefully', () => {
    emitter.start(9999);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingSend = vi.fn().mockImplementation(() => { throw new Error('broken pipe'); });
    mockClients.add({ readyState: 1, send: failingSend, terminate: vi.fn() });

    // Should not throw
    expect(() => {
      IpcEventBus.emitTyped('meeting:ended', { meeting_id: 'mtg-1' });
    }).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      '[WebSocketEmitter] Failed to send to client:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('forwards transcript:turn events', () => {
    emitter.start(9999);
    const sendSpy = vi.fn();
    mockClients.add({ readyState: 1, send: sendSpy, terminate: vi.fn() });

    IpcEventBus.emitTyped('transcript:turn', {
      turn_id: 'interviewer_1',
      speaker: 'interviewer',
      text: 'Hello there',
      timestamp: 100,
      final: true,
      meeting_id: 'mtg-1',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sendSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('transcript:turn');
    expect(parsed.payload.text).toBe('Hello there');
  });

  it('forwards notes:updated events', () => {
    emitter.start(9999);
    const sendSpy = vi.fn();
    mockClients.add({ readyState: 1, send: sendSpy, terminate: vi.fn() });

    IpcEventBus.emitTyped('notes:updated', {
      meeting_id: 'mtg-1',
      timestamp: 100,
      action_items: [{ speaker: 'Bob', text: 'Do the thing' }],
      decisions: [],
      turn_count: 5,
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sendSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('notes:updated');
  });

  it('forwards decision:captured events', () => {
    emitter.start(9999);
    const sendSpy = vi.fn();
    mockClients.add({ readyState: 1, send: sendSpy, terminate: vi.fn() });

    IpcEventBus.emitTyped('decision:captured', {
      type: 'commitment',
      speaker: 'Alice',
      timestamp: 100,
      text_excerpt: 'I will do X',
      confidence: 0.9,
      meeting_id: 'mtg-1',
      turn_id: 'user_1',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(sendSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('decision:captured');
  });

  it('unregisters IpcEventBus listeners on stop()', () => {
    const offSpy = vi.spyOn(IpcEventBus, 'offTyped');
    emitter.start(9999);
    emitter.stop();
    expect(offSpy).toHaveBeenCalledWith('transcript:turn', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('proactive:nudge', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('notes:updated', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('decision:captured', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('meeting:started', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('meeting:ended', expect.any(Function));
    offSpy.mockRestore();
  });

  it('start() with no port uses getWsConfig().port (default 8765)', () => {
    emitter.start();
    expect(WebSocket.Server).toHaveBeenCalledWith({ port: 8765 });
  });

  it('stop() terminates all connected clients before closing', () => {
    emitter.start(9999);
    const terminateSpy1 = vi.fn();
    const terminateSpy2 = vi.fn();
    mockClients.add({ readyState: 1, send: vi.fn(), terminate: terminateSpy1 });
    mockClients.add({ readyState: 3, send: vi.fn(), terminate: terminateSpy2 });
    emitter.stop();
    expect(terminateSpy1).toHaveBeenCalledTimes(1);
    expect(terminateSpy2).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalled();
  });

  it('start() propagates errors (EADDRINUSE) to caller', () => {
    const eaddrinuse = Object.assign(new Error('bind EADDRINUSE :::9999'), { code: 'EADDRINUSE' });
    (WebSocket.Server as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw eaddrinuse; });
    expect(() => emitter.start(9999)).toThrow('bind EADDRINUSE :::9999');
  });

  it('start() failure leaves no IpcEventBus listeners registered', () => {
    const onSpy = vi.spyOn(IpcEventBus, 'onTyped');
    const eaddrinuse = Object.assign(new Error('bind EADDRINUSE :::9999'), { code: 'EADDRINUSE' });
    (WebSocket.Server as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw eaddrinuse; });
    try { emitter.start(9999); } catch { /* expected */ }
    expect(onSpy).not.toHaveBeenCalled();
    onSpy.mockRestore();
  });
});
