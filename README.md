# Language

Language is a mixed-language reading web app inspired by the learning flow of Mazelingo. Paste text you genuinely want to read, choose a target language and exposure ratio, and the app translates only part of the text while keeping the surrounding context in the source language.

The project is designed for Cloudflare Pages and keeps provider secrets on the server through Pages Functions.

## Features

- Paste up to 5,000 characters of reading material.
- Choose source and target languages.
- Mix translated sentences from 0% to 100% in 10% steps.
- Click any sentence in the reader to toggle between the original and translated version.
- Remix sentence placement without retranslating the full text.
- Translation style controls for speaker gender, politeness, audience, and free-form context.
- Import readable text from a public article URL.
- Local reading history stored in `localStorage` only.
- Mobile-friendly responsive interface.
- Cloudflare Pages Functions backend so API keys never ship to the browser.
- Basic request validation, URL filtering, security headers, and no-store API responses.
- Unit tests for sentence segmentation and mixing behavior.

## Tech stack

- React 18
- TypeScript
- Vite
- Cloudflare Pages Functions
- Vitest
- OpenAI-compatible translation call through the OpenAI Chat Completions endpoint

## Local development

Install dependencies:

```bash
npm install
```

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

## Article import

`POST /api/article` accepts a public `http` or `https` URL and extracts readable text from the returned HTML. The endpoint blocks common localhost and private IP address patterns, validates redirect targets, and limits response size. Some sites block automated requests or require JavaScript rendering, so article import is best-effort rather than guaranteed.

For a stricter production deployment, consider removing arbitrary URL import or replacing it with an allowlist.

## Privacy

- Reading history is stored in the current browser's `localStorage`.
- Text submitted for translation is sent to the configured model provider by the server-side function.
- The API key stays in Cloudflare's server-side environment.
- API responses use `Cache-Control: no-store`.

If you add accounts or cloud history later, update the privacy policy and data-retention design before storing user text on a server.

## Testing

Run unit tests:

```bash
npm test
```

Run a production build:

```bash
npm run build
```

## Project structure

```text
Language/
├─ functions/
│  └─ api/
│     ├─ article.ts
│     └─ translate.ts
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
│  │  └─ storage.ts
│  ├─ App.tsx
│  ├─ main.tsx
│  ├─ styles.css
│  └─ types.ts
├─ .env.example
├─ index.html
├─ package.json
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
└─ vite.config.ts
```

## Notes on scope

This project reproduces the core learning interaction, not Mazelingo's branding, proprietary implementation, paid plan, authentication system, or browser extension. The UI and code are independently implemented for this repository.

## License

No license has been added yet. Add one before distributing or accepting external contributions.
