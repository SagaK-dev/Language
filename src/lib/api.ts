import type { TranslateResponse, TranslationOptions } from '../types';

export async function translateSentences(sentences: string[], options: TranslationOptions): Promise<string[]> {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sentences, options }),
  });

  const payload = (await response.json().catch(() => null)) as (TranslateResponse & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error || 'Translation request failed.');
  }
  if (!Array.isArray(payload.translations) || payload.translations.length !== sentences.length) {
    throw new Error('Translation response was incomplete.');
  }
  return payload.translations;
}

export async function extractArticle(url: string): Promise<{ title: string; text: string }> {
  const response = await fetch('/api/article', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const payload = (await response.json().catch(() => null)) as { title?: string; text?: string; error?: string } | null;
  if (!response.ok || !payload?.text) {
    throw new Error(payload?.error || 'Could not import the article.');
  }
  return { title: payload.title || 'Imported article', text: payload.text };
}
