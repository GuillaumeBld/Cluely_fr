// electron/llm/IntentClassifier.ts
// Lightweight intent classification for "What should I say?"
// Micro step that runs before answer generation

export type ConversationIntent =
    | 'clarification'      // "Can you explain that?"
    | 'follow_up'          // "What happened next?"
    | 'deep_dive'          // "Tell me more about X"
    | 'behavioral'         // "Give me an example of..."
    | 'example_request'    // "Can you give a concrete example?"
    | 'summary_probe'      // "So to summarize..."
    | 'coding'             // "Write code for X" or implementation questions
    | 'general';           // Default fallback

export interface IntentResult {
    intent: ConversationIntent;
    confidence: number;
    answerShape: string;
}

/**
 * Answer shapes mapped to intents
 * This controls HOW the answer is structured, not just WHAT it says
 */
const INTENT_ANSWER_SHAPES: Record<ConversationIntent, string> = {
    clarification: 'Give a direct, focused 1-2 sentence clarification. No setup, no context-setting.',
    follow_up: 'Continue the narrative naturally. 1-2 sentences. No recap of what was already said.',
    deep_dive: 'Provide a structured but concise explanation. Use concrete specifics, not abstract concepts.',
    behavioral: 'Lead with a specific example or story. Use the STAR pattern implicitly. Focus on actions and outcomes.',
    example_request: 'Provide ONE concrete, detailed example. Make it realistic and specific.',
    summary_probe: 'Confirm the summary briefly and add one clarifying point if needed.',
    coding: 'Provide a smart, production-ready code implementation. Start with a brief approach description, then the code block, then a concise explanation of why this approach works.',
    general: 'Respond naturally based on context. Keep it conversational and direct.'
};

/**
 * Pattern-based intent detection (fast, no LLM call)
 * For common patterns this is sufficient
 */
function detectIntentByPattern(lastInterviewerTurn: string): IntentResult | null {
    const text = lastInterviewerTurn.toLowerCase().trim();

    // Clarification patterns
    // Clarification (EN + FR)
    if (/(can you explain|what do you mean|clarify|could you elaborate on that specific|pouvez.vous expliquer|qu.est.ce que vous voulez dire|pouvez.vous clarifier|pourriez.vous élaborer|expliquez.moi)/i.test(text)) {
        return { intent: 'clarification', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.clarification };
    }

    // Follow-up (EN + FR)
    if (/(what happened|then what|and after that|what.s next|how did that go|qu.est.ce qui s.est passé|ensuite|et après|qu.est.ce qui suit|comment ça s.est passé)/i.test(text)) {
        return { intent: 'follow_up', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.follow_up };
    }

    // Deep dive (EN + FR)
    if (/(tell me more|dive deeper|explain further|walk me through|how does that work|dites.m.en plus|expliquez davantage|comment ça fonctionne|décrivez.moi|parlez.moi de)/i.test(text)) {
        return { intent: 'deep_dive', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.deep_dive };
    }

    // Behavioral (EN + FR)
    if (/(give me an example|tell me about a time|describe a situation|when have you|share an experience|donnez.moi un exemple|parlez.moi d.une fois|décrivez une situation|quand avez.vous|racontez.moi)/i.test(text)) {
        return { intent: 'behavioral', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.behavioral };
    }

    // Example request (EN + FR)
    if (/(for example|concrete example|specific instance|like what|such as|par exemple|exemple concret|instance spécifique|comme quoi|tel que)/i.test(text)) {
        return { intent: 'example_request', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.example_request };
    }

    // Summary probe (EN + FR)
    if (/(so to summarize|in summary|so basically|so you.re saying|let me make sure|donc pour résumer|en résumé|donc en gros|donc vous dites|permettez.moi de vérifier)/i.test(text)) {
        return { intent: 'summary_probe', confidence: 0.85, answerShape: INTENT_ANSWER_SHAPES.summary_probe };
    }

    // Coding (EN + FR)
    if (/(write code|program|implement|function for|algorithm|how to code|setup a .* project|using .* library|debug this|snippet|boilerplate|example of .* in .*|optimize|refactor|best practice for .* code|utility method|component for|logic for|écrire du code|implémenter|algorithme|comment coder|débogu|optimiser|refactoriser|bonne pratique)/i.test(text)) {
        return { intent: 'coding', confidence: 0.9, answerShape: INTENT_ANSWER_SHAPES.coding };
    }

    return null; // No clear pattern detected
}

/**
 * Context-aware intent detection
 * Looks at conversation flow, not just the last turn
 */
function detectIntentByContext(
    recentTranscript: string,
    assistantMessageCount: number
): IntentResult {
    // If we've given multiple answers and interviewer is probing, likely follow_up
    if (assistantMessageCount >= 2) {
        // Check if interviewer is drilling down
        const lines = recentTranscript.split('\n');
        const interviewerLines = lines.filter(l => l.includes('[INTERVIEWER'));

        // Short interviewer prompts after long exchanges = follow-up probe
        const lastInterviewerLine = interviewerLines[interviewerLines.length - 1] || '';
        if (lastInterviewerLine.length < 50 && assistantMessageCount >= 2) {
            return { intent: 'follow_up', confidence: 0.7, answerShape: INTENT_ANSWER_SHAPES.follow_up };
        }
    }

    // Default to general
    return { intent: 'general', confidence: 0.5, answerShape: INTENT_ANSWER_SHAPES.general };
}

/**
 * Main intent classification function
 * Combines pattern matching with context awareness
 * Fast enough to run inline (~0-5ms)
 */
export function classifyIntent(
    lastInterviewerTurn: string | null,
    recentTranscript: string,
    assistantMessageCount: number
): IntentResult {
    // Try pattern-based first (high confidence)
    if (lastInterviewerTurn) {
        const patternResult = detectIntentByPattern(lastInterviewerTurn);
        if (patternResult) {
            return patternResult;
        }
    }

    // Fall back to context-based
    return detectIntentByContext(recentTranscript, assistantMessageCount);
}

/**
 * Get answer shape guidance for prompt injection
 */
export function getAnswerShapeGuidance(intent: ConversationIntent): string {
    return INTENT_ANSWER_SHAPES[intent];
}
