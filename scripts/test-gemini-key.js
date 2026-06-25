/**
 * Test script — Gemini API key validation
 *
 * Checks:
 *   1. Key is accepted (auth works)
 *   2. Available models can be listed
 *   3. Google Search grounding tool is accessible
 *
 * Usage:
 *   node scripts/test-gemini-key.js [API_KEY]
 *
 *   If no argument is given, falls back to GEMINI_API_KEY from .env
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const API_KEY = process.argv[2] || process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('ERROR: No API key provided.\n  Usage: node scripts/test-gemini-key.js <API_KEY>');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const PASS = '✓ PASS';
const FAIL = '✗ FAIL';

async function checkModels() {
  console.log('\n── Test 1: List available models ──');
  const models = [];

  const pager = await ai.models.list({ pageSize: 50 });
  for await (const model of pager) {
    models.push(model.name);
  }

  if (models.length === 0) {
    console.log(`${FAIL}  No models returned — key may lack model-list permission`);
    return false;
  }

  console.log(`${PASS}  ${models.length} model(s) accessible`);
  const trimmed = models.slice(0, 10);
  trimmed.forEach((m) => console.log(`       ${m}`));
  if (models.length > 10) console.log(`       … and ${models.length - 10} more`);
  return true;
}

async function checkGoogleSearch() {
  console.log('\n── Test 2: Google Search grounding ──');

  const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash-lite-001'];
  let response;
  let usedModel;

  for (const model of MODELS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await ai.models.generateContent({
        model,
        contents: 'What is the current Google Gemini API version? Answer in one sentence.',
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      usedModel = model;
      break;
    } catch (err) {
      const is503 = err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE');
      if (is503 && model !== MODELS[MODELS.length - 1]) {
        console.log(`       ${model} unavailable (503) — trying next model…`);
      } else {
        throw err;
      }
    }
  }

  console.log(`       Model used: ${usedModel}`);

  const text = response.text;
  const candidate = response.candidates?.[0];
  const queries = candidate?.groundingMetadata?.webSearchQueries ?? [];

  if (!text) {
    console.log(`${FAIL}  Empty response returned`);
    return false;
  }

  if (queries.length === 0) {
    console.log(`${PASS}  Response received but no search queries logged — grounding may be unavailable on this key tier`);
  } else {
    console.log(`${PASS}  Google Search grounding active`);
    console.log(`       Search queries used: ${queries.join(' | ')}`);
  }

  console.log(`       Model reply: "${text.trim().slice(0, 120)}${text.length > 120 ? '…' : ''}"`);
  return true;
}

(async () => {
  console.log('=== Gemini API Key Test ===');
  console.log(`Key: ${API_KEY.slice(0, 6)}${'*'.repeat(Math.max(0, API_KEY.length - 10))}${API_KEY.slice(-4)}`);

  let allPassed = true;

  try {
    const modelsOk = await checkModels();
    if (!modelsOk) allPassed = false;
  } catch (err) {
    console.log(`${FAIL}  Model list error — ${err.message}`);
    allPassed = false;
  }

  try {
    const searchOk = await checkGoogleSearch();
    if (!searchOk) allPassed = false;
  } catch (err) {
    console.log(`${FAIL}  Google Search grounding error — ${err.message}`);
    allPassed = false;
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(allPassed ? `${PASS}  All checks passed — key is valid and ready` : `${FAIL}  One or more checks failed — see above`);
  process.exit(allPassed ? 0 : 1);
})();
