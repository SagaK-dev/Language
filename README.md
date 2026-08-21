# Language

Language is a mixed-language reading web app inspired by the learning flow of Mazelingo. Paste text you genuinely want to read, choose a target language and exposure ratio, and the app translates part of the text while preserving source-language context around it.

The project is designed for Cloudflare Pages. Translation provider secrets stay on the server through Pages Functions and are never bundled into the browser application.

## Features

- Paste up to 5,000 characters of reading material.
- Choose source and target languages from a server-validated allowlist.
- Mix translated sentences from 0% to 100% in 10% steps.
- Click any sentence to toggle between its original and translated form.
- Remix sentence placement without retranslating the text.
- Translation style controls for speaker gender, politeness, audience, and optional context.
- Import readable text from a public article URL while preserving paragraph structure.
- Local reading history stored in `localStorage` only.
- Deep validation of stored history before it is restored.
- Mobile-friendly responsive interface.
- Cloudflare Pages Functions backend so API keys never ship to the browser.
- Bounded request and response streaming for API payloads and article downloads.
- Redirect-by-redirect URL validation and blocking for common local/private address forms.
- Same-origin browser request checks as defense in depth.
- Strict browser security headers and no-store API responses.
- OpenAI Structured Outputs for schema-constrained translation responses, followed by server-side item-count validation.
- Unit tests for sentence segmentation, mixing, history validation, translation-option validation, URL safety, and article extraction.
- CI checks for dependency vulnerabilities, tests, frontend type safety, Pages Functions type safety, and production builds.
- A committed npm lockfile and `npm ci` in CI for reproducible dependency resolution.

## Tech stack

- React 18
- TypeScript
- Vite
- Cloudflare Pages Functions
- Vitest
- OpenAI Chat Completions API with Structured Outputs

## Local development

For a clean checkout, install the exact reviewed dependency graph:

```bash
npm ci
```

Use `npm install` only when intentionally changing dependencies and commit the resulting `package-lock.json` update together with `package.json`.

Start the Vite frontend:

```bash
npm run dev
```

The Vite development server does not execute Cloudflare Pages Functions by itself. For end-to-end local testing, use Wrangler Pages development mode after building the frontend:

```bash
npm run build
npx wrangler pages dev dist
```

Then configure the required secret for the local Wrangler environment.

## Environment variables

Set these variables in Cloudflare Pages under **Settings → Variables and Secrets**:

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server-side API key used by `/api/translate`. |
| `OPENAI_MODEL` | No | Translation model. Defaults to `gpt-4.1-mini`. |

Never expose `OPENAI_API_KEY` as a Vite variable such as `VITE_OPENAI_API_KEY`, because Vite variables are bundled into client-side JavaScript.

## Cloudflare Pages deployment

1. Connect the `SagaK-dev/Language` repository to Cloudflare Pages.
2. Use `npm run build` as the build command.
3. Use `dist` as the build output directory.
4. Add `OPENAI_API_KEY` as an encrypted secret.
5. Optionally set `OPENAI_MODEL`.
6. Deploy.

The `/functions` directory is automatically deployed as Cloudflare Pages Functions.

## Production hardening

The repository includes application-level validation, but a public server endpoint still needs platform-level controls.

### 1. Rate-limit translation requests

`/api/translate` can incur provider cost. The same-origin checks in this repository are browser-focused defense in depth; they are **not authentication** and do not prevent a scripted client from calling the public endpoint directly.

Before public deployment, configure Cloudflare Rate Limiting/WAF rules for `/api/translate` and `/api/article`. Pick limits appropriate for the expected audience and tighten them if the project is shared publicly. If the app later gains accounts, enforce per-user quotas on the server as well.

### 2. Keep article fetches on the public Internet

The article importer blocks literal private/local address forms and validates every redirect. DNS resolution can still create SSRF edge cases that string validation alone cannot fully solve.

If arbitrary article import remains enabled, turn on the Cloudflare Workers/Pages compatibility flag:

```text
global_fetch_strictly_public
```

Configure the flag for both preview and production Pages Functions environments. For higher-security deployments, use a hostname allowlist or remove arbitrary URL import entirely.

### 3. Apply provider-side cost controls

Use a dedicated provider project/key for this application and configure provider-side usage/rate controls appropriate for the deployment. Do not reuse a high-privilege API key from an unrelated project.

### 4. Preserve the server-side secret boundary

Do not rename the provider key to a `VITE_*` variable. `VITE_*` values are client-side build inputs and are visible to users of the deployed application.

## Translation API contract

`POST /api/translate`

Request:

```json
{
  "sentences": ["今日は晴れです。"],
  "options": {
    "sourceLanguage": "Japanese",
    "targetLanguage": "English",
    "speakerGender": "neutral",
    "politeness": "natural",
    "audience": "general",
    "context": ""
  }
}
```

Response:

```json
{
  "translations": ["It is sunny today."]
}
```

The server validates the language and style options independently of the UI. Text and optional context are treated as untrusted translation data. The provider response must match the expected structured JSON shape, and the server separately verifies that the number of returned translations exactly matches the number of input sentences before returning data to the browser.

## Article import

`POST /api/article` accepts a public `http` or `https` URL and extracts readable text from returned HTML. The endpoint:

- rejects credentials and non-web protocols;
- rejects non-standard destination ports;
- blocks common localhost, private IPv4, private IPv6, and mapped-address forms;
- validates every redirect target;
- streams the response with a hard byte limit instead of buffering an unbounded body first;
- checks the HTML content type;
- limits extracted title and text sizes;
- preserves paragraph breaks for the mixed-language reader.

Some sites block automated requests or require JavaScript rendering, so article import is best-effort rather than guaranteed.

For a stricter production deployment, prefer a hostname allowlist or remove arbitrary URL import.

## Privacy

- Reading history is stored in the current browser's `localStorage`.
- History is validated before restore; invalid or outdated records are ignored.
- Text submitted for translation is sent to the configured model provider by the server-side function.
- The API key stays in Cloudflare's server-side environment.
- API responses use `Cache-Control: no-store`.

If you add accounts or cloud history later, update the privacy policy and data-retention design before storing user text on a server.

## Testing

Run unit tests:

```bash
npm test
```

Run all type checks:

```bash
npm run typecheck
```

Run a production build:

```bash
npm run build
```

The reviewed CI baseline currently contains 18 tests across five test files. CI uses `npm ci` and also runs `npm audit --audit-level=high` before tests and builds.

## Project structure

```text
Language/
├─ functions/
│  └─ api/
│     ├─ article.ts
│     ├─ article.test.ts
│     ├─ translate.ts
│     └─ translate.test.ts
├─ public/
│  ├─ _headers
│  └─ _redirects
├─ src/
│  ├─ lib/
│  │  ├─ api.ts
│  │  ├─ mix.ts
│  │  ├─ mix.test.ts
│  │  ├─ sentences.ts
│  │  ├─ sentences.test.ts
│  │  ├─ storage.ts
│  │  └─ storage.test.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  └─ types.ts
├─ .env.example
├─ index.html
├─ package.json
├─ package-lock.json
├─ tsconfig.app.json
├─ tsconfig.functions.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

## Notes on scope

This project reproduces the core learning interaction, not Mazelingo's branding, proprietary implementation, paid plan, authentication system, or browser extension. The UI and code are independently implemented for this repository.

## License

No license has been added yet. Add one before distributing or accepting external contributions.
