import type { TranslateResponse, TranslationOptions } from '../types';

const TRANSLATE_TIMEOUT_MS = 45_000;
const ARTICLE_TIMEOUT_MS = 30_000;

export async function translateSentences(sentences: string[], options: TranslationOptions): Promise<string[]> {
  const response = await fetchWithTimeout('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sentences, options }),
  }, TRANSLATE_TIMEOUT_MS);

  const payload = (await response.json().catch(() => null)) as (TranslateResponse & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || 'Translation request failed.');
  }
  if (
    !Array.isArray(payload.translations) ||
    payload.translations.length !== sentences.length ||
    !payload.translations.every((value) => typeof value === 'string' && value.trim().length > 0)
  ) {
    throw new Error('Translation response was incomplete.');
  }
  return payload.translations;
}

export async function extractArticle(url: string): Promise<{ title: string; text: string }> {
  const response = await fetchWithTimeout('/api/article', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  }, ARTICLE_TIMEOUT_MS);

  const payload = (await response.json().catch(() => null)) as { title?: unknown; text?: unknown; error?: string } | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || 'Could not import the article.');
  }
  if (typeof payload.text !== 'string' || payload.text.trim().length === 0) {
    throw new Error('Article response was invalid.');
  }
  return {
    title: typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Imported article',
    text: payload.text,
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
