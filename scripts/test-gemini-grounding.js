/**
 * Gemini Google Search Grounding — Diagnostic Script
 *
 * Tests Gemini models for Google Search grounding capability using real lead data.
 * Displays the FULL grounding metadata structure per the official API docs:
 *   - webSearchQueries  → what the model searched for
 *   - groundingChunks   → sources used (uri + title/domain)
 *   - groundingSupports → which text segments are backed by which sources
 *   - searchEntryPoint  → rendered search widget HTML (exists but not rendered here)
 *
 * Usage:
 *   node scripts/test-gemini-grounding.js
 *   node scripts/test-gemini-grounding.js YOUR_API_KEY_HERE
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

const PASS = c.green('✓ PASS');
const FAIL = c.red('✗ FAIL');
const WARN = c.yellow('⚠ WARN');
const INFO = c.cyan('ℹ INFO');

// ─── Test Lead ────────────────────────────────────────────────────────────────

// const LEAD_TITLE = 'Build Backend Functionality for Existing E-Commerce Website';

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

const LEAD_TITLE = 'Professional Online Store Website Development';
const LEAD_DETAILS = `I’m ready to launch a polished, conversion-focused e-commerce site and want to get the build started right away. The store needs to project a premium look, load quickly on desktop and mobile, and give me everything required to manage inventory, orders, discounts, and basic SEO without touching code.

Your job is to plan, design, and deliver the entire storefront—from the responsive UI and product catalogue to secure checkout, payment gateway integration, tax/shipping rules, and analytics hooks. I’m flexible on the underlying platform; whether you favour Shopify, WooCommerce, Magento, or a custom stack, show me why it fits a growing catalogue and how it will stay easy to maintain.

Deliverables
• Fully functional online store deployed to my domain
• Branded, mobile-optimised theme with intuitive navigation and search
• Integrated payments, shipping calculator, and automated order emails
• Lightweight SEO setup (meta tags, clean URLs, schema where relevant)
• Admin walkthrough plus concise documentation for future updates

Acceptance Criteria
• Sub-3-second page load times on GTmetrix
• End-to-end checkout passes with a sandbox card
• No critical Lighthouse accessibility errors

Once the store is live and stable, I’ll circle back for a Python tool to automate Excel data processing, but the website comes first. Let’s get the shop open for business.`;

// ─── Models ───────────────────────────────────────────────────────────────────
// Source: Gemini API grounding docs — supported models table (non-image, non-preview only).
// gemini-2.0-flash and gemini-2.0-flash-001 both return 404 — entire 2.0 family is dead.
// gemini-3.x IDs are unconfirmed against the live API — script will probe and report.

const MODELS = [
  { id: 'gemini-2.5-flash',      expectsGrounding: true, note: 'Primary — confirmed working' },
  { id: 'gemini-3.5-flash',      expectsGrounding: true, note: 'Docs: Gemini 3.5 Flash — probing API ID' },
  { id: 'gemini-3.1-flash-lite', expectsGrounding: true, note: 'Docs: Gemini 3.1 Flash-Lite — probing API ID' },
  { id: 'gemini-2.5-flash-lite', expectsGrounding: true, note: 'Fallback — confirmed working' },
  { id: 'gemini-2.5-pro',        expectsGrounding: true, note: 'Pro tier — confirmed working' },
]; 

// ─── Redirect Resolver ────────────────────────────────────────────────────────
// groundingChunks[].web.uri are vertexaisearch.cloud.google.com proxy URLs.
// A HEAD request returns the real URL in the Location header.

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

// Walk every string value in obj and resolve vertexaisearch proxy URLs in-place.
// Mirrors the same function in gemini.service.js.
const resolveVertexAiUrls = async (obj, log = false) => {
  if (!obj || typeof obj !== 'object') return;
  await Promise.all(
    Object.entries(obj).map(async ([key, val]) => {
      if (typeof val === 'string' && val.startsWith('https://vertexaisearch.cloud.google.com')) {
        const { real, resolved } = await followRedirect(val);
        if (resolved) {
          if (log) console.log(`  ${c.green('  → proxy resolved:')} ${real}`);
          obj[key] = real;
        } else {
          if (log) console.log(`  ${c.yellow('  → proxy expired — set to null')}`);
          obj[key] = null;
        }
      } else if (val && typeof val === 'object') {
        await resolveVertexAiUrls(val, log);
      }
    })
  );
};

// ─── Print Full Grounding Metadata ───────────────────────────────────────────
// Shows every field the Gemini API returns for grounding, per official docs.

async function printGroundingMetadata(candidate, indent = '  ') {
  const meta = candidate?.groundingMetadata;
  if (!meta) {
    console.log(`${indent}${c.yellow('groundingMetadata: undefined')}`);
    return;
  }

  // 1. webSearchQueries
  const queries = meta.webSearchQueries ?? [];
  console.log(`${indent}${c.bold('webSearchQueries')} (${queries.length}):`);
  queries.forEach((q, i) => console.log(`${indent}  [${i + 1}] "${q}"`));

  // 2. groundingChunks — source pages (proxy URI + domain title)
  const chunks = meta.groundingChunks ?? [];
  console.log(`\n${indent}${c.bold('groundingChunks')} (${chunks.length} sources):`);
  if (chunks.length === 0) {
    console.log(`${indent}  ${c.yellow('none — model searched but did not cite any sources')}`);
    console.log(`${indent}  ${c.yellow('This means the response may be from training data, not live web.')}`);
  } else {
    // Resolve proxy URLs in parallel
    const resolved = await Promise.all(
      chunks.map((chunk) => followRedirect(chunk.web?.uri))
    );
    chunks.forEach((chunk, i) => {
      const domain = chunk.web?.title ?? 'unknown domain';
      const { real, resolved: wasResolved } = resolved[i];
      const urlLabel = wasResolved ? c.green(real) : c.yellow(real?.slice(0, 80) + '…');
      const resolveNote = wasResolved ? '' : c.dim(' (redirect expired — proxy URL)');
      console.log(`${indent}  [${i}] ${c.cyan(domain)}${resolveNote}`);
      console.log(`${indent}      ${urlLabel}`);
    });
  }

  // 3. groundingSupports — which text segments cite which chunks
  const supports = meta.groundingSupports ?? [];
  console.log(`\n${indent}${c.bold('groundingSupports')} (${supports.length} citations):`);
  if (supports.length === 0) {
    console.log(`${indent}  none`);
  } else {
    supports.forEach((s, i) => {
      const seg = s.segment;
      const text = seg?.text?.replace(/\n/g, ' ').slice(0, 80) ?? '';
      const indices = (s.groundingChunkIndices ?? []).join(', ');
      console.log(`${indent}  [${i}] chars ${seg?.startIndex}–${seg?.endIndex} → chunk(s) [${indices}]`);
      console.log(`${indent}      "${text}${text.length >= 80 ? '…' : ''}"`);
    });
  }

  // 4. searchEntryPoint — rendered HTML widget (exists, not rendered in terminal)
  const hasEntryPoint = Boolean(meta.searchEntryPoint?.renderedContent);
  console.log(`\n${indent}${c.bold('searchEntryPoint')}: ${hasEntryPoint ? c.green('present (HTML widget for UI rendering)') : c.dim('absent')}`);
}

// ─── Core API Call ────────────────────────────────────────────────────────────

async function callGemini({ model, prompt, useGrounding = false, timeoutMs = 30000, maxRetries = 2 }) {
  const cfg = useGrounding ? { tools: [{ googleSearch: {} }] } : {};

  const attempt = () => {
    const apiCall = ai.models.generateContent({ model, contents: prompt, config: cfg });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    );
    return Promise.race([apiCall, timeout]);
  };

  let lastErr;
  for (let i = 0; i <= maxRetries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await attempt();
      const text = response.text ?? null;
      const candidate = response?.candidates?.[0] ?? null;
      return { text, candidate, rawResponse: response };
    } catch (err) {
      lastErr = err;
      const is503 = err.message?.includes('503') || err.message?.includes('UNAVAILABLE');
      if (is503 && i < maxRetries) {
        const delay = (i + 1) * 5000;
        process.stdout.write(`\n    ${c.yellow(`503 — retrying in ${delay / 1000}s… (attempt ${i + 2}/${maxRetries + 1})`)} `);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

// ─── PHASE 1: Basic Connectivity ─────────────────────────────────────────────

async function phase1BasicConnectivity() {
  console.log(c.bold('\n═══════════════════════════════════════════════════════'));
  console.log(c.bold(' PHASE 1 — Basic Connectivity (no grounding)'));
  console.log(c.bold('═══════════════════════════════════════════════════════\n'));

  const results = {};
  for (const { id, note } of MODELS) {
    process.stdout.write(`  ${c.cyan(id)} (${note}) … `);
    try {
      const { text } = await callGemini({ model: id, prompt: 'Reply with exactly: "Gemini is working."', timeoutMs: 15000 });
      if (text?.includes('Gemini')) {
        console.log(`${PASS}  "${text.trim().slice(0, 50)}"`);
        results[id] = 'ok';
      } else {
        console.log(`${WARN}  unexpected: "${String(text).slice(0, 50)}"`);
        results[id] = 'unexpected';
      }
    } catch (err) {
      console.log(`${FAIL}  ${err.message.slice(0, 100)}`);
      results[id] = 'error';
    }
  }
  return results;
}

// ─── PHASE 2: Grounding Check + Full Metadata ─────────────────────────────────

async function phase2GroundingCheck() {
  console.log(c.bold('\n═══════════════════════════════════════════════════════'));
  console.log(c.bold(' PHASE 2 — Google Search Grounding + Full Metadata'));
  console.log(c.bold('═══════════════════════════════════════════════════════'));
  console.log(c.dim('  Uses the full grounding metadata structure from the official API docs.\n'));

  const PROMPT = 'What is the latest stable version of Node.js as of today? Search for the answer.';
  const results = {};

  for (const { id, expectsGrounding } of MODELS) {
    console.log(`\n  ${c.bold(c.cyan(id))}`);
    try {
      const { text, candidate } = await callGemini({ model: id, prompt: PROMPT, useGrounding: true, timeoutMs: 30000 });

      if (!text) {
        console.log(`    ${FAIL}  Empty response`);
        results[id] = 'empty';
        continue;
      }

      const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];
      const chunks  = candidate?.groundingMetadata?.groundingChunks ?? [];
      const fired   = queries.length > 0;

      console.log(`    Status: ${fired ? PASS + ' ' + c.green('Google Search FIRED') : (expectsGrounding ? FAIL : INFO) + ' did not fire'}`);
      console.log(`    Reply:  "${text.trim().slice(0, 100)}${text.length > 100 ? '…' : ''}"`);

      await printGroundingMetadata(candidate, '    ');
      results[id] = fired ? 'grounded' : 'not_grounded';
    } catch (err) {
      const msg = err.message;
      if (msg.includes('400') || msg.includes('404') || msg.includes('not supported') || msg.includes('INVALID') || msg.includes('NOT_FOUND')) {
        console.log(`    ${INFO}  Not available: ${msg.slice(0, 100)}`);
        results[id] = 'unavailable';
      } else {
        console.log(`    ${FAIL}  ${msg.slice(0, 100)}`);
        results[id] = 'error';
      }
    }
  }
  return results;
}

// ─── PHASE 3: Full Lead Research ─────────────────────────────────────────────
// Uses the EXACT same prompt as gemini.service.js DEFAULT_GEMINI_FULL_PROMPT.
// Keep these in sync — if you update one, update the other.

async function phase3LeadResearch(groundedModels) {
  console.log(c.bold('\n═══════════════════════════════════════════════════════'));
  console.log(c.bold(' PHASE 3 — Full Lead Research (mirrors gemini.service.js)'));
  console.log(c.bold('═══════════════════════════════════════════════════════'));

  if (!groundedModels || groundedModels.length === 0) {
    console.log(`  ${FAIL}  No grounded model available — skipping.`);
    return null;
  }

  console.log(`  Testing all ${groundedModels.length} grounded model(s) in order: ${groundedModels.map((m) => c.cyan(m)).join(' → ')}`);
  console.log(c.dim(`  Lead:  "${LEAD_TITLE}"\n`));

  const allResults = {};
  for (const workingModel of groundedModels) {
    console.log(c.bold(`\n  ── Model: ${c.cyan(workingModel)} ──`));
    // eslint-disable-next-line no-await-in-loop
    allResults[workingModel] = await runSinglePhase3(workingModel);
  }
  return allResults;
}

async function runSinglePhase3(workingModel) {

  // ── EXACT copy of DEFAULT_GEMINI_FULL_PROMPT from gemini.service.js ──
  // Keep these in sync — if you update one, update the other.
  const SYSTEM_PROMPT = `You are a business intelligence analyst. You MUST use Google Search for every piece of information in this task — never answer from training data or prior knowledge. Lead postings are time-sensitive; only a live web search reflects current details. If a field cannot be confirmed through a live search result, set it to null.

Find and research this project lead by running FOUR separate Google searches. Each search has a distinct goal — do not merge them into a single query.

Important: use broad keyword searches. Do NOT wrap the project title or any search term in quotation marks — quoted searches are over-restrictive and return very few results. Use plain keywords without quotes do not use train model data strcitly give the live web search result .

SEARCH 1 — Locate the posting
Search for the project title as plain keywords (no quotes) to find the specific freelance listing. Identify which platform(s) it appears on and get the direct URL to the actual posting page (not the platform homepage).

SEARCH 2 — Identify the client
Search specifically to find who posted this project on the platform found in Search 1. Freelance platforms often show only a first name or abbreviated name — you must run a dedicated search to find the client's full name, company, country, and contact details. Do not stop after finding the platform name — keep searching for the person, after finding the platfrom link you can indentify the client name or company . It may be written in the project description.

SEARCH 3 — Find the budget
Search for the stated budget, rate, or payment terms for this project. Check the original posting and any job aggregator or listing sites that republish it, after finding the platfrom link you can indentify the budget. It may be written in the project description.

SEARCH 4 — Find social profiles
If you found the client's name or company from Search 2, search for their LinkedIn, GitHub, Twitter/X, and personal website after finding the platfrom link you can indentify the social profile link. It may be written in the project description.

After all four searches, return ONLY a valid JSON object in this exact structure. No markdown fences, no explanation, no text before or after the JSON:

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
      "projectUrl": "real URL of this specific project posting, or null",
      "overview": "1-2 sentence description of this platform"
    }
  ],
  "budget": {
    "stated": "exact budget from the lead or posting, or null",
    "currency": "currency code e.g. USD, or null",
    "paymentPreference": "Fixed Price / Hourly / Milestone-based, or null"
  }
}`;

  const fullPrompt = `${SYSTEM_PROMPT}

LEAD DATA:
Project Title: ${LEAD_TITLE}
Project Description: ${LEAD_DETAILS}
Client Contact: N/A
Attached Context: None

Use the LEAD DATA above to perform the search tasks. Return ONLY the valid JSON object in the exact structure specified above — no markdown, no explanation.`;

  const start = Date.now();
  try {
    const { text, candidate } = await callGemini({ model: workingModel, prompt: fullPrompt, useGrounding: true, timeoutMs: 90000 });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`  ${INFO} Response in ${elapsed}s | finishReason: ${candidate?.finishReason}`);
    console.log();
    await printGroundingMetadata(candidate, '  ');

    if (!text) {
      console.log(`\n  ${FAIL} Empty response`);
      return null;
    }

    // JSON extraction
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const start2 = stripped.indexOf('{');
    let depth = 0, inStr = false, esc = false, jsonStr = null;
    for (let i = start2; i < stripped.length; i++) {
      const ch = stripped[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { jsonStr = stripped.slice(start2, i + 1); break; } }
      }
    }

    if (!jsonStr) {
      console.log(`\n  ${FAIL} Could not extract JSON`);
      console.log(c.dim('  Raw text:'), text.slice(0, 500));
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    // Resolve any vertexaisearch proxy URLs inside the JSON — same as gemini.service.js does
    const hasProxy = JSON.stringify(parsed).includes('vertexaisearch.cloud.google.com');
    if (hasProxy) {
      console.log(`\n  ${INFO} Resolving proxy URLs in result…`);
      await resolveVertexAiUrls(parsed, true);
    }

    const groundingFired = Boolean(candidate?.groundingMetadata?.webSearchQueries?.length);
    console.log(`\n  ${PASS} JSON parsed  ${groundingFired ? c.green('(grounded — live web data)') : c.yellow('(no grounding — training data only)')}`);
    console.log('\n  ── Research Result ──');
    console.log(JSON.stringify(parsed, null, 4).split('\n').map((l) => '  ' + l).join('\n'));
    return parsed;
  } catch (err) {
    console.log(`  ${FAIL} Error: ${err.message}`);
    return null;
  }
}

// ─── PHASE 4: SDK Response Shape ─────────────────────────────────────────────

async function phase4ResponseShape() {
  console.log(c.bold('\n═══════════════════════════════════════════════════════'));
  console.log(c.bold(' PHASE 4 — SDK Response Shape (@google/genai v2)'));
  console.log(c.bold('═══════════════════════════════════════════════════════\n'));

  try {
    const { text, rawResponse, candidate } = await callGemini({
      model: 'gemini-2.5-flash', prompt: 'Say: hello', useGrounding: false, timeoutMs: 15000,
    });

    console.log(`  response.text (getter, not method): "${text}"`);
    console.log(`  typeof response.text:               ${typeof text}`);
    console.log(`  candidates[0].finishReason:         ${candidate?.finishReason}`);
    console.log(`  candidates[0].content.parts count:  ${candidate?.content?.parts?.length}`);
    console.log(`  candidates[0].groundingMetadata:    ${candidate?.groundingMetadata ? 'present' : c.dim('undefined (grounding was off)')}`);
    console.log(`\n  ${PASS} Shape confirmed`);
  } catch (err) {
    console.log(`  ${FAIL} ${err.message}`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(p1, p2) {
  console.log(c.bold('\n═══════════════════════════════════════════════════════'));
  console.log(c.bold(' SUMMARY'));
  console.log(c.bold('═══════════════════════════════════════════════════════\n'));

  MODELS.forEach(({ id, note }) => {
    const basic  = p1[id] ?? 'skipped';
    const search = p2[id] ?? 'skipped';
    const b = basic  === 'ok'       ? c.green('✓') : c.red('✗');
    const s = search === 'grounded' ? c.green('✓') : search === 'not_grounded' ? c.yellow('⚠') : c.red('✗');
    console.log(`  ${b}/${s}  ${c.cyan(id.padEnd(26))}  basic:${basic} | grounding:${search}  — ${note}`);
  });

  const working = Object.entries(p2).filter(([, v]) => v === 'grounded').map(([k]) => k);
  console.log(working.length > 0
    ? `\n  ${c.green('Models with confirmed grounding:')} ${working.join(', ')}`
    : `\n  ${c.red('No model returned grounded results.')}`
  );
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

(async () => {
  console.log(c.bold('\n╔═══════════════════════════════════════════════════════╗'));
  console.log(c.bold('║  Gemini Grounding Diagnostic — pre-sale-lead-backend  ║'));
  console.log(c.bold('╚═══════════════════════════════════════════════════════╝'));
  console.log(`\n  Key  : ${maskedKey}`);
  console.log(`  SDK  : @google/genai v2.x  (tool: googleSearch)`);
  console.log(`  Lead : "${LEAD_TITLE}"`);

  const p1 = await phase1BasicConnectivity();
  const p2 = await phase2GroundingCheck();

  const groundedModels = Object.entries(p2).filter(([, v]) => v === 'grounded').map(([k]) => k);
  await phase3LeadResearch(groundedModels);
  await phase4ResponseShape();
  printSummary(p1, p2);

  console.log(c.bold('\n  Done.\n'));
})();
