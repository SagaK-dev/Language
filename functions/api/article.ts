interface Env {}

const MAX_DOWNLOAD_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 20_000;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: { url?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (typeof body.url !== 'string') return json({ error: 'url is required.' }, 400);

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return json({ error: 'Invalid URL.' }, 400);
  }

  if (!['http:', 'https:'].includes(url.protocol) || isBlockedHostname(url.hostname)) {
    return json({ error: 'This URL is not allowed.' }, 400);
  }

  let response: Response;
  try {
    response = await fetchWithValidatedRedirects(url);
  } catch (error) {
    console.error('Article import failed', error);
    return json({ error: 'The article URL could not be fetched safely.' }, 502);
  }
  if (!response.ok) return json({ error: `Article returned HTTP ${response.status}.` }, 502);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    return json({ error: 'The URL did not return an HTML page.' }, 415);
  }

  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (declaredLength > MAX_DOWNLOAD_BYTES) return json({ error: 'Article is too large.' }, 413);

  const html = (await response.text()).slice(0, MAX_DOWNLOAD_BYTES);
  const title = decodeEntities(extractTitle(html) || url.hostname);
  const text = extractReadableText(html).slice(0, MAX_TEXT_CHARS);
  if (text.length < 80) return json({ error: 'Could not extract enough readable text from this page.' }, 422);

  return json({ title, text }, 200);
};

async function fetchWithValidatedRedirects(initialUrl: URL): Promise<Response> {
  let current = initialUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    if (!['http:', 'https:'].includes(current.protocol) || isBlockedHostname(current.hostname)) {
      throw new Error('Blocked redirect target.');
    }

    const response = await fetch(current.toString(), {
      headers: {
        'user-agent': 'LanguageReader/1.0 (+https://github.com/SagaK-dev/Language)',
        'accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) return response;
    current = new URL(location, current);
  }

  throw new Error('Too many redirects.');
}

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return true;
  if (lower === '0.0.0.0' || lower === '::1' || lower === '[::1]') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower.startsWith('[fc') || lower.startsWith('[fd') || lower.startsWith('[fe80:')) return true;
  if (/^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const match172 = lower.match(/^172\.(\d{1,3})\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^169\.254\./.test(lower)) return true;
  return false;
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).trim() : '';
}

function extractReadableText(html: string): string {
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/article|\/section|\/li|\/h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  cleaned = decodeEntities(cleaned)
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
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
