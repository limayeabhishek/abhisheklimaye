import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import {
  applyCors,
  authenticateActiveUser,
  parseJsonBody,
  VercelRequest,
  VercelResponse,
} from './_lib/auth';

type GameMode = 'partner' | 'friends';

const MEMORY_WINDOW_GAMES = 10;

const MODE_CONFIG: Record<
  GameMode,
  {
    count: number;
    systemInstruction: string;
    userPrompt: string;
  }
> = {
  partner: {
    count: 20,
    systemInstruction:
      'You are a creative party-game prompt writer for a consenting adult couple playing Truth or Dare. ' +
      'Generate spicy, bold, flirtatious, passionate, and intimate romantic truths and playful physical or verbal dares for partners. ' +
      'Escalate intensity progressively from item 1 (playful, teasing, flirtatious warmup) through item 20 (maximum heat, bold intimacy, high passion). ' +
      'Keep everything strictly consensual between the two partners and keep each prompt crisp and ready to read aloud in 1-2 sentences.',
    userPrompt:
      'Return a JSON object with two string arrays: "truths" (20 items) and "dares" (20 items) for Partner mode. ' +
      'Escalate progressively from index 0 (flirty warmup) to index 19 (maximum heat/boldness).',
  },
  friends: {
    count: 50,
    systemInstruction:
      'You are a high-energy party-game prompt writer for close adult friends playing Truth or Dare (up to 5 friends). ' +
      'Generate wild, unhinged, hilarious, high-chaos social truths and harmless physical, acting, or phone-based dares for friends. ' +
      'Escalate chaos progressively from item 1 (funny social warmup) through item 50 (peak unhinged party chaos). ' +
      'Keep every dare physically safe, non-destructive, and legal. Keep each prompt punchy and ready to read aloud in 1-2 sentences.',
    userPrompt:
      'Return a JSON object with two string arrays: "truths" (50 items) and "dares" (50 items) for Friends mode. ' +
      'Escalate progressively from index 0 (funny warmup) to index 49 (peak unhinged chaos).',
  },
};

function normalizePromptList(items: unknown, targetCount: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
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

  if (joined) {
    return { rawText: joined, diagnostic: 'ok' };
  }

  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  const diagnostic = blockReason
    ? `blocked:${blockReason}`
    : finishReason
      ? `finish:${finishReason}`
      : 'no_parts';
  return { rawText: '', diagnostic };
}

function parseDeckJson(rawText: string): { truths?: unknown; dares?: unknown } | null {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as { truths?: unknown; dares?: unknown };
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as {
          truths?: unknown;
          dares?: unknown;
        };
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
  const mode = payload.mode === 'partner' || payload.mode === 'friends' ? payload.mode : null;

  if (!mode) {
    res.status(400).json({
      error: 'INVALID_MODE',
      message: 'mode must be either "partner" or "friends".',
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

  // Load rolling 10-game AI context memory so each new game avoids repeating recent prompts
  let recentPrompts: string[] = [];
  let memoryCount = 0;
  try {
    const { data: memoryRows } = await supabaseAdmin
      .from('truth_or_dare_memory')
      .select('id, prompts')
      .eq('user_id', userId)
      .eq('mode', mode)
      .order('created_at', { ascending: false })
      .limit(MEMORY_WINDOW_GAMES);

    if (Array.isArray(memoryRows)) {
      memoryCount = memoryRows.length;
      const seen = new Set<string>();
      for (const row of memoryRows) {
        if (Array.isArray(row.prompts)) {
          for (const p of row.prompts) {
            if (typeof p === 'string' && p.trim() && !seen.has(p.trim())) {
              seen.add(p.trim());
              recentPrompts.push(p.trim());
              if (recentPrompts.length >= 160) break;
            }
          }
        }
        if (recentPrompts.length >= 160) break;
      }
    }
  } catch {
    recentPrompts = [];
  }

  const spec = MODE_CONFIG[mode];
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
    recentPrompts.length > 0
      ? `\n\nIMPORTANT — Rolling 10-game memory (Session ${sessionSeed}): Generate completely NEW tasks and questions. Do NOT repeat or closely paraphrase any of these recent prompts:\n- ${recentPrompts.join('\n- ')}`
      : `\n\nSession ${sessionSeed}: Ensure fresh, original, non-cliche prompts.`;

  let truths: string[] = [];
  let dares: string[] = [];

  try {
    let response = await ai.models.generateContent({
      model: modelName,
      contents: `${spec.userPrompt}${memoryClause}`,
      config: {
        systemInstruction: spec.systemInstruction,
        temperature: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            truths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            dares: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['truths', 'dares'],
        },
        safetySettings,
      },
    });

    let { rawText, diagnostic } = extractTextFromResponse(response);

    if (!rawText) {
      response = await ai.models.generateContent({
        model: modelName,
        contents: `${spec.userPrompt}${memoryClause}\nOutput valid JSON only with keys "truths" and "dares".`,
        config: {
          systemInstruction: spec.systemInstruction,
          temperature: 0.9,
          maxOutputTokens: 8192,
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
        error: 'EMPTY_DECK_RESPONSE',
        message: `AI generator returned an empty deck (${diagnostic}). Please try again.`,
      });
      return;
    }

    const parsed = parseDeckJson(rawText);
    if (!parsed) {
      res.status(502).json({
        error: 'INVALID_DECK_FORMAT',
        message: 'AI response could not be parsed as valid JSON. Please try again.',
      });
      return;
    }

    truths = normalizePromptList(parsed.truths, spec.count);
    dares = normalizePromptList(parsed.dares, spec.count);

    if (truths.length === 0 || dares.length === 0) {
      res.status(502).json({
        error: 'INVALID_DECK_FORMAT',
        message: 'Generated deck did not contain valid Truth and Dare prompts.',
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
          : apiErr?.message || 'Failed to generate Truth or Dare deck.',
    });
    return;
  }

  // Save this game's prompts into rolling 10-game memory & prune older entries beyond 10
  try {
    const combinedPrompts = [...truths, ...dares].slice(0, 100);
    await supabaseAdmin.from('truth_or_dare_memory').insert({
      user_id: userId,
      mode,
      prompts: combinedPrompts,
    });

    const { data: allRows } = await supabaseAdmin
      .from('truth_or_dare_memory')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (Array.isArray(allRows) && allRows.length > MEMORY_WINDOW_GAMES) {
      const idsToDelete = allRows.slice(MEMORY_WINDOW_GAMES).map((r) => r.id);
      if (idsToDelete.length > 0) {
        await supabaseAdmin
          .from('truth_or_dare_memory')
          .delete()
          .in('id', idsToDelete);
      }
    }
  } catch (memErr) {
    console.error('Rolling memory update warning:', memErr);
  }

  // Also track unlimited total games played for Admin analytics (no cap)
  let totalGamesPlayed = 1;
  try {
    const { data: existingSession } = await supabaseAdmin
      .from('truth_or_dare_sessions')
      .select('games_played')
      .eq('user_id', userId)
      .maybeSingle();

    totalGamesPlayed = (existingSession?.games_played ?? 0) + 1;
    await supabaseAdmin.from('truth_or_dare_sessions').upsert(
      {
        user_id: userId,
        games_played: totalGamesPlayed,
        max_games: MEMORY_WINDOW_GAMES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch {
    // Non-fatal analytics update
  }

  res.status(200).json({
    mode,
    truths,
    dares,
    gamesPlayed: totalGamesPlayed,
    memoryGamesUsed: Math.min(MEMORY_WINDOW_GAMES, memoryCount),
    memoryWindow: MEMORY_WINDOW_GAMES,
  });
}
