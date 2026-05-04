/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, act, cleanup } from '@testing-library/react';
import { ProactiveNudgeToast } from '../../src/components/ProactiveNudgeToast';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: React.forwardRef(({ children, ...props }: any, ref: any) => <div ref={ref} {...props}>{children}</div>),
  },
}));

function setupElectronAPI(onNudge = vi.fn().mockReturnValue(() => {})) {
  (window as any).electronAPI = { proactiveAdvice: { onNudge } };
  return onNudge;
}

describe('ProactiveNudgeToast', () => {
  afterEach(() => { cleanup(); delete (window as any).electronAPI; });

  it('renders nothing when electronAPI is missing', () => {
    const { container } = render(<ProactiveNudgeToast />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nudge message when received', () => {
    let nudgeCb: ((d: any) => void) | null = null;
    setupElectronAPI(vi.fn().mockImplementation((cb: any) => { nudgeCb = cb; return () => {}; }));
    const { getByText } = render(<ProactiveNudgeToast />);
    act(() => nudgeCb!({ message: 'Address the pricing concern', meeting_id: 'm1', timestamp: Date.now() }));
    expect(getByText('Address the pricing concern')).toBeTruthy();
  });

  it('dismisses on X click', () => {
    let nudgeCb: ((d: any) => void) | null = null;
    setupElectronAPI(vi.fn().mockImplementation((cb: any) => { nudgeCb = cb; return () => {}; }));
    const { getByLabelText, container } = render(<ProactiveNudgeToast />);
    act(() => nudgeCb!({ message: 'Test nudge', meeting_id: 'm1', timestamp: Date.now() }));
    fireEvent.click(getByLabelText('Dismiss'));
    expect(container.querySelector('p')).toBeNull();
  });

  it('auto-dismisses after 10 seconds', () => {
    vi.useFakeTimers();
    let nudgeCb: ((d: any) => void) | null = null;
    setupElectronAPI(vi.fn().mockImplementation((cb: any) => { nudgeCb = cb; return () => {}; }));
    const { container } = render(<ProactiveNudgeToast />);
    act(() => nudgeCb!({ message: 'Test nudge', meeting_id: 'm1', timestamp: Date.now() }));
    expect(container.querySelector('p')).not.toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(container.querySelector('p')).toBeNull();
    vi.useRealTimers();
  });
});
