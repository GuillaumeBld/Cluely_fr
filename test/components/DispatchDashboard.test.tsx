/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent, act, cleanup, waitFor } from '@testing-library/react';
import { DispatchDashboard } from '../../src/components/DispatchDashboard';

const mockGetSnapshots = vi.fn();
const mockRefresh = vi.fn();
const mockOnSnapshotsUpdated = vi.fn();

const sampleSnapshots = [
  {
    projectId: 'finbiz',
    content: '# Finbiz Health — 2026-05-01T10:00:00Z\n\n**Status:** healthy',
    fetchedAt: new Date().toISOString(),
    stale: false,
  },
  {
    projectId: 'qualiaai',
    content: '# Qualiaai Health — 2026-05-01T10:00:00Z\n\n**Status:** degraded\n\n## Alerts\n- High latency\n- Timeout',
    fetchedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    stale: true,
  },
];

describe('DispatchDashboard', () => {
  beforeEach(() => {
    mockGetSnapshots.mockResolvedValue(sampleSnapshots);
    mockRefresh.mockResolvedValue({ success: true });
    mockOnSnapshotsUpdated.mockReturnValue(() => {});

    (window as any).electronAPI = {
      dashboard: {
        getSnapshots: mockGetSnapshots,
        refresh: mockRefresh,
        onSnapshotsUpdated: mockOnSnapshotsUpdated,
      },
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as any).electronAPI;
  });

  it('renders project cards from getSnapshots', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    expect(result!.getByText('finbiz')).toBeTruthy();
    expect(result!.getByText('qualiaai')).toBeTruthy();
  });

  it('shows correct status text', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    expect(result!.getByText('healthy')).toBeTruthy();
    expect(result!.getByText('degraded')).toBeTruthy();
  });

  it('shows stale indicator when stale is true', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    expect(result!.getByText('stale')).toBeTruthy();
  });

  it('shows alert count', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    expect(result!.getByText('2 alerts')).toBeTruthy();
  });

  it('calls refresh on Refresh button click', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    const refreshBtn = result!.getByLabelText('Refresh');
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('subscribes to onSnapshotsUpdated on mount', async () => {
    await act(async () => {
      render(<DispatchDashboard />);
    });

    expect(mockOnSnapshotsUpdated).toHaveBeenCalledWith(expect.any(Function));
  });

  it('dismisses on X button click', async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    const dismissBtn = result!.getByLabelText('Dismiss');
    await act(async () => {
      fireEvent.click(dismissBtn);
    });

    // After dismiss, the Dispatch header should no longer be queryable
    // (AnimatePresence may keep DOM briefly, so use waitFor)
    await waitFor(() => {
      expect(result!.queryByText('Dispatch')).toBeNull();
    });
  });

  it('renders nothing when electronAPI is not available', async () => {
    delete (window as any).electronAPI;
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });
    // Dashboard should not render any content without API
    expect(result!.queryByText('Dispatch')).toBeNull();
  });

  it('calls IPC subscription cleanup on unmount', async () => {
    const mockCleanup = vi.fn();
    mockOnSnapshotsUpdated.mockReturnValue(mockCleanup);

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    act(() => {
      result!.unmount();
    });

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('does not call refresh again while already refreshing', async () => {
    let resolveRefresh!: () => void;
    mockRefresh.mockReturnValue(new Promise<{ success: boolean }>(r => { resolveRefresh = () => r({ success: true }); }));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(<DispatchDashboard />);
    });

    const refreshBtn = result!.getByLabelText('Refresh');
    // Click twice rapidly
    fireEvent.click(refreshBtn);
    fireEvent.click(refreshBtn);

    // Should only have been called once due to `if (refreshing) return`
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    resolveRefresh();
  });
});
