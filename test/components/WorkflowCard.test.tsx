/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { WorkflowCard } from '../../src/components/WorkflowCard';
import type { WorkflowDraft } from '../../src/types/workflows';

const mockDraft: WorkflowDraft = {
  id: 'draft-1',
  templateId: 'code-task',
  confidence: 0.87,
  payload: { title: 'Write Unit Tests', description: 'Add coverage', steps: ['step 1'] },
  kbCitations: [],
  goalTag: 'quality',
  rawExcerpt: 'write unit tests for the auth service',
  speaker: 'Alice',
  timestamp: '2026-05-01T10:00:00Z',
};

const lowConfidenceDraft: WorkflowDraft = { ...mockDraft, id: 'draft-2', confidence: 0.42 };

describe('WorkflowCard', () => {
  afterEach(() => { cleanup(); });

  it('renders the title from draft.payload.title', async () => {
    const { findByText } = render(
      <WorkflowCard draft={mockDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(await findByText('Write Unit Tests')).toBeTruthy();
  });

  it('renders confidence as percentage', async () => {
    const { findByText } = render(
      <WorkflowCard draft={mockDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(await findByText('87%')).toBeTruthy();
  });

  it('does not show low-confidence-warning when confidence >= 0.5', () => {
    const borderDraft: WorkflowDraft = { ...mockDraft, confidence: 0.5 };
    const { queryByText } = render(
      <WorkflowCard draft={borderDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(queryByText('Low Confidence')).toBeNull();
  });

  it('shows low-confidence-warning when confidence < 0.5', async () => {
    const { findByText } = render(
      <WorkflowCard draft={lowConfidenceDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(await findByText('Low Confidence')).toBeTruthy();
  });

  it('adds low-confidence class to root div when confidence < 0.5', () => {
    const { container } = render(
      <WorkflowCard draft={lowConfidenceDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(container.querySelector('.workflow-card.low-confidence')).toBeTruthy();
  });

  it('renders template badge text', async () => {
    const { findByText } = render(
      <WorkflowCard draft={mockDraft} onApprove={vi.fn()} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );
    expect(await findByText('code-task')).toBeTruthy();
  });

  it('calls onApprove after 3s timeout when Approve clicked', () => {
    vi.useFakeTimers();
    const onApprove = vi.fn();
    const { getByText } = render(
      <WorkflowCard draft={mockDraft} onApprove={onApprove} onDismiss={vi.fn()} onEdit={vi.fn()} />
    );

    act(() => { fireEvent.click(getByText('Approve')); });
    expect(onApprove).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(onApprove).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it('calls onDismiss immediately when Dismiss clicked', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(
      <WorkflowCard draft={mockDraft} onApprove={vi.fn()} onDismiss={onDismiss} onEdit={vi.fn()} />
    );

    fireEvent.click(getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
