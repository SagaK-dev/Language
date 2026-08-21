interface Env {}

const MAX_REQUEST_BYTES = 4_096;
const MAX_DOWNLOAD_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 20_000;
const MAX_REDIRECTS = 5;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!isSameOriginBrowserRequest(context.request)) {
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  }

  let body: { url?: unknown };
  try {
    body = JSON.parse(await readRequestText(context.request, MAX_REQUEST_BYTES)) as { url?: unknown };
  } catch (error) {
    const status = error instanceof PayloadTooLargeError ? 413 : 400;
    return json({ error: status === 413 ? 'Request body is too large.' : 'Invalid JSON body.' }, status);
  }

  if (typeof body.url !== 'string' || body.url.length > 2_048) {
    return json({ error: 'A valid article URL is required.' }, 400);
  }

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return json({ error: 'Invalid URL.' }, 400);
  }

  if (!isAllowedPublicUrl(url)) {
    return json({ error: 'This URL is not allowed.' }, 400);
  }

  let fetched: { response: Response; finalUrl: URL };
  try {
    fetched = await fetchWithValidatedRedirects(url);
  } catch (error) {
    console.error('Article import failed', error);
    return json({ error: 'The article URL could not be fetched safely.' }, 502);
  }

  const { response, finalUrl } = fetched;
  if (!response.ok) return json({ error: `Article returned HTTP ${response.status}.` }, 502);

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    return json({ error: 'The URL did not return an HTML page.' }, 415);
  }

  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    return json({ error: 'Article is too large.' }, 413);
  }

  let html: string;
  try {
    html = await readResponseText(response, MAX_DOWNLOAD_BYTES, contentType);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return json({ error: 'Article is too large.' }, 413);
    }
    console.error('Article body read failed', error);
    return json({ error: 'The article could not be read.' }, 502);
  }

  const title = decodeEntities(extractTitle(html) || finalUrl.hostname).slice(0, 200);
  const text = extractReadableText(html).slice(0, MAX_TEXT_CHARS);
  if (text.length < 80) {
    return json({ error: 'Could not extract enough readable text from this page.' }, 422);
  }

  return json({ title, text }, 200);
};

async function fetchWithValidatedRedirects(initialUrl: URL): Promise<{ response: Response; finalUrl: URL }> {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isAllowedPublicUrl(current)) throw new Error('Blocked redirect target.');

    const response = await fetch(current.toString(), {
      headers: {
        'user-agent': 'LanguageReader/1.0 (+https://github.com/SagaK-dev/Language)',
        'accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) return { response, finalUrl: current };
    if (hop === MAX_REDIRECTS) throw new Error('Too many redirects.');

    current = new URL(location, current);
  }

  throw new Error('Too many redirects.');
}

export function isAllowedPublicUrl(url: URL): boolean {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  if (url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443'))) return false;
  return !isBlockedHostname(url.hostname);
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.lan') ||
    lower.endsWith('.home')
  ) return true;

  if (lower.includes(':')) {
    if (lower === '::' || lower === '::1') return true;
    if (/^(fc|fd)/i.test(lower) || /^fe[89ab]/i.test(lower)) return true;
    const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    return mapped ? isBlockedIpv4(mapped[1]) : false;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(lower)) return isBlockedIpv4(lower);
  return false;
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function readRequestText(request: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new PayloadTooLargeError();
  if (!request.body) return '';
  return readStreamText(request.body, maxBytes, new TextDecoder());
}

async function readResponseText(response: Response, maxBytes: number, contentType: string): Promise<string> {
  if (!response.body) return '';
  return readStreamText(response.body, maxBytes, createDecoder(contentType));
}

async function readStreamText(stream: ReadableStream<Uint8Array>, maxBytes: number, decoder: TextDecoder): Promise<string> {
  const reader = stream.getReader();
  let bytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function createDecoder(contentType: string): TextDecoder {
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  if (!charset) return new TextDecoder();
  try {
    return new TextDecoder(charset);
  } catch {
    return new TextDecoder();
  }
}

function isSameOriginBrowserRequest(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]).trim() : '';
}

export function extractReadableText(html: string): string {
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|article|section|h[1-6])\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
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
    .replace(/&#(\d+);/g, (match, number) => decodeCodePoint(match, Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => decodeCodePoint(match, parseInt(hex, 16)));
}

function decodeCodePoint(fallback: string, value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return fallback;
  return String.fromCodePoint(value);
}

class PayloadTooLargeError extends Error {}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}
