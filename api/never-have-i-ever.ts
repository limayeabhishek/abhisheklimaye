import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import {
  applyCors,
  authenticateActiveUser,
  parseJsonBody,
  VercelRequest,
  VercelResponse,
} from './_lib/auth';

type NhieGenre = 'childhood' | 'adults' | 'college' | 'relationships';

const MEMORY_WINDOW_GAMES = 10;
const QUESTION_COUNT = 10;

const GENRE_CONFIG: Record<
  NhieGenre,
  {
    label: string;
    systemInstruction: string;
    userPrompt: string;
  }
> = {
  childhood: {
    label: 'Childhood',
    systemInstruction:
      'You are a nostalgic, hilarious party-game writer creating "Never Have I Ever" questions strictly about Childhood and school-age memories. ' +
      'Focus on relatable childhood mischief, school trouble, family secrets, and early crushes—such as getting scolded for fighting/beating another kid, ' +
      'lying to parents about a relationship or crush, hiding a bad report card, forging a parent signature, faking sick to skip school, ' +
      'breaking something at home and blaming a sibling, or stealing snacks. ' +
      'Every single item must start with "Never have I ever " and be crisp, punchy, and ready to read aloud.',
    userPrompt:
      'Return a JSON object with a single string array "questions" containing exactly 10 unique Childhood-themed "Never have I ever ..." questions.',
  },
  adults: {
    label: 'Adults',
    systemInstruction:
      'You are a sharp, witty party-game writer creating "Never Have I Ever" questions strictly about Adult life, work, dating, and real-world shenanigans. ' +
      'Focus on relatable adult confessions—such as lying in the office to get sick/casual leave, lying to your partner about where you were, ' +
      'ghosting someone after saying "let us catch up soon", pretending to be on an urgent call to escape someone, calling in sick while hungover, ' +
      'snooping on someone else\'s phone or messages, or blowing a budget on impulse buys. ' +
      'Keep everything consensual, legal, and relatable. Every single item must start with "Never have I ever " and be crisp and punchy.',
    userPrompt:
      'Return a JSON object with a single string array "questions" containing exactly 10 unique Adult-themed "Never have I ever ..." questions.',
  },
  college: {
    label: 'College & Friends',
    systemInstruction:
      'You are a high-energy party-game writer creating "Never Have I Ever" questions about College, hostel life, and chaotic friend-group moments. ' +
      'Focus on bunking lectures, copying assignments at the last minute, pulling an all-nighter before an exam, sneaking out, ' +
      'getting kicked out of a class or venue, texting an ex at 2 AM, or surviving an absurd group dare. ' +
      'Every single item must start with "Never have I ever " and be crisp and punchy.',
    userPrompt:
      'Return a JSON object with a single string array "questions" containing exactly 10 unique College & Friends-themed "Never have I ever ..." questions.',
  },
  relationships: {
    label: 'Relationships',
    systemInstruction:
      'You are a bold, candid party-game writer creating "Never Have I Ever" questions about Dating, Crushes, and Relationships. ' +
      'Focus on flirting, jealousy, sneaky DMs, lying about where you were, checking a partner\'s phone, stalking an ex on social media, ' +
      'falling for someone you shouldn\'t have, or keeping a secret situationship. ' +
      'Keep everything strictly consensual between adults. Every single item must start with "Never have I ever " and be crisp and punchy.',
    userPrompt:
      'Return a JSON object with a single string array "questions" containing exactly 10 unique Relationship-themed "Never have I ever ..." questions.',
  },
};

function normalizeQuestionList(items: unknown, targetCount: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) =>
      /^never have i ever/i.test(entry)
        ? entry
        : `Never have I ever ${entry.charAt(0).toLowerCase()}${entry.slice(1)}`
    )
    .slice(0, targetCount);
}

function extractTextFromResponse(response: {
  text?: string;
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
}): { rawText: string; diagnostic: string } {
  if (typeof response.text === 'string' && response.text.trim()) {
    return { rawText: response.text.trim(), diagnostic: 'ok' };
  }

  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const joined = parts
    .filter((p) => typeof p?.text === 'string' && !p.thought)
    .map((p) => p.text as string)
    .join('')
    .trim();

  if (joined) return { rawText: joined, diagnostic: 'ok' };

  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const diagnostic = blockReason
    ? `blocked:${blockReason}`
    : finishReason
      ? `finish:${finishReason}`
      : 'no_parts';
  return { rawText: '', diagnostic };
}

function parseQuestionsJson(rawText: string): { questions?: unknown } | null {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as { questions?: unknown };
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as { questions?: unknown };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res, 'POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are allowed.' });
    return;
  }

  const auth = await authenticateActiveUser(req, res);
  if (!auth) return;

  const { supabaseAdmin, userId } = auth;
  const payload = parseJsonBody(req);
  if (JSON.stringify(payload).length > 4096) {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body too large.' });
    return;
  }

  const genre =
    payload.genre === 'childhood' ||
    payload.genre === 'adults' ||
    payload.genre === 'college' ||
    payload.genre === 'relationships'
      ? (payload.genre as NhieGenre)
      : null;

  if (!genre) {
    res.status(400).json({
      error: 'INVALID_GENRE',
      message: 'genre must be one of: childhood, adults, college, relationships.',
    });
    return;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    res.status(500).json({
      error: 'GEMINI_KEY_MISSING',
      message: 'GEMINI_API_KEY is not configured in server environment variables.',
    });
    return;
  }

  const memoryKey = `nhie_${genre}`;
  let recentQuestions: string[] = [];
  try {
    const { data: memoryRows } = await supabaseAdmin
      .from('truth_or_dare_memory')
      .select('prompts')
      .eq('user_id', userId)
      .eq('mode', memoryKey)
      .order('created_at', { ascending: false })
      .limit(MEMORY_WINDOW_GAMES);

    if (Array.isArray(memoryRows)) {
      const seen = new Set<string>();
      for (const row of memoryRows) {
        if (Array.isArray(row.prompts)) {
          for (const q of row.prompts) {
            if (typeof q === 'string' && q.trim() && !seen.has(q.trim())) {
              seen.add(q.trim());
              recentQuestions.push(q.trim());
              if (recentQuestions.length >= 100) break;
            }
          }
        }
        if (recentQuestions.length >= 100) break;
      }
    }
  } catch {
    recentQuestions = [];
  }

  const spec = GENRE_CONFIG[genre];
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const modelName = process.env.TRUTH_OR_DARE_MODEL || 'gemini-3.5-flash-lite';

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ];

  const sessionSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const memoryClause =
    recentQuestions.length > 0
      ? `\n\nSession ${sessionSeed}: Generate completely fresh questions. Do NOT repeat or closely paraphrase:\n- ${recentQuestions.join('\n- ')}`
      : `\n\nSession ${sessionSeed}: Generate fresh, super relatable questions.`;

  let questions: string[] = [];

  try {
    let response = await ai.models.generateContent({
      model: modelName,
      contents: `${spec.userPrompt}${memoryClause}`,
      config: {
        systemInstruction: spec.systemInstruction,
        temperature: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['questions'],
        },
        safetySettings,
      },
    });

    let { rawText, diagnostic } = extractTextFromResponse(response);

    if (!rawText) {
      response = await ai.models.generateContent({
        model: modelName,
        contents: `${spec.userPrompt}${memoryClause}\nOutput valid JSON only with key "questions".`,
        config: {
          systemInstruction: spec.systemInstruction,
          temperature: 0.9,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          safetySettings,
        },
      });
      const fallbackResult = extractTextFromResponse(response);
      rawText = fallbackResult.rawText;
      diagnostic = fallbackResult.diagnostic;
    }

    if (!rawText) {
      res.status(502).json({
        error: 'EMPTY_QUESTIONS_RESPONSE',
        message: `AI generator returned empty questions (${diagnostic}). Please try again.`,
      });
      return;
    }

    const parsed = parseQuestionsJson(rawText);
    questions = parsed ? normalizeQuestionList(parsed.questions, QUESTION_COUNT) : [];

    if (questions.length === 0) {
      res.status(502).json({
        error: 'INVALID_QUESTIONS_FORMAT',
        message: 'Generated response did not contain valid questions. Please try again.',
      });
      return;
    }
  } catch (err: unknown) {
    const apiErr = err as { status?: number; message?: string };
    const status = apiErr?.status === 429 ? 429 : 502;
    res.status(status).json({
      error: status === 429 ? 'RATE_LIMITED' : 'GENERATION_FAILED',
      message:
        status === 429
          ? 'Free-tier AI quota is temporarily busy. Please wait a moment and try again.'
          : 'Failed to generate Never Have I Ever questions. Please try again.',
    });
    return;
  }

  // Persist to rolling 10-game memory (best-effort if migration 004 hasn't been applied yet)
  try {
    const { error: insertErr } = await supabaseAdmin.from('truth_or_dare_memory').insert({
      user_id: userId,
      mode: memoryKey,
      prompts: questions,
    });

    if (!insertErr) {
      const { data: allRows } = await supabaseAdmin
        .from('truth_or_dare_memory')
        .select('id')
        .eq('user_id', userId)
        .eq('mode', memoryKey)
        .order('created_at', { ascending: false });

      if (Array.isArray(allRows) && allRows.length > MEMORY_WINDOW_GAMES) {
        const idsToDelete = allRows.slice(MEMORY_WINDOW_GAMES).map((r) => r.id);
        if (idsToDelete.length > 0) {
          await supabaseAdmin.from('truth_or_dare_memory').delete().in('id', idsToDelete);
        }
      }
    }
  } catch {
    // Non-fatal if migration 004 isn't applied yet
  }

  res.status(200).json({
    genre,
    genreLabel: spec.label,
    questions,
  });
}
