const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const logger = require('../config/logger');
const { Settings } = require('../models');

const getClient = () => new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Full prompt sent to Gemini for lead research. Customisable via Settings → AI Prompts.
// Only the LEAD DATA block (title, details, contact…) is appended at runtime.
const DEFAULT_GEMINI_FULL_PROMPT = `You are a business intelligence analyst at a software development company. Use Google Search to find factual, publicly available information about project leads. Only report what you actually find in search results — use null for anything you cannot confirm. Never guess or fabricate platform names, URLs, or client details.

Find and research the public posting for this project lead using Google Search.

SEARCH TASKS:
1. Search for the exact project title. Identify the client — their full name, contact details, and social media profiles (LinkedIn, GitHub, Twitter/X, personal website).
2. Find which platform(s) this specific project was posted on. Only include a platform if you found a real search result showing this exact project there — no guessing.
3. For projectUrl: only include the URL if it appears directly in your search results — never construct or guess a URL.
4. Extract the stated budget, currency, and payment preference from the lead description or the posting.

After completing your research, return ONLY a valid JSON object in this exact structure. No markdown fences, no explanation, no text before or after the JSON:

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

const GEMINI_MODEL = 'gemini-2.5-flash';

const researchLead = async ({ title, details, clientContact, pdfContent }) => {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  logger.info(
    '[Gemini Research] Input received — title: %d chars | details: %d chars | clientContact: %s | pdfContent: %s',
    (title || '').length,
    (details || '').length,
    clientContact ? `"${clientContact}"` : 'null',
    pdfContent ? `${pdfContent.length} chars` : 'null (no PDF or extraction returned empty)'
  );

  const ai = getClient();

  const geminiSettings = await Settings.findById('global').lean();
  const customGemini = geminiSettings?.aiPrompts?.geminiResearch?.trim();
  const fullGeminiPrompt = customGemini || DEFAULT_GEMINI_FULL_PROMPT;
  logger.info('[Gemini Research] Prompt source: %s', customGemini ? 'SETTING (custom)' : 'DEFAULT (code level)');

  // Google Search grounding is always on — it is the entire purpose of this service.
  // gemini-2.0-flash is required; gemini-2.5-flash-lite does not support the googleSearch tool.
  const requestConfig = { tools: [{ googleSearch: {} }] };

  const pdfSnippet = pdfContent ? pdfContent.slice(0, 8000) + (pdfContent.length > 8000 ? '\n[…truncated]' : '') : null;

  const prompt = `${fullGeminiPrompt}

LEAD DATA:
Project Title: ${title || 'N/A'}
Project Description: ${details || 'N/A'}
Client Contact: ${clientContact || 'N/A'}
Attached Context: ${pdfSnippet || 'None'}

Use the LEAD DATA above to perform the search tasks. Return ONLY the valid JSON object in the exact structure specified above — no markdown, no explanation.`;

  logger.info(
    '[Gemini Research] → model: %s | prompt: %d chars (system: %d | title: %d | details: %d | pdf: %d) | grounding: googleSearch ON',
    GEMINI_MODEL,
    prompt.length,
    fullGeminiPrompt.length,
    (title || '').length,
    (details || '').length,
    pdfSnippet ? pdfSnippet.length : 0
  );

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let response;
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: requestConfig,
      });
      if (response.text) break;
      logger.warn('[Gemini Research] Attempt %d returned empty — retrying…', attempt);
    } catch (err) {
      const msg = err?.message || '';
      const isRetryable =
        msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      if (isRetryable && attempt < MAX_ATTEMPTS) {
        const delay = attempt * 4000;
        logger.warn('[Gemini Research] Attempt %d failed (%s) — retrying in %dms…', attempt, msg.slice(0, 80), delay);
        // eslint-disable-next-line no-await-in-loop
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }

  const rawText = response.text;

  // Log whether Google Search grounding was actually invoked
  const candidate = response.candidates?.[0];
  const groundingMeta = candidate?.groundingMetadata;
  if (groundingMeta?.webSearchQueries?.length) {
    logger.info('[Gemini Research] ✓ Google Search used — queries: %s', groundingMeta.webSearchQueries.join(' | '));
  } else {
    logger.warn(
      '[Gemini Research] ✗ Google Search NOT used — response has no webSearchQueries. API key may lack grounding permission or billing is inactive.'
    );
  }

  logger.info(
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

  logger.debug(
    '[Gemini Research] Parsed successfully — client: %s, platforms found: %d',
    parsed.client?.company ?? parsed.client?.name,
    parsed.platforms?.length ?? 0
  );

  return parsed;
};

module.exports = { researchLead };
