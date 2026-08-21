interface Env {
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
}

interface TranslationOptions {
  sourceLanguage: string;
  targetLanguage: string;
  speakerGender: 'neutral' | 'female' | 'male';
  politeness: 'natural' | 'polite' | 'casual';
  audience: 'general' | 'senior' | 'friend';
  context: string;
}

interface RequestBody {
  sentences?: unknown;
  options?: unknown;
}

const MAX_SENTENCES = 120;
const MAX_TOTAL_CHARS = 6000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY is not configured on the server.' }, 503);
  }

  let body: RequestBody;
  try {
    body = await context.request.json<RequestBody>();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (!Array.isArray(body.sentences) || !body.sentences.every((value) => typeof value === 'string')) {
    return json({ error: 'sentences must be an array of strings.' }, 400);
  }
  const sentences = body.sentences.map((value) => value.trim()).filter(Boolean);
  const totalChars = sentences.reduce((sum, value) => sum + value.length, 0);
  if (sentences.length === 0 || sentences.length > MAX_SENTENCES || totalChars > MAX_TOTAL_CHARS) {
    return json({ error: 'Text is too long for one translation request.' }, 413);
  }

  const options = parseOptions(body.options);
  if (!options) return json({ error: 'Invalid translation options.' }, 400);
  if (options.sourceLanguage === options.targetLanguage) {
    return json({ error: 'Source and target language must differ.' }, 400);
  }

  const instruction = [
    `Translate each item from ${options.sourceLanguage} to ${options.targetLanguage}.`,
    'Return only valid JSON with exactly this shape: {"translations":["..."]}.',
    'Keep exactly one output string for each input item and preserve item order.',
    'Translate naturally rather than word-for-word. Do not explain the translation.',
    `Speaker gender preference: ${options.speakerGender}.`,
    `Politeness: ${options.politeness}.`,
    `Audience: ${options.audience}.`,
    options.context ? `Additional context: ${options.context}` : '',
  ].filter(Boolean).join('\n');

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: context.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify({ items: sentences }) },
      ],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error('Translation provider error', upstream.status, detail.slice(0, 800));
    return json({ error: 'Translation provider returned an error.' }, 502);
  }

  const data = await upstream.json<any>();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return json({ error: 'Translation provider returned an invalid response.' }, 502);

  try {
    const parsed = JSON.parse(content) as { translations?: unknown };
    if (!Array.isArray(parsed.translations) || parsed.translations.length !== sentences.length || !parsed.translations.every((value) => typeof value === 'string')) {
      throw new Error('shape mismatch');
    }
    return json({ translations: parsed.translations }, 200);
  } catch {
    return json({ error: 'Translation provider returned malformed JSON.' }, 502);
  }
};

function parseOptions(value: unknown): TranslationOptions | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TranslationOptions>;
  const strings = [candidate.sourceLanguage, candidate.targetLanguage, candidate.context];
  if (!strings.every((item) => typeof item === 'string')) return null;
  if (!['neutral', 'female', 'male'].includes(candidate.speakerGender || '')) return null;
  if (!['natural', 'polite', 'casual'].includes(candidate.politeness || '')) return null;
  if (!['general', 'senior', 'friend'].includes(candidate.audience || '')) return null;
  if ((candidate.context || '').length > 300) return null;
  return candidate as TranslationOptions;
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
