import type { WorkflowDraft } from '../types/workflows';

export interface ArchonConfig {
  baseUrl: string;
}

export interface DispatchResult {
  jobId: string;
}

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ jobId: string }>;
}

export class ArchonDispatcher {
  private config: ArchonConfig;
  private httpClient: HttpClient;

  constructor(config: ArchonConfig, httpClient: HttpClient) {
    this.config = config;
    this.httpClient = httpClient;
  }

  async dispatch(draft: WorkflowDraft): Promise<DispatchResult> {
    const url = `${this.config.baseUrl}/api/jobs`;
    const body = {
      templateId: draft.templateId,
      payload: draft.payload,
      goalTag: draft.goalTag,
      kbCitations: draft.kbCitations,
      speaker: draft.speaker,
    };

    const result = await this.httpClient.post(url, body);
    if (!result?.jobId) {
      throw new Error('[ArchonDispatcher] Invalid response: missing jobId');
    }
    return { jobId: result.jobId };
  }
}
