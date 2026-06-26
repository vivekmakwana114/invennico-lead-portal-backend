/**
 * Lead Research Test — Final Production Test Script
 *
 * Tests the Gemini grounding setup (prompt + models) that will run in
 * gemini.service.js. Run this against any lead BEFORE updating the service.
 *
 * Key learnings applied here:
 *  - Simple "find this lead" prompt beats complex SEARCH 1/2/3/4 instructions
 *  - "projectUrl verbatim" instruction → model returns real found URLs, not constructed ones
 *  - "client = who posted the job" note → fixes confusion with devs mentioned in description
 *  - gemini-2.5-flash: fastest, reliable (13/14 on e-commerce, 9/14 on flutter)
 *  - gemini-2.5-pro: more queries (up to 11), better on complex leads (14/14 on flutter)
 *  - gemini-3.1-flash-lite: NEVER uses grounding (always training data) — excluded
 *  - gemini-3.5-flash: consistently 503 — excluded
 *
 * HOW TO SWITCH LEAD:
 *   Change LEAD_TITLE and LEAD_DETAILS below. The prompt and models are fixed.
 *
 * Usage:
 *   node scripts/lead-testing-testing.js
 *   node scripts/lead-testing-testing.js YOUR_API_KEY_HERE
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
// Only confirmed working models with live grounding.
// Ordered: fastest-first for service fallback parity.

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Flash — primary (fast, live grounding)' },
  { id: 'gemini-2.5-pro',   label: 'Pro — thorough (more queries, richer data)' },
];

// ─── Lead Data ────────────────────────────────────────────────────────────────
// Swap LEAD_TITLE + LEAD_DETAILS to test any lead. Two examples provided.

// Example 1 — E-Commerce backend (confirmed: £1.4k GBP, Fanel O., PeoplePerHour)
/*
const LEAD_TITLE = 'Build Backend Functionality for Existing E-Commerce Website';
const LEAD_DETAILS = `We are looking for a skilled developer to help us implement several backend features for an existing e-commerce website.

The project involves improving and extending the current platform functionality, including:
* User authentication and account management
* Product catalog management
* Order processing workflows
* Payment gateway integration
* REST API development
* Database improvements

Required experience: Node.js, TypeScript, PostgreSQL, REST APIs, Backend development`;
*/

// Example 2 — Flutter dating app (confirmed: Albert K., Hungary, Louis Dating, PPH)
// const LEAD_TITLE = 'Mobile App Developer Needed for Premium AI Coaching App';
// const LEAD_DETAILS = `Hi,

// We are looking for an experienced mobile app developer or small team to build a premium AI-powered coaching / mentor mobile app from a completed Figma design.

// This is NOT a basic chatbot app and not a template app.

// The product is a structured AI coaching experience with onboarding, AI memory, daily tasks, accountability, progress tracking, push notifications, subscriptions, and basic content/admin control.

// Core MVP features:

// - iOS + Android app
// - Figma implementation
// - registration / login
// - onboarding flow
// - weak-area / problem selection
// - coach intensity selection
// - AI first-session questionnaire
// - AI mentor chat
// - structured AI memory / user context
// - daily quote system
// - ONE main daily task per day
// - YES / NO accountability
// - internal commitment score / points
// - progress tracking
// - weekly reflections
// - push notifications
// - free access / trial logic
// - subscription paywall
// - Apple In-App Purchases
// - Google Play Billing
// - restore purchases
// - backend subscription validation
// - locked / unlocked access based on subscription status
// - basic admin / content control
// - App Store + Play Store ready builds
// - deployment support
// - source code handover
// - documentation
// - post-delivery bug-fix support

// AI requirements:

// The AI mentor should not feel like normal ChatGPT.

// It should use:

// - onboarding answers
// - user profile
// - goals / preferences
// - selected weak areas
// - coach intensity
// - conversation summaries
// - important user facts
// - task history
// - YES / NO completion history
// - progress history
// - weekly reflections

// We do NOT want to send unlimited raw chat history to the AI every time.

// The memory should be structured, scalable, and cost-efficient.

// The mentor tone should be:

// - direct
// - short
// - disciplined
// - honest
// - action-focused
// - accountability-driven
// - not generic
// - not therapy-style
// - not motivational fluff

// Daily task logic:

// The app should give the user ONE main daily task, not multiple random tasks.

// Flow:

// 1. User receives one daily task
// 2. User receives reminder notification
// 3. Evening check-in asks YES / NO
// 4. Result is stored
// 5. Progress / commitment score updates
// 6. AI mentor reacts based on behavior
// 7. Future tasks adapt based on history and user context

// For MVP, daily tasks should use templates/categories + AI personalization, not fully random AI-generated content.

// Guidance areas should include:

// - discipline
// - focus
// - work / money
// - fitness
// - dating / relationships
// - confidence
// - habits
// - appearance / grooming / style
// - books / films / music recommendations where relevant

// These should not be separate complex modules in MVP. They should be part of the AI mentor, task templates, content logic, and daily guidance system.

// Admin / content control:

// We need a basic content/admin layer to manage:

// - daily quotes
// - task templates / categories
// - basic recommendation content
// - AI prompt / config text
// - basic user / subscription visibility if possible

// This does not need to be a large enterprise admin panel, but important content should not be hardcoded only.

// Preferred stack:

// Mobile:
// - Flutter or React Native / Expo

// Backend:
// - Node.js / NestJS, Django, FastAPI, Supabase / PostgreSQL

// AI:
// - OpenAI API
// - Claude optional later
// - structured memory system
// - prompt/config layer

// Payments:
// - Apple IAP
// - Google Play Billing
// - RevenueCat acceptable if recommended

// Notifications:
// - Firebase Cloud Messaging or OneSignal

// We will provide:

// - completed Figma design
// - user flows
// - mood board / visual direction
// - AI mentor tone direction
// - feature explanation
// - content examples where needed

// Important:

// We need someone who understands AI memory, user context, subscriptions, backend logic, scalable architecture, and polished mobile UX.

// Payments must be milestone-based.

// Payment after each milestone should only be released after a working, testable demo/build is approved.

// Please answer clearly:

// 1. What tech stack would you use and why?
// 2. How would you handle AI memory / user context?
// 3. Have you built AI chat or AI assistant apps before?
// 4. Have you implemented Apple IAP and Google Play Billing before?
// 5. Would you use RevenueCat or direct Apple/Google billing, and why?
// 6. How would you structure the backend?
// 7. What would the basic admin/content control include?
// 8. Estimated timeline?
// 9. Best fixed price for the full MVP?
// 10. Milestone breakdown with payment per milestone?
// 11. 2–3 real mobile apps you personally built?
// 12. Confirm source code and handover documentation are included.
// 13. Confirm payment is released only after each working milestone is approved.

// Please do not send a generic proposal.

// We are comparing multiple developers and will shortlist based on relevant AI app experience, subscription experience, strong architecture, fair pricing, clear milestones, and ability to understand product logic.

// Thanks.`;
const LEAD_TITLE = 'Website Management & Hosting Partner — Ongoing Paid Tasks';
const LEAD_DETAILS = `AIS (All Inclusive Services) is launching soon — a fully managed hosting and website management system designed for agencies, freelancers, and multi‑site business owners.

We’re building our Partner Network and looking for skilled professionals to handle ongoing paid tasks as they come in.

This is not a one‑off project or speculative work.
Each task will be clearly defined, priced, and paid through PPH once completed and approved.

We’re looking for:

Web designers

Developers

SEO specialists

Copywriters

Branding experts

Marketing professionals

Social media managers

What you’ll do:

Complete assigned tasks (design, development, content, etc.)

Deliver clean, professional work on time

Communicate efficiently through the AIS system

Maintain high standards of quality and reliability

What you’ll get:

Consistent paid work

No client chasing

No admin headaches

Fair task pricing

Long‑term collaboration opportunities

AIS is built to make agencies and freelancers more profitable while freeing their time and reducing stress.
If you’re serious about joining a growing network and want steady, structured work — apply now.

Deliverable:
Registration and onboarding as an AIS Partner (details provided after approval).`;

// ─── Prompt ───────────────────────────────────────────────────────────────────
// KEEP IN SYNC WITH gemini.service.js DEFAULT_GEMINI_FULL_PROMPT.
// If you update this, apply the same change to the service file.

const SYSTEM_PROMPT = `Find this project lead on the internet using Google Search and return the result as JSON.

Search online to find:
- Which freelance platform(s) this project was posted on, and the direct URL to the specific posting
- Who posted the project (the client/buyer): their full name, location, contact details, and social media profiles (LinkedIn, GitHub, Twitter/X, personal website). The client is the person who POSTED the job — not any developers, contractors, or team members mentioned inside the description.
- The stated budget, currency, and payment type

Return ONLY valid JSON in this exact structure. No markdown fences, no explanation, no extra text:

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
    "businessDescription": "2-3 sentence description of the client's business, or null"
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
    "currency": "currency code e.g. USD GBP EUR, or null",
    "paymentPreference": "Fixed Price / Hourly / Milestone-based, or null"
  }
}`;

const RESEARCH_PROMPT = `${SYSTEM_PROMPT}

LEAD DATA:
Project Title: ${LEAD_TITLE}
Project Description:
${LEAD_DETAILS}

Use the LEAD DATA above to search. Return ONLY the valid JSON object — no markdown, no explanation.`;

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

// ─── Score a result ──────────────────────────────────────────────────────────
// Max 14 points. Mirrors the criteria we care about in production.

function scoreResult(r) {
  if (r.error || !r.parsed) return 0;
  let s = 0;
  if (r.parsed.client?.name) s += 3;
  if (r.parsed.client?.location) s += 2;
  if (r.parsed.budget?.stated) s += 3;
  if (r.parsed.platforms?.[0]?.projectUrl) s += 3;
  if (r.parsed.client?.industry) s += 1;
  if (r.groundingFired) s += 2;
  return s;
}

// ─── Single Model Test ────────────────────────────────────────────────────────

async function testModel({ id, label }) {
  console.log(c.bold(`\n${'═'.repeat(60)}`));
  console.log(c.bold(`  ${c.cyan(id)}`));
  console.log(c.dim(`  ${label}`));
  console.log(`${'═'.repeat(60)}`);

  const startTime = Date.now();
  const TIMEOUT_MS = 90000;
  const MAX_RETRIES = 2;

  let response;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const apiCall = ai.models.generateContent({
        model: id,
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
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        const errLabel = err.message?.includes('404') || err.message?.includes('NOT_FOUND')
          ? 'model not found (404) — deprecated'
          : err.message?.includes('503')
          ? 'high demand (503) — all retries exhausted'
          : err.message?.slice(0, 100);
        console.log(`  ${c.red('✗ SKIP')}  ${errLabel}`);
        return { id, label, error: errLabel, elapsed: ((Date.now() - startTime) / 1000).toFixed(1) };
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
  const src = groundingFired ? c.green('LIVE WEB') : c.yellow('TRAINING DATA (no grounding)');
  console.log(`\n  Time: ${c.bold(elapsed + 's')}  |  Queries: ${c.bold(String(queries.length))}  |  Chunks: ${c.bold(String(chunks.length))}  |  Source: ${src}`);

  if (queries.length > 0) {
    console.log(`\n  ${c.bold('Search queries:')}`);
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
    return { id, label, error: 'empty response', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  // ── Parse JSON ──
  const jsonStr = extractJson(text);
  if (!jsonStr) {
    console.log(`\n  ${c.red('✗')} No parseable JSON in response`);
    console.log(c.dim(`  Raw (first 400 chars):\n  ${text.slice(0, 400)}`));
    return { id, label, error: 'no JSON', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.log(`\n  ${c.red('✗')} JSON parse error: ${e.message}`);
    return { id, label, error: 'JSON parse error', elapsed, groundingFired, queries: queries.length, chunks: chunks.length };
  }

  // ── Resolve proxy URLs (same as gemini.service.js) ──
  if (JSON.stringify(parsed).includes('vertexaisearch.cloud.google.com')) {
    console.log(`\n  ${c.yellow('→')} Resolving vertexaisearch proxy URLs…`);
    await resolveVertexAiUrls(parsed);
  }

  // ── Result ──
  const score = scoreResult({ parsed, groundingFired });
  const label2 = groundingFired ? c.green('grounded — live web data') : c.yellow('no grounding — training data only');
  console.log(`\n  ${c.bold('Research Result:')}  ${label2}  |  Score: ${c.bold(String(score))}/14`);
  console.log(JSON.stringify(parsed, null, 4).split('\n').map((l) => `  ${l}`).join('\n'));

  return { id, label, elapsed, groundingFired, queries: queries.length, chunks: chunks.length, parsed };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function printSummary(results) {
  console.log(c.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(c.bold('║  SUMMARY                                              ║'));
  console.log(c.bold('╚═══════════════════════════════════════════════════════╝'));

  const fields = [
    { label: 'Client name',  get: (r) => r.parsed?.client?.name },
    { label: 'Location',     get: (r) => r.parsed?.client?.location },
    { label: 'Company',      get: (r) => r.parsed?.client?.company },
    { label: 'Industry',     get: (r) => r.parsed?.client?.industry },
    { label: 'Budget',       get: (r) => r.parsed?.budget?.stated },
    { label: 'Currency',     get: (r) => r.parsed?.budget?.currency },
    { label: 'Pay type',     get: (r) => r.parsed?.budget?.paymentPreference },
    { label: 'Platform',     get: (r) => r.parsed?.platforms?.[0]?.name },
    { label: 'Project URL',  get: (r) => r.parsed?.platforms?.[0]?.projectUrl },
    { label: 'LinkedIn',     get: (r) => r.parsed?.client?.socialLinks?.linkedin },
    { label: 'GitHub',       get: (r) => r.parsed?.client?.socialLinks?.github },
  ];

  for (const r of results) {
    const score = scoreResult(r);
    const src = r.error ? c.red('ERROR') : r.groundingFired ? c.green('LIVE WEB') : c.yellow('TRAINING');
    console.log(`\n  ${c.bold(c.cyan(r.id))}  ${src}  ${r.error ? '' : `| ${r.queries}q/${r.chunks}c | ${r.elapsed}s | Score: ${c.bold(String(score))}/14`}`);

    if (r.error) {
      console.log(`    ${c.red('✗')} ${r.error}`);
      continue;
    }

    for (const f of fields) {
      const val = f.get(r);
      if (val) {
        console.log(`    ${c.green('✓')} ${f.label.padEnd(13)} ${c.green(String(val).slice(0, 80))}`);
      } else {
        console.log(`    ${c.dim('·')} ${f.label.padEnd(13)} ${c.dim('null')}`);
      }
    }
  }

  // Ranking
  const ranked = results
    .filter((r) => !r.error)
    .map((r) => ({ id: r.id, score: scoreResult(r) }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length > 0) {
    console.log(c.bold('\n  ── Ranking ──'));
    ranked.forEach((r, i) => {
      const medal = i === 0 ? c.green('★ 1st') : i === 1 ? c.yellow('  2nd') : c.dim(`  ${i + 1}th`);
      console.log(`  ${medal}  ${c.cyan(r.id.padEnd(28))}  score: ${r.score}/14`);
    });
    console.log(`\n  ${c.bold('Recommended for service GEMINI_MODELS[0]:')} ${c.green(ranked[0].id)}`);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(async () => {
  console.log(c.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(c.bold('║  Lead Research Test                                   ║'));
  console.log(c.bold('╚═══════════════════════════════════════════════════════╝'));
  console.log(`\n  Key    : ${maskedKey}`);
  console.log(`  Lead   : "${LEAD_TITLE}"`);
  console.log(`  Models : ${MODELS.map((m) => m.id).join(' → ')}`);
  console.log(c.dim('  Prompt: simple format + verbatim URL + client-vs-dev note\n'));

  const results = [];
  for (const model of MODELS) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await testModel(model));
  }

  printSummary(results);

  console.log(c.bold('\n  Done.\n'));
})();
