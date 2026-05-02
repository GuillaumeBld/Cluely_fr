import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntelligenceManager } from '../../electron/IntelligenceManager';

function makeMgr(): IntelligenceManager {
  const llmHelper = {
    generateMeetingSummary: vi.fn().mockResolvedValue(''),
    chat: vi.fn().mockResolvedValue(''),
  } as any;
  return new IntelligenceManager(llmHelper);
}

describe('IntelligenceManager — interim transcript tracking', () => {
  let mgr: IntelligenceManager;

  beforeEach(() => {
    mgr = makeMgr();
  });

  it('stores the latest user interim in lastInterimUser and clears it on a final', () => {
    const addSpy = vi.spyOn(mgr as any, 'addTranscript');

    // Interim — should be tracked
    mgr.handleTranscript({ speaker: 'user', text: 'I will follow', timestamp: Date.now(), final: false });
    // Final — should clear the interim tracker
    mgr.handleTranscript({ speaker: 'user', text: 'I will follow up.', timestamp: Date.now(), final: true });

    // After a final, lastInterimUser must be null
    expect((mgr as any).lastInterimUser).toBeNull();
    // addTranscript is called for both segments; non-final is dropped by the early-return guard in addTranscript
    expect(addSpy).toHaveBeenCalledTimes(2);
    const committedCalls = addSpy.mock.calls.filter(([seg]: any) => seg.final);
    expect(committedCalls).toHaveLength(1);
    expect(committedCalls[0][0].text).toBe('I will follow up.');
  });

  it('force-saves a pending user interim when stopMeeting is called', async () => {
    const addSpy = vi.spyOn(mgr as any, 'addTranscript');

    // Simulate an interim arriving (user mid-sentence)
    mgr.handleTranscript({ speaker: 'user', text: 'I will handle the', timestamp: Date.now() - 100, final: false });

    // Stub processAndSaveMeeting to avoid DB/LLM calls
    vi.spyOn(mgr as any, 'processAndSaveMeeting').mockResolvedValue(undefined);
    // Make sessionStartTime old enough that durationMs > 1000
    (mgr as any).sessionStartTime = Date.now() - 5000;

    await mgr.stopMeeting();

    // The force-saved call should be marked final=true with the interim text
    const forceSaved = addSpy.mock.calls.find(([seg]: any) => seg.final && seg.text === 'I will handle the');
    expect(forceSaved).toBeDefined();
    // After stopMeeting, lastInterimUser must be null
    expect((mgr as any).lastInterimUser).toBeNull();
  });

  it('force-saves pending user interim even when session is too short (< 1s)', async () => {
    const addSpy = vi.spyOn(mgr as any, 'addTranscript');

    mgr.handleTranscript({ speaker: 'user', text: 'Wait—', timestamp: Date.now(), final: false });

    // sessionStartTime stays at "just now" — durationMs < 1000; do NOT stub processAndSaveMeeting
    await mgr.stopMeeting();

    // Force-save must have run even though the meeting was abandoned
    const forceSaved = addSpy.mock.calls.find(([seg]: any) => seg.final && seg.text === 'Wait—');
    expect(forceSaved).toBeDefined();
    expect((mgr as any).lastInterimUser).toBeNull();
  });

  it('interviewer interim does not affect lastInterimUser', () => {
    mgr.handleTranscript({ speaker: 'interviewer', text: 'Tell me about', timestamp: Date.now(), final: false });
    expect((mgr as any).lastInterimUser).toBeNull();
  });

  it('reset() clears both lastInterimInterviewer and lastInterimUser', () => {
    // Directly set both fields to simulate mid-session state
    (mgr as any).lastInterimInterviewer = {
      speaker: 'interviewer', text: 'Can you tell me', timestamp: Date.now(), final: false,
    };
    (mgr as any).lastInterimUser = {
      speaker: 'user', text: 'Sure I will', timestamp: Date.now(), final: false,
    };

    mgr.reset();

    expect((mgr as any).lastInterimInterviewer).toBeNull();
    expect((mgr as any).lastInterimUser).toBeNull();
  });
});
