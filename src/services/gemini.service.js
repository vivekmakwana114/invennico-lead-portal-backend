const { GoogleGenAI } = require('@google/genai');
const config = require('../config/config');
const logger = require('../config/logger');

const getClient = () => new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Research a lead using Gemini.
 * Model: gemini-2.5-flash-lite — works on free-tier quota and supports googleSearch grounding.
 * Grounding is only enabled when GEMINI_SEARCH_GROUNDING=true in env AND billing is active on
 * the Google AI project. Without grounding, Gemini uses its training knowledge (still excellent
 * for platform context, industry patterns, and budget norms).
 */
const researchLead = async ({ title, details, source, notes, clientContact, pdfContent }) => {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = getClient();
  const useGrounding = process.env.GEMINI_SEARCH_GROUNDING === 'true';

  logger.debug(
    '[Gemini Research] Grounding %s',
    useGrounding ? 'ENABLED (live web search)' : 'DISABLED (training knowledge only)'
  );

  const requestConfig = {};
  if (useGrounding) {
    requestConfig.tools = [{ googleSearch: {} }];
  }

  // Cap pdfContent at 3000 chars — Gemini only needs context for web research;
  // overly long prompts with grounding enabled can cause empty responses.
  const pdfSnippet = pdfContent ? pdfContent.slice(0, 3000) + (pdfContent.length > 3000 ? '\n[…truncated]' : '') : null;

  const prompt = `You are a business intelligence analyst at a software development company. Research and analyze the following lead inquiry.

Use Google Search to find publicly available information about the client and their business where possible. Then combine what you find with the lead data below to produce a structured research report.

LEAD DATA:
Project Title: ${title || 'N/A'}
Source Platform: ${source || 'N/A'}
Client Contact: ${clientContact || 'N/A'}
Project Description: ${details || 'N/A'}
Internal Notes: ${notes || 'None'}
Attached Document Content: ${pdfSnippet || 'None'}

RESEARCH TASKS:
1. Identify and research the client's business — company name, industry, size, location, and what they do
2. Understand the context of the platform (${source}) — typical project types, budget norms, client quality signals
3. Determine the project phase and decision-making urgency
4. Extract budget signals (stated amounts, implied budget, payment preferences)
5. Extract core project requirements — key features, technical needs, integrations, and target platforms
6. Generate 3–5 sharp business intelligence insights about this lead

Return ONLY a valid JSON object matching this exact structure. No markdown, no explanation:

{
  "client": {
    "name": "person or company name, or null if unknown",
    "company": "company name, or null",
    "location": "city/country, or null",
    "industry": "industry/sector, or null",
    "companySize": "e.g. Startup / SME / Enterprise, or null",
    "businessDescription": "2–3 sentence description of what the client does"
  },
  "platform": {
    "source": "full platform name e.g. Upwork, Freelancer.com, Direct",
    "postingContext": "context about the type of project typically posted here and what this posting implies",
    "urgencyLevel": "High / Medium / Low",
    "typicalBudgetRange": "what budgets projects like this typically command on this platform"
  },
  "projectStatus": {
    "phase": "e.g. Exploring Vendors / Actively Sourcing / Ready to Hire",
    "decisionTimeline": "how quickly they likely need to decide, or null",
    "competitiveLandscape": "who they are likely also talking to / comparing against"
  },
  "budget": {
    "stated": "exact budget mentioned in the lead, or null",
    "estimatedRange": "realistic budget range based on requirements and platform context",
    "currency": "e.g. USD",
    "paymentPreference": "e.g. Fixed Price / Hourly / Milestone-based, or null"
  },
  "coreRequirements": {
    "summary": "2–3 sentence summary of what needs to be built",
    "features": ["key feature 1", "key feature 2", "key feature 3"],
    "technicalConstraints": ["constraint 1", "constraint 2"],
    "integrations": ["third-party integration 1", "integration 2"],
    "platforms": ["Web", "Mobile", "etc."]
  },
  "researchInsights": [
    "Insight 1 — sharp, specific, actionable",
    "Insight 2",
    "Insight 3"
  ]
}

RULES:
- Draw facts from the lead data; use web research to enrich client and platform context
- If a field cannot be determined, use null (for strings) or [] (for arrays)
- Keep all string values concise — no bullet points inside strings
- Return ONLY the JSON object`;

  logger.debug('[Gemini Research] Calling gemini-2.5-flash-lite for lead: %s', title);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: requestConfig,
  });

  // New SDK: response.text is a direct property that correctly handles grounding
  // metadata parts alongside text parts — no manual part extraction needed.
  const rawText = response.text;

  logger.debug('[Gemini Research] Raw response (%d chars):\n%s', rawText?.length ?? 0, rawText);

  if (!rawText) {
    const candidate = response.candidates?.[0];
    throw new Error(`Gemini returned empty response (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
  }

  // Strip markdown fences if present, then find the JSON object
  const stripped = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini returned no parseable JSON');

  const parsed = JSON.parse(jsonMatch[0]);

  logger.debug(
    '[Gemini Research] Parsed successfully — client: %s, insights: %d',
    parsed.client?.company,
    parsed.researchInsights?.length
  );

  return parsed;
};

module.exports = { researchLead };
