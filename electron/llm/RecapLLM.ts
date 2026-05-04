import { LLMHelper } from "../LLMHelper";
import {
    UNIVERSAL_RECAP_PROMPT,
    STANDUP_RECAP_PROMPT,
    ONE_ON_ONE_RECAP_PROMPT,
    SALES_RECAP_PROMPT,
    INTERVIEW_RECAP_PROMPT,
} from "./prompts";
import type { MeetingType } from "../config/meetingTypeTemplates";
import { ConflictResolution } from "../memory/schema";

const RECAP_PROMPTS: Record<MeetingType, string> = {
    standup: STANDUP_RECAP_PROMPT,
    one_on_one: ONE_ON_ONE_RECAP_PROMPT,
    sales: SALES_RECAP_PROMPT,
    interview: INTERVIEW_RECAP_PROMPT,
    general: UNIVERSAL_RECAP_PROMPT,
};

export class RecapLLM {
    private llmHelper: LLMHelper;

    constructor(llmHelper: LLMHelper) {
        this.llmHelper = llmHelper;
    }

    /**
     * Generate a neutral conversation summary
     */
    async generate(context: string, meetingType: MeetingType = 'general'): Promise<string> {
        if (!context.trim()) return "";
        try {
            const prompt = RECAP_PROMPTS[meetingType];
            const stream = this.llmHelper.streamChat(context, undefined, undefined, prompt);
            let fullResponse = "";
            for await (const chunk of stream) fullResponse += chunk;
            return this.clampRecapResponse(fullResponse);
        } catch (error) {
            console.error("[RecapLLM] Generation failed:", error);
            return "";
        }
    }

    /**
     * Generate a neutral conversation summary (Streamed)
     */
    async *generateStream(context: string, meetingType: MeetingType = 'general'): AsyncGenerator<string> {
        if (!context.trim()) return;
        const prompt = RECAP_PROMPTS[meetingType] ?? UNIVERSAL_RECAP_PROMPT;
        yield* this.llmHelper.streamChat(context, undefined, undefined, prompt);
    }

    private clampRecapResponse(text: string): string {
        if (!text) return "";
        // Simple clamp: max 5 lines
        return text.split('\n').filter(l => l.trim()).slice(0, 5).join('\n');
    }

    /**
     * Append a "Memory Conflicts Resolved" section to a recap summary.
     * Always present (empty section if no conflicts), per spec.
     */
    appendConflictDigest(summary: string, resolutions: ConflictResolution[]): string {
        let section = '\n\n## Memory Conflicts Resolved\n';

        if (resolutions.length === 0) {
            section += 'No memory conflicts detected.\n';
        } else {
            for (const r of resolutions) {
                const actionLabel = r.action === 'update' ? 'Updated' : r.action === 'flag' ? 'Flagged' : 'Ignored';
                section += `- **${r.fact_key}**: "${r.old_value}" → "${r.new_value}" (${actionLabel})\n`;
            }
        }

        return summary + section;
    }
}
