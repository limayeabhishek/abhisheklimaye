import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import {
  applyCors,
  authenticateActiveUser,
  parseJsonBody,
  VercelRequest,
  VercelResponse,
} from './_lib/auth';

type GameMode = 'partner' | 'friends';

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
      'You are an adult party-game prompt generator for a consenting romantic couple playing Truth or Dare. ' +
      'Generate spicy, bold, flirtatious, and intimate NSFW-leaning romantic/sensual truths and physical/verbal dares strictly for consenting adult partners. ' +
      'Escalate intensity progressively from item 1 (playful, teasing, flirtatious warmup) through item 20 (maximum heat, bold intimacy, high passion). ' +
      'Avoid anything non-consensual, illegal, or involving third parties. Keep each prompt crisp, direct, and ready to read aloud in 1-2 sentences.',
    userPrompt:
      'Generate exactly 20 progressively escalating Truth prompts and exactly 20 progressively escalating Dare prompts for Partner mode. ' +
      'Index 0 must be playful/flirty warmup and index 19 must be peak heat/boldness.',
  },
  friends: {
    count: 50,
    systemInstruction:
      'You are a high-energy party-game prompt generator for close adult friends playing Truth or Dare (up to 5 friends). ' +
      'Generate full crazy, unhinged, hilarious, high-chaos social truths and harmless physical, acting, or phone-based dares. ' +
      'Escalate chaos progressively from item 1 (funny social warmup) through item 50 (peak unhinged party chaos). ' +
      'Keep every dare physically safe, non-destructive, and legal. Keep each prompt punchy and ready to read aloud in 1-2 sentences.',
    userPrompt:
      'Generate exactly 50 progressively escalating Truth prompts and exactly 50 progressively escalating Dare prompts for Friends mode. ' +
      'Index 0 must be a funny warmup and index 49 must be peak unhinged chaos.',
  },
};

const DEFAULT_MAX_GAMES = 10;

function normalizePromptList(items: unknown, targetCount: number): string[] {
  if (!Array.isArray(items)) return [];
  const cleaned = items
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return cleaned.slice(0, targetCount);
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

  // Ensure quota row exists and check current limit before invoking Gemini
  await supabaseAdmin
    .from('truth_or_dare_sessions')
    .upsert(
      {
        user_id: userId,
        games_played: 0,
        max_games: DEFAULT_MAX_GAMES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  const { data: quotaRow, error: quotaReadError } = await supabaseAdmin
    .from('truth_or_dare_sessions')
    .select('games_played, max_games')
    .eq('user_id', userId)
    .single();

  if (quotaReadError || !quotaRow) {
    res.status(500).json({
      error: 'QUOTA_CHECK_FAILED',
      message: quotaReadError?.message || 'Unable to verify game quota.',
    });
    return;
  }

  if (quotaRow.games_played >= quotaRow.max_games) {
    res.status(403).json({
      error: 'QUOTA_EXCEEDED',
      message: `Game limit reached (${quotaRow.games_played}/${quotaRow.max_games} games played).`,
      gamesPlayed: quotaRow.games_played,
      maxGames: quotaRow.max_games,
      remainingGames: 0,
    });
    return;
  }

  const spec = MODE_CONFIG[mode];
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });
  const modelName = process.env.TRUTH_OR_DARE_MODEL || 'gemini-3.5-flash-lite';

  let truths: string[] = [];
  let dares: string[] = [];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: spec.userPrompt,
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
              minItems: spec.count,
              maxItems: spec.count,
            },
            dares: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              minItems: spec.count,
              maxItems: spec.count,
            },
          },
          required: ['truths', 'dares'],
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
      },
    });

    const rawText = response.text;
    if (!rawText) {
      res.status(502).json({
        error: 'EMPTY_DECK_RESPONSE',
        message: 'AI generator returned an empty deck. Please try again.',
      });
      return;
    }

    const parsed = JSON.parse(rawText) as { truths?: unknown; dares?: unknown };
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

  // Increment games_played only after deck generation succeeds
  let nextPlayed = quotaRow.games_played + 1;
  let maxGames = quotaRow.max_games;

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
    'increment_truth_or_dare_quota',
    { p_user_id: userId }
  );

  if (!rpcError && Array.isArray(rpcRows) && rpcRows.length > 0) {
    nextPlayed = rpcRows[0].games_played;
    maxGames = rpcRows[0].max_games;
  } else if (!rpcError && Array.isArray(rpcRows) && rpcRows.length === 0) {
    res.status(403).json({
      error: 'QUOTA_EXCEEDED',
      message: `Game limit reached (${quotaRow.max_games}/${quotaRow.max_games} games played).`,
      gamesPlayed: quotaRow.max_games,
      maxGames: quotaRow.max_games,
      remainingGames: 0,
    });
    return;
  } else {
    // Fallback conditional update if RPC function hasn't been deployed
    const { data: updatedRow, error: updateErr } = await supabaseAdmin
      .from('truth_or_dare_sessions')
      .update({
        games_played: quotaRow.games_played + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .lt('games_played', quotaRow.max_games)
      .select('games_played, max_games')
      .maybeSingle();

    if (updateErr || !updatedRow) {
      res.status(403).json({
        error: 'QUOTA_EXCEEDED',
        message: 'Game quota reached or could not be updated.',
        gamesPlayed: quotaRow.games_played,
        maxGames: quotaRow.max_games,
        remainingGames: 0,
      });
      return;
    }

    nextPlayed = updatedRow.games_played;
    maxGames = updatedRow.max_games;
  }

  res.status(200).json({
    mode,
    truths,
    dares,
    gamesPlayed: nextPlayed,
    maxGames,
    remainingGames: Math.max(0, maxGames - nextPlayed),
  });
}
