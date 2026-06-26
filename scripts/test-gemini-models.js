/**
 * Gemini Model Comparison — Lead Research
 *
 * Runs the same lead research task across every configured model and prints
 * a side-by-side comparison showing which fields each model returns.
 *
 * Goal: identify which model reliably returns client name, budget, real
 * project URL, and location through live Google Search grounding.
 *
 * Key learning: the simple "find this lead" prompt (used on the Gemini web UI)
 * outperforms complex SEARCH 1/2/3/4 instructions — this script uses that format.
 *
 * Usage:
 *   node scripts/test-gemini-models.js
 *   node scripts/test-gemini-models.js YOUR_API_KEY_HERE
 */

require('dotenv').config();
const https = require('https');
const { GoogleGenAI } = require('@google/genai');

// ─── Setup ────────────────────────────────────────────────────────────────────

const API_KEY = process.argv[2] || process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('\n[ERROR] No API key. Add GEMINI_API_KEY to .env or pass as argument.\n');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const maskedKey = `${API_KEY.slice(0, 6)}${'*'.repeat(Math.max(0, API_KEY.length - 10))}${API_KEY.slice(-4)}`;

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

// ─── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

// ─── Test Lead ────────────────────────────────────────────────────────────────

// const LEAD_TITLE = 'Build Backend Functionality for Existing E-Commerce Website';
const LEAD_TITLE = 'Flutter / App Developer Needed for Louis Dating App – App Audit, Apple IAP Setup & Admin Panel';


// const LEAD_DETAILS = `We are looking for a skilled developer to help us implement several backend features for an existing e-commerce website.

// The project involves improving and extending the current platform functionality, including:

// * User authentication and account management
// * Product catalog management
// * Inventory tracking
// * Order processing workflows
// * Payment gateway integration
// * REST API development
// * Performance optimization
// * Database improvements

// The website is already in development, and we are looking for a freelancer who can assist with the backend implementation and provide technical recommendations where appropriate.

// Required experience:
// * Node.js
// * TypeScript
// * PostgreSQL
// * REST APIs
// * Backend development
// * Database optimization`;

const LEAD_DETAILS = `We are looking for a skilled developer to look after our flutter app and an admin panel.
 **Job Title:** Flutter / App Developer Needed for Louis Dating App – App Audit, Apple IAP Setup & Admin Panel

We are looking for an experienced Flutter / mobile app developer to help us fix and complete our dating app, Louis Dating.

The app already exists, but the previous developer, **Subhojit A.**, did not complete the work properly, failed to hand over the GitHub/source code correctly, and removed/deleted the existing admin panel. As a result, we now need a reliable developer who can review the full app, identify what is working and what is missing, and help us bring the project to a professional and stable standard.

**Main tasks:**

1. **Full app review and technical audit**

* Check the current app carefully.
* Test all main functions and user flows.
* Identify bugs, missing features, broken screens, and technical issues.
* Confirm whether the app is properly connected to the backend/API.
* Check what can be recovered and what needs to be rebuilt.

2. **Apple App Store payment setup**

* Set up in-app payments/subscriptions through Apple In-App Purchase.
* Make sure the payment flow works correctly inside the app.
* Help with App Store Connect setup if needed.
* Ensure the app follows Apple’s payment and subscription requirements.

3. **Build a proper admin panel**
We need a clean and functional admin dashboard where we can manage the app properly.

The admin panel should allow us to:

* Add new user profiles to the app.
* Edit existing profiles.
* Upload profile photos and profile information.
* Manage users.
* Approve, remove, or update profiles.
* See basic app activity and user data.
* Control important app content from one place.

4. **GitHub / code / proper handover**

* We need proper access to the full source code.
* The project must be uploaded and organized in GitHub.
* We need a clean handover so we are never locked out of our own app again.
* Documentation is required for the main setup, backend, admin panel, payments, and deployment.

**Important:**

We are not looking for someone who only gives promises. We need someone serious, honest, and experienced who can first audit the current app and clearly tell us what needs to be fixed.

Please apply only if you have experience with:

* Flutter apps
* Dating or social apps
* Apple In-App Purchases
* Admin panel development
* Backend/API integration
* GitHub and proper project handover

When applying, please explain:

1. Your experience with Flutter apps.
2. Whether you have set up Apple In-App Purchases before.
3. What kind of admin panels you have built before.
4. How you would approach the first audit of our app.
5. Estimated timeline and cost for the first review/audit phase.

We want to start with a technical audit first. If the audit is handled professionally, we can continue with the fixes, Apple payment setup, and full admin panel development.

`;

// ─── Prompt ───────────────────────────────────────────────────────────────────
// Simple, direct format matching the Gemini web UI prompt that returned perfect results.
// No SEARCH 1/2/3/4 instructions — the model decides how to search naturally.
// "projectUrl": "URL from search results verbatim" — this exact wording from the web
// prompt caused the model to return the real canonical PPH URL instead of constructing one.

const RESEARCH_PROMPT = `Find this project lead on the internet and return the result in the JSON format below.

Project Title: ${LEAD_TITLE}
Project Description:
${LEAD_DETAILS}

Search online to find:
- Which freelance platform(s) this project was posted on and the direct URL to the specific posting
- Who posted the project: client full name, location, contact details, social media profiles (LinkedIn, GitHub, Twitter/X, personal website)
- The stated budget, currency, and payment type

Return ONLY valid JSON in this exact structure. No markdown fences, no explanation, no extra text before or after the JSON:

{
  "client": {
    "name": "person's full name, or null",
    "contact": "email or phone found online, or null",
    "socialLinks": {
      "linkedin": "full LinkedIn URL, or null",
      "github": "full GitHub URL, or null",
      "twitter": "full Twitter/X URL, or null",
      "personalSite": "personal website URL, or null"
    },
    "company": "company name, or null",
    "location": "city/country, or null",
    "industry": "industry or sector, or null",
    "businessDescription": "2-3 sentence description, or null"
  },
  "platforms": [
    {
      "name": "platform name confirmed by search results",
      "projectUrl": "URL from search results verbatim, or null",
      "overview": "1-2 sentence description of this platform"
    }
  ],
  "budget": {
    "stated": "exact budget from the lead or posting, or null",
    "currency": "currency code e.g. USD, or null",
    "paymentPreference": "Fixed Price / Hourly / Milestone-based, or null"
  }
}`;

// ─── URL Resolver ─────────────────────────────────────────────────────────────

const followRedirect = (url) =>
  new Promise((resolve) => {
    if (!url || !url.startsWith('https://vertexaisearch.cloud.google.com')) {
      resolve({ real: url, resolved: false });
      return;
    }
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      const real = res.headers.location;
      resolve(real ? { real, resolved: true } : { real: url, resolved: false });
    });
    req.setTimeout(5000, () => { req.destroy(); resolve({ real: url, resolved: false }); });
    req.on('error', () => resolve({ real: url, resolved: false }));
    req.end();
  });

const resolveVertexAiUrls = async (obj) => {
  if (!obj || typeof obj !== 'object') return;
  await Promise.all(
    Object.entries(obj).map(async ([key, val]) => {
      if (typeof val === 'string' && val.startsWith('https://vertexaisearch.cloud.google.com')) {
        const { real, resolved } = await followRedirect(val);
        // eslint-disable-next-line no-param-reassign
        obj[key] = resolved ? real : null;
      } else if (val && typeof val === 'object') {
        await resolveVertexAiUrls(val);
      }
    })
  );
};

// ─── JSON Extractor ───────────────────────────────────────────────────────────

const extractJson = (text) => {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  let depth = 0; let inStr = false; let esc = false;
  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) return stripped.slice(start, i + 1); }
    }
  }
  return null;
};

// ─── Single Model Test ────────────────────────────────────────────────────────

async function testModel(model) {
  console.log(c.bold(`\n${'═'.repeat(57)}`));
  console.log(c.bold(`  ${c.cyan(model)}`));
  console.log(`${'═'.repeat(57)}`);

  const startTime = Date.now();
  const TIMEOUT_MS = 90000;
  const MAX_RETRIES = 2;

  let response;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const apiCall = ai.models.generateContent({
        model,
        contents: RESEARCH_PROMPT,
        config: { tools: [{ googleSearch: {} }] },
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
      );
      // eslint-disable-next-line no-await-in-loop
      response = await Promise.race([apiCall, timeout]);
      break;
    } catch (err) {
      const is503 = err.message?.includes('503') || err.message?.includes('UNAVAILABLE');
      if (is503 && attempt <= MAX_RETRIES) {
        const delay = attempt * 6000;
        console.log(`  ${c.yellow(`503 high demand — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`)}`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delay));
      } else {
        const label = err.message?.includes('404') || err.message?.includes('NOT_FOUND')
          ? 'model deprecated / not found (404)'
          : err.message?.includes('503')
          ? 'high demand — all retries exhausted (503)'
          : err.message?.slice(0, 100);
        console.log(`  ${c.red('✗ SKIP')}  ${label}`);
        return { model, error: label, elapsed: ((Date.now() - startTime) / 1000).toFixed(1) };
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const text = response?.text ?? null;
  const candidate = response?.candidates?.[0] ?? null;
  const meta = candidate?.groundingMetadata;
  const queries = meta?.webSearchQueries ?? [];
  const chunks = meta?.groundingChunks ?? [];
  const groundingFired = queries.length > 0;

  // ── Grounding summary ──
  const dataSource = groundingFired ? c.green('LIVE WEB') : c.yellow('TRAINING DATA');
  console.log(`\n  Time: ${c.bold(elapsed + 's')}  |  Queries: ${c.bold(String(queries.length))}  |  Chunks: ${c.bold(String(chunks.length))}  |  Source: ${dataSource}`);

  if (queries.length > 0) {
    console.log(`\n  ${c.bold('Searches run:')}`);
    queries.forEach((q, i) => console.log(`    [${i + 1}] ${q}`));
  }

  if (chunks.length > 0) {
    console.log(`\n  ${c.bold('Sources cited:')}`);
    chunks.forEach((chunk, i) => {
      const domain = chunk.web?.title ?? 'unknown';
      console.log(`    [${i}] ${c.cyan(domain)}`);
    });
  }

  if (!text) {
    console.log(`\n  ${c.red('✗')} Empty response`);
    return { model, error: 'empty response', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  // ── Parse ──
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    console.log(`\n  ${c.red('✗')} No parseable JSON in response`);
    console.log(c.dim(`  Raw (first 300 chars): ${text.slice(0, 300)}`));
    return { model, error: 'no JSON', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.log(`\n  ${c.red('✗')} JSON.parse failed: ${e.message}`);
    return { model, error: 'JSON parse error', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  // ── Resolve proxy URLs ──
  const rawJson = JSON.stringify(parsed);
  if (rawJson.includes('vertexaisearch.cloud.google.com')) {
    console.log(`\n  ${c.yellow('ℹ')} Resolving proxy URLs…`);
    await resolveVertexAiUrls(parsed);
    console.log(`  ${c.green('✓')} Proxy URLs resolved`);
  }

  // ── Result ──
  console.log(`\n  ${c.bold('Research Result:')}`);
  console.log(JSON.stringify(parsed, null, 4).split('\n').map((l) => `  ${l}`).join('\n'));

  return {
    model, elapsed, groundingFired,
    queries: queries.length,
    chunks: chunks.length,
    parsed,
  };
}

// ─── Comparison Table ─────────────────────────────────────────────────────────

function printComparison(results) {
  console.log(c.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(c.bold('║  COMPARISON SUMMARY                                   ║'));
  console.log(c.bold('╚═══════════════════════════════════════════════════════╝\n'));

  const COL = 18;
  const FIELD_COL = 16;

  const header = results.map((r) => r.model.replace('gemini-', '').slice(0, COL - 2).padEnd(COL));
  console.log(`  ${'Field'.padEnd(FIELD_COL)} ${header.join('')}`);
  console.log(`  ${'─'.repeat(FIELD_COL)} ${results.map(() => '─'.repeat(COL)).join('')}`);

  const check = (val) => {
    if (!val || val === 'null') return c.dim('null'.padEnd(COL));
    const label = String(val).slice(0, COL - 2);
    return c.green(label.padEnd(COL));
  };

  const fields = [
    { label: 'Client name',  get: (r) => r.parsed?.client?.name },
    { label: 'Location',     get: (r) => r.parsed?.client?.location },
    { label: 'Industry',     get: (r) => r.parsed?.client?.industry },
    { label: 'Budget',       get: (r) => r.parsed?.budget?.stated },
    { label: 'Currency',     get: (r) => r.parsed?.budget?.currency },
    { label: 'Pay type',     get: (r) => r.parsed?.budget?.paymentPreference },
    { label: 'Platform',     get: (r) => r.parsed?.platforms?.[0]?.name },
    { label: 'Project URL',  get: (r) => r.parsed?.platforms?.[0]?.projectUrl ? 'found' : null },
    { label: 'LinkedIn',     get: (r) => r.parsed?.client?.socialLinks?.linkedin },
  ];

  for (const field of fields) {
    const cells = results.map((r) => {
      if (r.error) return c.red(('ERR: ' + r.error).slice(0, COL - 2).padEnd(COL));
      return check(field.get(r));
    });
    console.log(`  ${field.label.padEnd(FIELD_COL)} ${cells.join('')}`);
  }

  console.log(`  ${'─'.repeat(FIELD_COL)} ${results.map(() => '─'.repeat(COL)).join('')}`);

  const statsFields = [
    { label: 'Queries/Chunks', get: (r) => r.error ? 'ERR' : `${r.queries}q / ${r.chunks}c` },
    { label: 'Time',           get: (r) => r.error ? 'ERR' : `${r.elapsed}s` },
    { label: 'Data source',    get: (r) => r.error ? 'ERR' : (r.groundingFired ? 'LIVE WEB' : 'TRAINING') },
  ];

  for (const field of statsFields) {
    const cells = results.map((r) => {
      if (r.error) return c.red('ERROR'.padEnd(COL));
      const val = field.get(r);
      const color = field.label === 'Data source'
        ? (r.groundingFired ? c.green : c.yellow)
        : (s) => s;
      return color(String(val).padEnd(COL));
    });
    console.log(`  ${field.label.padEnd(FIELD_COL)} ${cells.join('')}`);
  }

  // Best model recommendation
  const scored = results
    .filter((r) => !r.error && r.parsed)
    .map((r) => {
      let score = 0;
      if (r.parsed.client?.name) score += 3;
      if (r.parsed.client?.location) score += 2;
      if (r.parsed.budget?.stated) score += 3;
      if (r.parsed.platforms?.[0]?.projectUrl) score += 3;
      if (r.parsed.client?.industry) score += 1;
      if (r.groundingFired) score += 2;
      return { model: r.model, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    console.log(`\n  ${c.bold('Best model for lead research:')} ${c.green(scored[0].model)} (score: ${scored[0].score}/14)`);
    if (scored.length > 1) {
      console.log(`  ${c.dim('Ranking:')} ${scored.map((s) => `${s.model} (${s.score})`).join(' → ')}`);
    }
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(async () => {
  console.log(c.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(c.bold('║  Gemini Model Comparison — Lead Research              ║'));
  console.log(c.bold('╚═══════════════════════════════════════════════════════╝'));
  console.log(`\n  Key    : ${maskedKey}`);
  console.log(`  Lead   : "${LEAD_TITLE}"`);
  console.log(`  Models : ${MODELS.join(', ')}`);
  console.log(c.dim(`  Prompt : simple "find this lead" format (matches Gemini web UI — no SEARCH 1/2/3/4)`));
  console.log(c.dim(`  Each model runs independently with grounding ON. Comparison table at the end.\n`));

  const results = [];
  for (const model of MODELS) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await testModel(model));
  }

  printComparison(results);

  console.log(c.bold('\n  Done.\n'));
})();
