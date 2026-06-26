const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const logger = require('../config/logger');
const { Settings } = require('../models');

// Follow a single redirect and return the Location header URL.
// Used to resolve vertexaisearch.cloud.google.com proxy URLs to the real platform URL.
// WHY: Gemini's grounding system returns proxy URLs for citations. The real URLs
//      live one HTTP redirect away in the Location header.
const followRedirect = (url) =>
  new Promise((resolve) => {
    if (!url || !url.startsWith('https://vertexaisearch.cloud.google.com')) {
      resolve(url);
      return;
    }
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      resolve(res.headers.location || url);
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(url);
    });
    req.on('error', () => resolve(url));
    req.end();
  });

// Walk every string value in obj and resolve any vertexaisearch redirect URLs in-place.
const resolveVertexAiUrls = async (obj) => {
  if (!obj || typeof obj !== 'object') return;
  await Promise.all(
    Object.entries(obj).map(async ([key, val]) => {
      if (typeof val === 'string' && val.startsWith('https://vertexaisearch.cloud.google.com')) {
        const resolved = await followRedirect(val);
        if (resolved !== val) {
          logger.info('[Gemini Research] Resolved proxy URL → %s', resolved);
        } else {
          logger.warn(
            '[Gemini Research] Proxy URL could not be resolved (expired or no Location header) — setting null: %s',
            val.slice(0, 80)
          );
          // eslint-disable-next-line no-param-reassign
          obj[key] = null;
          return;
        }
        // eslint-disable-next-line no-param-reassign
        obj[key] = resolved;
      } else if (val && typeof val === 'object') {
        await resolveVertexAiUrls(val);
      }
    })
  );
};

const getClient = () => new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Full prompt sent to Gemini for lead research. Customisable via Settings → AI Prompts.
// Only the LEAD DATA block (title, details, contact…) is appended at runtime.
// KEEP IN SYNC WITH scripts/lead-testing-testing.js SYSTEM_PROMPT.
const DEFAULT_GEMINI_FULL_PROMPT = `Find this project lead on the internet using Google Search and return the result as JSON.

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

// Model fallback chain — tried in order until one succeeds.
// gemini-2.5-flash:      primary — fastest, reliable grounding
// gemini-2.5-flash-lite: second — slightly lighter, still grounds well
// gemini-2.5-pro:        third — most thorough (runs the most queries), slower
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  // 'gemini-3.1-flash-lite', — never uses grounding (always returns training data only)
  // 'gemini-3.5-flash',      — consistently 503, excluded
];

// How long to wait for a single generateContent call before giving up (ms).
const GEMINI_TIMEOUT_MS = 90000;

const researchLead = async ({ title, details, pdfContent }) => {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  logger.debug(
    '[Gemini Research] Input received — title: %d chars | details: %d chars | pdfContent: %s',
    (title || '').length,
    (details || '').length,
    pdfContent ? `${pdfContent.length} chars` : 'none'
  );

  const ai = getClient();

  const geminiSettings = await Settings.findById('global').lean();
  const customGemini = geminiSettings?.aiPrompts?.geminiResearch?.trim();
  const fullGeminiPrompt = customGemini || DEFAULT_GEMINI_FULL_PROMPT;
  logger.info('[Gemini Research] Prompt source: %s', customGemini ? 'SETTING (custom)' : 'DEFAULT (code level)');

  // Google Search grounding is always enabled — it is the entire purpose of this service.
  // Both gemini-2.5-flash and gemini-2.5-flash-lite support the googleSearch tool.
  const requestConfig = { tools: [{ googleSearch: {} }] };

  // Normalize whitespace before inserting into the prompt.
  // Title: collapse all internal whitespace to a single space — it becomes the search query,
  //        so extra spaces or newlines make it less precise.
  // Details: trim only — internal newlines are meaningful structure from the original posting.
  const cleanTitle = (title || '').replace(/\s+/g, ' ').trim() || 'N/A';
  const cleanDetails = (details || '').trim() || 'N/A';
  const pdfSnippet = pdfContent ? pdfContent.slice(0, 8000) + (pdfContent.length > 8000 ? '\n[…truncated]' : '') : null;

  const prompt = `${fullGeminiPrompt}

LEAD DATA:
Project Title: ${cleanTitle}
Project Description:
${cleanDetails}
${pdfSnippet ? `\nPDF Content:\n${pdfSnippet}` : ''}
Use the LEAD DATA above to search. Return ONLY the valid JSON object — no markdown, no explanation.`;

  logger.debug(
    '[Gemini Research] → models: %s | lead: "%s" | prompt: %d chars (system: %d | title: %d | details: %d | pdf: %d) | grounding: googleSearch ON | timeout: %dms',
    GEMINI_MODELS.join(' → '),
    cleanTitle,
    prompt.length,
    fullGeminiPrompt.length,
    (title || '').length,
    (details || '').length,
    pdfSnippet ? pdfSnippet.length : 0,
    GEMINI_TIMEOUT_MS
  );

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Helper: single attempt with a hard timeout so a stalled API call never
  // blocks the Node.js event loop indefinitely.
  const callWithTimeout = (model) => {
    const apiCall = ai.models.generateContent({ model, contents: prompt, config: requestConfig });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)), GEMINI_TIMEOUT_MS)
    );
    return Promise.race([apiCall, timeout]);
  };

  let response;
  const MAX_ATTEMPTS_PER_MODEL = 3;

  // Try each model in order. Move to the next model if the current one returns
  // a permanent error (404 = deprecated, 400 = unsupported feature).
  // Retry the same model on transient errors (503, 429).
  for (let mi = 0; mi < GEMINI_MODELS.length; mi += 1) {
    const model = GEMINI_MODELS[mi];
    let modelSucceeded = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        response = await callWithTimeout(model);
        if (response.text) {
          modelSucceeded = true;
          logger.info('[Gemini Research] Model %s succeeded on attempt %d', model, attempt);
          break;
        }
        logger.warn('[Gemini Research] %s attempt %d returned empty text — retrying…', model, attempt);
      } catch (err) {
        const msg = err?.message || '';
        const isPermanent =
          msg.includes('404') ||
          msg.includes('NOT_FOUND') ||
          msg.includes('400') ||
          msg.includes('INVALID_ARGUMENT') ||
          msg.includes('timed out');
        const isRetryable =
          msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');

        if (isPermanent) {
          logger.warn('[Gemini Research] %s permanent error — skipping to next model: %s', model, msg.slice(0, 120));
          break;
        }
        if (isRetryable) {
          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            const delay = attempt * 4000;
            logger.warn('[Gemini Research] %s attempt %d failed (503/429) — retrying in %dms…', model, attempt, delay);
            // eslint-disable-next-line no-await-in-loop
            await sleep(delay);
          } else {
            // All retries exhausted for this model — move to the next one instead of throwing.
            // 503 is transient high-demand, not a code error; the next model may be available.
            logger.warn(
              '[Gemini Research] %s all %d attempts hit 503/429 — skipping to next model',
              model,
              MAX_ATTEMPTS_PER_MODEL
            );
            break;
          }
        } else {
          throw err;
        }
      }
    }
    if (modelSucceeded) break;
  }

  const rawText = response && response.text;

  // Verify that Google Search grounding was actually invoked.
  // If it was not fired, the data comes from the model's training set (potentially
  // fabricated). We log clearly and flag the result so callers can decide
  // whether to surface this as an error or a degraded result.
  const candidate = response && response.candidates?.[0];
  const groundingMeta = candidate?.groundingMetadata;
  const groundingFired = Boolean(groundingMeta?.webSearchQueries?.length);

  if (groundingFired) {
    logger.info(
      '[Gemini Research] ✓ Google Search used — queries: %s | chunks: %d',
      groundingMeta.webSearchQueries.join(' | '),
      groundingMeta.groundingChunks?.length ?? 0
    );
  } else {
    logger.warn(
      '[Gemini Research] ✗ Google Search NOT used — response has no webSearchQueries. ' +
        'API key may lack grounding permission or billing is inactive. ' +
        'Result may contain fabricated data.'
    );
  }

  logger.debug(
    '[Gemini Research] ← response: %d chars | finishReason: %s | snippet: %s',
    rawText?.length ?? 0,
    candidate?.finishReason ?? 'unknown',
    rawText ? rawText.slice(0, 200).replace(/\n/g, ' ') : '(empty)'
  );

  if (!rawText) {
    throw new Error(`Gemini returned empty response (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  }

  // Strip markdown fences then extract JSON using brace balancing —
  // guards against extra trailing braces or text Gemini may append.
  const stripped = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const extractJson = (text) => {
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escape) {
        escape = false;
      } else if (ch === '\\' && inString) {
        escape = true;
      } else if (ch === '"') {
        inString = !inString;
      } else if (!inString) {
        if (ch === '{') {
          depth += 1;
        } else if (ch === '}') {
          depth -= 1;
          if (depth === 0) return text.slice(start, i + 1);
        }
      }
    }
    return null;
  };

  const jsonStr = extractJson(stripped);
  if (!jsonStr) throw new Error('Gemini returned no parseable JSON');

  const parsed = JSON.parse(jsonStr);

  // Resolve any vertexaisearch.cloud.google.com proxy URLs the model may have returned
  // despite the prompt instruction. The prompt is the first line of defence; this is the
  // safety net for edge cases or future model behaviour changes.
  await resolveVertexAiUrls(parsed);

  logger.info(
    '[Gemini Research] ✓ Parsed | client: %s | platforms: %d | groundingFired: %s',
    parsed.client?.company ?? parsed.client?.name ?? 'unknown',
    parsed.platforms?.length ?? 0,
    groundingFired
  );

  // groundingFired = true  → data came from live Google Search (trustworthy)
  // groundingFired = false → data came from model training data (treat as best-effort)
  return { ...parsed, groundingFired };
};

module.exports = { researchLead };
