import { fetch } from '@tauri-apps/plugin-http';
import { getApiKey, getModel } from './settings';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export interface ChatMessage {
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
}

export async function sendMessage(
    messages: ChatMessage[],
    systemPrompt: string
): Promise<string> {
    const apiKey = await getApiKey();
    if (!apiKey) {
        throw new Error('Gemini API key not configured. Go to Settings to add it.');
    }

    const model = await getModel();
    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        system_instruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: messages,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
        candidates?: Array<{
            content?: {
                parts?: Array<{ text?: string }>;
            };
        }>;
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('No response from Gemini API');
    }
    return text;
}

export function createExplainPrompt(): string {
    return `You are a knowledgeable tutor helping a student understand difficult passages from textbooks, research papers, and classic works.

When the student highlights a passage, explain it clearly:
- Define any jargon or technical terms
- Use analogies and examples where helpful
- Break complex ideas into simpler parts
- If it contains math, render equations in LaTeX (use $...$ for inline and $$...$$ for block)

Be thorough but concise. Aim for clarity above all else.`;
}
