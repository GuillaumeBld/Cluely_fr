/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { PreBriefBanner } from '../../src/components/PreBriefBanner';

// Mock framer-motion to avoid animation complexity in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <div ref={ref} {...props}>{children}</div>
    )),
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  X: ({ size, ...props }: any) => <span data-testid="x-icon" {...props}>X</span>,
}));

const mockBrief = {
  eventId: 'evt-1',
  eventTitle: 'Daily Standup',
  startsAt: new Date().toISOString(),
  projectId: null,
  templateId: 'standup',
  attendees: [
    {
      email: 'alice@example.com',
      recentEmails: [{ subject: 'Sprint update', sender: 'alice@example.com', date: '2026-04-29', snippet: 'Here are the updates...', mailbox: 'inbox' }],
      openItems: [],
      priorDecisions: [],
    },
  ],
  firedAt: Date.now(),
};

function setupElectronAPI(overrides: Partial<{
  getLastBrief: () => Promise<any>;
  onBriefReady: (cb: (brief: any) => void) => () => void;
}> = {}) {
  (window as any).electronAPI = {
    preMeeting: {
      getLastBrief: overrides.getLastBrief ?? vi.fn().mockResolvedValue(null),
      onBriefReady: overrides.onBriefReady ?? vi.fn().mockReturnValue(() => {}),
    },
  };
}

describe('PreBriefBanner', () => {
  beforeEach(() => {
    delete (window as any).electronAPI;
  });

  afterEach(() => {
    cleanup();
    delete (window as any).electronAPI;
  });

  it('renders nothing when no brief is available', async () => {
    setupElectronAPI();
    const { container } = render(<PreBriefBanner />);

    // Wait for useEffect to run
    await waitFor(() => {
      expect((window as any).electronAPI.preMeeting.getLastBrief).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when electronAPI is missing', () => {
    const { container } = render(<PreBriefBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders brief title when brief is loaded via getLastBrief', async () => {
    setupElectronAPI({
      getLastBrief: vi.fn().mockResolvedValue(mockBrief),
    });

    const { findByText } = render(<PreBriefBanner />);
    expect(await findByText('Daily Standup')).toBeTruthy();
  });

  it('renders attendee email and recent email subject', async () => {
    setupElectronAPI({
      getLastBrief: vi.fn().mockResolvedValue(mockBrief),
    });

    const { findByText, findAllByText } = render(<PreBriefBanner />);
    expect(await findByText('alice@example.com')).toBeTruthy();
    const subjects = await findAllByText('Sprint update');
    expect(subjects.length).toBeGreaterThanOrEqual(1);
  });

  it('renders template ID badge', async () => {
    setupElectronAPI({
      getLastBrief: vi.fn().mockResolvedValue(mockBrief),
    });

    const { findByText } = render(<PreBriefBanner />);
    expect(await findByText('standup')).toBeTruthy();
  });

  it('dismisses on X click', async () => {
    setupElectronAPI({
      getLastBrief: vi.fn().mockResolvedValue(mockBrief),
    });

    const { findByLabelText, container } = render(<PreBriefBanner />);
    const dismissBtn = await findByLabelText('Dismiss');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('renders brief received via onBriefReady callback', async () => {
    let briefReadyCallback: ((b: any) => void) | null = null;
    setupElectronAPI({
      onBriefReady: vi.fn().mockImplementation((cb: (b: any) => void) => {
        briefReadyCallback = cb;
        return () => {};
      }),
    });

    const { findByText } = render(<PreBriefBanner />);

    // Simulate IPC push
    act(() => {
      briefReadyCallback!(mockBrief);
    });

    expect(await findByText('Daily Standup')).toBeTruthy();
  });

  it('handles IPC fetch error gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupElectronAPI({
      getLastBrief: vi.fn().mockRejectedValue(new Error('IPC broken')),
    });

    const { container } = render(<PreBriefBanner />);

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[PreBriefBanner] Failed to fetch brief:',
        expect.any(Error),
      );
    });

    expect(container.firstChild).toBeNull();
    warnSpy.mockRestore();
  });
});
