# Last Line

AI trust firewall. Built for Hoobit Hacks 2026.

Sits between you and ChatGPT. Before you send a message, it scans for stuff you probably shouldn't be pasting into a chatbot, like API keys, passwords, credit card numbers, or a prompt injection someone slipped you. After ChatGPT answers, it pulls out the factual claims in the response, checks them against real web sources, and gives you a trust score so you're not just blindly believing whatever it said.

There's two parts here:

- `app/`, `lib/`, `components/` - the Next.js web app, the actual firewall logic (scanner, claims, verify, hallucination, score)
- `extension/` - a Chrome extension that injects the firewall directly into chatgpt.com

## How the firewall actually works

**Outbound (before you send):** regex + entropy detectors catch emails, phone numbers, credit cards (Luhn checked), API keys (known prefixes plus a high entropy fallback), and passwords near keywords like "password:" or "token:". A separate heuristic/LLM check flags prompt injection attempts. If something critical shows up you get a redact button before you send anything.

**Inbound (after it answers):** the response gets broken into individual factual claims, each one gets checked against live web search results (never against the model's own training data, that's an explicit rule so it can't just vouch for itself), then you get a hallucination risk score and an overall trust score 0 to 100.

**Chrome extension:** same firewall logic running client side inside chatgpt.com. Shows a warning pill above the composer while you type, and a floating panel after the response with the trust score, claim verdicts, and code risk detection for anything ChatGPT hands you in a code block (hardcoded secrets, SQL injection via string concat, eval usage, that kind of thing).

## Running the web app

You need Node installed. Then:

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

You'll need:
- `GROQ_API_KEY` - the LLM, does all the classification and verification calls
- `TAVILY_API_KEY` - search provider for claim verification
- `DATABASE_URL` - Postgres, we used Neon
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` - Redis cache for verified claims
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` - Auth.js, google login (guest mode works without this)

Push the Prisma schema to your database:

```bash
npx prisma db push
```

Then run it:

```bash
npm run dev
```

Open `http://localhost:3000`.

Other useful commands:

```bash
npm run test        # run the test suite once
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run lint
```

## Running the Chrome extension

```bash
cd extension
npm install
npm run build
```

This spits out a `dist/` folder. To load it:

1. Go to `chrome://extensions`
2. Turn on Developer mode (top right toggle)
3. Click "Load unpacked"
4. Pick the `extension/dist` folder

Reload the extension from that page any time you rebuild. Then go to chatgpt.com in a fresh tab and it should just work, no popup, everything shows up inline on the page itself.

To work on the extension with hot reload instead of rebuilding every time:

```bash
npm run dev
```

Extension-only commands (run from inside `extension/`):

```bash
npm run typecheck
npx vitest run   # unit tests, includes jsdom simulations of the real chatgpt.com DOM
```

## Project layout

```
app/
  api/chat/route.ts       streams the chat answer
  api/analyze/route.ts    streams the firewall analysis (SSE)
lib/
  gateway/                LLM provider abstraction, Groq by default
  firewall/
    scanner/              PII regex, entropy, injection detection
    claims/                pulls factual claims out of a response
    verify/                Tavily search + judge model, decides verified/unverified/contradicted
    hallucination/        turns verified claims into a risk score
    score/                 the actual 0-100 trust score formula
components/firewall/      the panel UI pieces for the web app
extension/
  src/content/            content script that runs on chatgpt.com
  src/background/         service worker, talks to the analyze API
```

Everything under `lib/firewall/` is pure functions, no DB, no framework, so it's all unit tested and easy to swap out.

## Why Groq

One message triggers like 6-8 LLM calls (injection check, claim extraction, one verify call per claim, plus the actual chat answer). Groq's inference is fast enough that the trust panel finishes analyzing while the chat response is still streaming. Any slower provider and the demo would feel broken.
