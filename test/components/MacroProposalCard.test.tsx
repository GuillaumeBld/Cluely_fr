/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MacroProposalCard } from '../../src/components/MacroProposalCard';
import type { MacroProposal } from '../../src/services/MacroLearner';

const mockProposal: MacroProposal = {
  projectId: 'finbiz',
  meetingType: 'weekly-sync',
  templateId: 'code-task',
  dispatchTarget: 'notion',
};

describe('MacroProposalCard', () => {
  afterEach(cleanup);

  it('renders meeting type in the proposal text', () => {
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(getByText(/weekly-sync/)).toBeTruthy();
  });

  it('renders project id in the proposal text', () => {
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(getByText(/finbiz/)).toBeTruthy();
  });

  it('renders template id in the proposal text', () => {
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(getByText(/code-task/)).toBeTruthy();
  });

  it('calls onConfirm when Save Macro is clicked', () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={onConfirm} onDismiss={vi.fn()} />,
    );
    fireEvent.click(getByText('Save Macro'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when Not now is clicked', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={vi.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.click(getByText('Not now'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not call onDismiss when Save Macro is clicked', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={vi.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.click(getByText('Save Macro'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not call onConfirm when Not now is clicked', () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <MacroProposalCard proposal={mockProposal} onConfirm={onConfirm} onDismiss={vi.fn()} />,
    );
    fireEvent.click(getByText('Not now'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
