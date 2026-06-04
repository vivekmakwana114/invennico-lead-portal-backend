const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');

const getClient = () => new Anthropic({ apiKey: config.anthropic.apiKey });

const analyzeLead = async ({ title, details, source, notes, attachments, pdfContent }) => {
  const prompt = `You are a senior pre-sales consultant at Invennico TechnoLabs, a digital product development company.

Company context:
- Digital tech studio building web, mobile, SaaS, AI, and enterprise systems
- Strong in MERN, Next.js, React Native, Flutter, Node.js, PostgreSQL, AWS
- Clients range from startups to enterprise
- Focus on scalable, practical, production-ready solutions

Analyze the following lead and return ONLY a valid JSON object. No markdown, no explanation, no code fences.

INPUT:
Title: ${title || 'N/A'}
Source: ${source || 'N/A'}
Description: ${details || 'N/A'}
Internal Notes: ${notes || 'None'}
Attachments: ${attachments || 'None'}
PDF/Document Content: ${pdfContent ? `\n${pdfContent}` : 'None'}

OUTPUT (strict JSON only):
{
  "lead_summary": "Concise explanation of what the client wants",
  "qualification": {
    "score": 75,
    "label": "High Potential / Medium / Low",
    "reasoning": "Why this lead is good or risky"
  },
  "recommended_tech_stack": {
    "frontend": [],
    "backend": [],
    "database": [],
    "integrations": [],
    "hosting": []
  },
  "estimation": {
    "timeline": "Duration only, e.g. 4-6 months",
    "budget_range": "USD range e.g. $40,000 - $60,000",
    "breakdown": [
      { "phase": "Phase name", "timeline": "Duration", "cost_range": "USD range" }
    ]
  },
  "recommended_next_action": "What should we do next",
  "suggested_questions": ["Question 1", "Question 2"]
}

RULES:
- Be practical, not theoretical
- Do NOT oversell
- Keep estimates realistic based on industry standards
- Think like a CTO + sales strategist
- Return ONLY the JSON object`;

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  // Strip markdown code fences if model adds them despite instructions
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(jsonText);
};

const generateWhatsapp = async ({ leadSummary, techStack, timeline, budget, originalLead }) => {
  const prompt = `You are a pre-sales consultant writing a WhatsApp message to a potential client.

Write a professional, confident, and concise WhatsApp reply.

Tone:
- Friendly but professional
- Clear and structured
- Not too long
- No fluff

INPUT:

Lead Summary:
${leadSummary || 'N/A'}

Tech Stack:
${techStack || 'N/A'}

Timeline:
${timeline || 'N/A'}

Budget:
${budget || 'N/A'}

Additional Context:
${originalLead || 'N/A'}

---

OUTPUT:

Write a WhatsApp message that:
- Acknowledges the requirement
- Shows understanding
- Positions capability
- Mentions rough timeline and cost (if appropriate)
- Asks 3-5 smart questions
- Suggests a call

Do NOT include emojis unless natural.
Do NOT make it too long.
Do NOT sound robotic.`;

  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const message = response.content[0].type === 'text' ? response.content[0].text : '';
  return { message };
};

module.exports = { analyzeLead, generateWhatsapp };
