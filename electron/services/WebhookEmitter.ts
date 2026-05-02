import axios from 'axios';
import type { WorkflowDraft } from '../../src/types/workflows';
import type { ExportWebhook } from './CredentialsManager';
import { CredentialsManager } from './CredentialsManager';
import type { WebhookEmitter } from '../../src/ipc/approvalHandlers';

/**
 * Fires POST requests to all configured export webhooks after approval.
 * Failures are logged but never rethrown — this is intentionally fire-and-forget:
 * webhook delivery does not affect the approval result.
 */
export class CredentialsWebhookEmitter implements WebhookEmitter {
    async emit(draft: WorkflowDraft, jobId: string): Promise<void> {
        const webhooks: ExportWebhook[] = CredentialsManager.getInstance().getExportWebhooks();
        if (webhooks.length === 0) return;

        const payload = {
            jobId,
            approvedAt: new Date().toISOString(),
            draft,
        };

        await Promise.allSettled(
            webhooks.map((webhook) =>
                axios
                    .post(webhook.url, payload, { timeout: 5000 })
                    .then(() => {
                        console.log(`[WebhookEmitter] Posted to '${webhook.name}'`);
                    })
                    .catch((err: Error) => {
                        const safeUrl = (() => { try { const u = new URL(webhook.url); return u.origin + u.pathname; } catch { return webhook.name; } })();
                        console.error(`[WebhookEmitter] Failed to post to '${webhook.name}' (${safeUrl}):`, err.message);
                    })
            )
        );
    }
}
