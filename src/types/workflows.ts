export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  embeddingSeed: string;
}

export interface DispatchResult {
  jobId: string;
}

/**
 * Minimal contract for dispatching an approved workflow draft to the job queue.
 *
 * Implementations must either resolve with a `DispatchResult` containing a non-empty
 * `jobId`, or throw an `Error` on failure. The IPC approval handler wraps calls in
 * try/catch and surfaces thrown errors as `{ error: string }` to the renderer.
 *
 * @see ArchonDispatcher — production implementation over HTTP
 */
export interface Dispatcher {
  dispatch(draft: WorkflowDraft): Promise<DispatchResult>;
}

export interface ActionItem {
  text: string;
  speaker: string;
  timestamp: string;
  rawExcerpt: string;
}

export interface KBCitation {
  id: string;
  label: string;
  source: string;
}

export interface WorkflowDraft {
  id: string;
  templateId: string;
  confidence: number;
  payload: {
    title: string;
    description: string;
    steps: string[];
  };
  kbCitations: KBCitation[];
  goalTag: string;
  rawExcerpt: string;
  speaker: string;
  timestamp: string;
}
