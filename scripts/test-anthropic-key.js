/**
 * Test script — Anthropic Claude API key validation
 *
 * Checks:
 *   1. Key is accepted (auth works)
 *   2. Available models can be listed
 *   3. A message completion can be generated (tool use capable)
 *
 * Usage:
 *   node scripts/test-anthropic-key.js [API_KEY]
 *
 *   If no argument is given, falls back to ANTHROPIC_API_KEY from .env
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const API_KEY = process.argv[2] || process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('ERROR: No API key provided.\n  Usage: node scripts/test-anthropic-key.js <API_KEY>');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

const PASS = '✓ PASS';
const FAIL = '✗ FAIL';

async function checkModels() {
  console.log('\n── Test 1: List available models ──');
  const models = [];

  const page = await client.models.list({ limit: 100 });
  for await (const model of page) {
    models.push(model.id);
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

async function checkCompletion() {
  console.log('\n── Test 2: Message completion with tool use ──');

  const MODELS = ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-latest'];
  let response;
  let usedModel;

  for (const model of MODELS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await client.messages.create({
        model,
        max_tokens: 256,
        tools: [
          {
            name: 'get_lead_info',
            description: 'Returns basic info about a project lead',
            input_schema: {
              type: 'object',
              properties: {
                company: { type: 'string', description: 'Company name' },
                budget: { type: 'string', description: 'Estimated budget' },
              },
              required: ['company', 'budget'],
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: 'Extract lead info: Acme Corp wants a mobile app, budget around $50,000. Use the get_lead_info tool.',
          },
        ],
      });
      usedModel = model;
      break;
    } catch (err) {
      const isUnavailable = err?.status === 529 || err?.status === 503 || err?.message?.includes('overloaded');
      if (isUnavailable && model !== MODELS[MODELS.length - 1]) {
        console.log(`       ${model} overloaded — trying next model…`);
      } else {
        throw err;
      }
    }
  }

  console.log(`       Model used: ${usedModel}`);

  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
  const textBlock = response.content.find((b) => b.type === 'text');

  if (!response.content.length) {
    console.log(`${FAIL}  Empty response returned`);
    return false;
  }

  if (toolUseBlock) {
    console.log(`${PASS}  Tool use working — tool called: ${toolUseBlock.name}`);
    console.log(`       Input: ${JSON.stringify(toolUseBlock.input)}`);
  } else if (textBlock) {
    console.log(`${PASS}  Completion working (model replied with text instead of tool call)`);
    console.log(`       Reply: "${textBlock.text.trim().slice(0, 120)}${textBlock.text.length > 120 ? '…' : ''}"`);
  }

  console.log(`       Stop reason: ${response.stop_reason} | Input tokens: ${response.usage.input_tokens} | Output tokens: ${response.usage.output_tokens}`);
  return true;
}

(async () => {
  console.log('=== Anthropic Claude API Key Test ===');
  console.log(`Key: ${API_KEY.slice(0, 10)}${'*'.repeat(Math.max(0, API_KEY.length - 14))}${API_KEY.slice(-4)}`);

  let allPassed = true;

  try {
    const modelsOk = await checkModels();
    if (!modelsOk) allPassed = false;
  } catch (err) {
    console.log(`${FAIL}  Model list error — ${err.message}`);
    allPassed = false;
  }

  try {
    const completionOk = await checkCompletion();
    if (!completionOk) allPassed = false;
  } catch (err) {
    console.log(`${FAIL}  Completion error — ${err.message}`);
    allPassed = false;
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(allPassed ? `${PASS}  All checks passed — key is valid and ready` : `${FAIL}  One or more checks failed — see above`);
  process.exit(allPassed ? 0 : 1);
})();
