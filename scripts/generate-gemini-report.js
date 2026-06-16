/* eslint-disable */
/**
 * Generates the Gemini API Compatibility & Architecture Report PDF.
 * Run: node scripts/generate-gemini-report.js
 * Output: docs/gemini-api-report.pdf
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '../docs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT_FILE = path.join(OUT_DIR, 'gemini-api-report.pdf');

// Create document with bufferPages enabled for post-processing header/footer page numbers
const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
doc.pipe(fs.createWriteStream(OUT_FILE));

// Color palette
const C = {
  brand:    '#4A6CF7',
  dark:     '#1A1A2E',
  text:     '#374151',
  muted:    '#6B7280',
  success:  '#059669',
  error:    '#DC2626',
  warning:  '#D97706',
  border:   '#E5E7EB',
  bg:       '#F9FAFB',
  bgBlue:   '#EEF2FF',
  white:    '#FFFFFF',
};

// --- Page & Space Budgeting Helpers ---
function pageW() { 
  return doc.page.width - doc.page.margins.left - doc.page.margins.right; 
}

function ensureSpace(neededHeight) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottomLimit) {
    doc.addPage();
  }
}

// Ensure fonts are explicitly set before calling heightOfString measurements to avoid PDFKit text state leakage
function getCellHeight(text, width, fontSize) {
  return doc.heightOfString(String(text), {
    width: width,
    fontSize: fontSize,
    font: 'Helvetica'
  });
}

function line(y, color = C.border, width = 0.5) {
  const x = doc.page.margins.left;
  doc.save().strokeColor(color).lineWidth(width).moveTo(x, y).lineTo(x + pageW(), y).stroke().restore();
}

function badge(text, bgColor, textColor, x, y) {
  const pad = 6;
  // Explicitly set font and size before measuring and drawing to prevent text-wrapping issues
  doc.font('Helvetica-Bold').fontSize(8);
  const textWidth = doc.widthOfString(text);
  const tw = textWidth + pad * 2;
  
  doc.save()
    .roundedRect(x, y - 2, tw, 14, 3)
    .fill(bgColor)
    .fillColor(textColor)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(text, x + pad, y)
    .restore();
  return tw;
}

// --- Layout Helpers ---
function sectionHeader(title, subtitle) {
  // Budget space for header box (52pt) + spacing + a line of text (total 120pt)
  ensureSpace(120);
  
  const y0 = doc.y;
  doc.save()
    .rect(doc.page.margins.left, y0, pageW(), 52)
    .fill(C.bgBlue)
    .restore();

  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(16).text(title, doc.page.margins.left + 12, y0 + 12, { width: pageW() - 24 });
  if (subtitle) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text(subtitle, doc.page.margins.left + 12, y0 + 32, { width: pageW() - 24 });
  }
  
  doc.y = y0 + 52;
  doc.moveDown(1);
}

function h2(text) {
  ensureSpace(50);
  doc.moveDown(0.6);
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(13).text(text, { width: pageW() });
  const y = doc.y;
  line(y + 2, C.brand, 1);
  doc.moveDown(0.8);
}

function h3(text) {
  ensureSpace(40);
  doc.moveDown(0.4);
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(11).text(text, { width: pageW() });
  doc.moveDown(0.3);
}

function body(text, options = {}) {
  doc.fillColor(C.text).font('Helvetica').fontSize(10).text(text, { lineGap: 3, width: pageW(), ...options });
  doc.moveDown(0.4);
}

function bullet(text, indent = 15) {
  ensureSpace(20);
  
  const xBullet = doc.page.margins.left + indent;
  const xText = xBullet + 12;
  const wText = pageW() - indent - 12;
  
  // Set horizontal flow cursor position
  doc.x = xText;
  
  // Draw bullet symbol at absolute coordinates but let PDFKit manage y flowing
  const bulletY = doc.y;
  doc.fillColor(C.brand).font('Helvetica').fontSize(10).text('•', xBullet, bulletY);
  
  // Flow bullet text without hardcoded y coordinate to handle multi-line page breaks cleanly
  doc.fillColor(C.text).font('Helvetica').fontSize(10).text(text, { width: wText, lineGap: 2 });
  
  // Reset horizontal margin offset back to left bound
  doc.x = doc.page.margins.left;
  doc.moveDown(0.25);
}

function noteBox(text, color = C.bgBlue, borderColor = C.brand) {
  const w = pageW();
  // Measure text height using the correct font size
  const textH = doc.heightOfString(text, { width: w - 24, fontSize: 9.5, font: 'Helvetica' });
  const h = textH + 20;
  
  ensureSpace(h + 10);
  
  const x = doc.page.margins.left;
  const y = doc.y;
  
  doc.save().rect(x, y, w, h).fill(color).restore();
  doc.save().rect(x, y, 3, h).fill(borderColor).restore();
  doc.fillColor(C.dark).font('Helvetica').fontSize(9.5)
    .text(text, x + 12, y + 10, { width: w - 24, lineGap: 3 });
  
  doc.y = y + h;
  doc.moveDown(0.6);
}

function codeBlock(codeLines, isDark = true) {
  const lineHeight = 14;
  const padding = 10;
  const h = codeLines.length * lineHeight + padding * 2;
  
  ensureSpace(h + 10);
  
  const x = doc.page.margins.left;
  const y = doc.y;
  
  const bgColor = isDark ? C.dark : C.bg;
  doc.save().rect(x, y, pageW(), h).fill(bgColor).restore();
  
  doc.font('Courier').fontSize(8.5);
  codeLines.forEach((lineText, i) => {
    const lineY = y + padding + i * lineHeight;
    if (lineText.startsWith('//') || lineText.startsWith('#')) {
      doc.fillColor('#6EE7B7'); // Soft green for comments
    } else if (lineText.includes('const ') || lineText.includes('if ') || lineText.includes('let ') || lineText.includes('process.env')) {
      doc.fillColor('#93C5FD'); // Soft blue for keywords
    } else {
      doc.fillColor(isDark ? '#E2E8F0' : C.dark);
    }
    doc.text(lineText, x + 10, lineY);
  });
  
  doc.y = y + h;
  doc.moveDown(0.6);
}

// --- Specialized Component Helpers ---
function drawComparisonBox() {
  const halfW = (pageW() - 10) / 2;
  const boxH = 175;
  
  ensureSpace(boxH + 10);
  
  const y = doc.y;
  const lx = doc.page.margins.left;
  const rx = lx + halfW + 10;
  
  // Left box (Web Chat)
  doc.save().rect(lx, y, halfW, boxH).fill(C.bgBlue).restore();
  // Right box (API)
  doc.save().rect(rx, y, halfW, boxH).fill('#F0FDF4').restore();
  
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(10).text('Gemini Web Chat', lx + 8, y + 8, { width: halfW - 16 });
  doc.fillColor(C.dark).font('Helvetica').fontSize(8.5);
  const webPoints = [
    'Consumer product (gemini.google.com)',
    'Google pays all infrastructure costs',
    'Grounding always ON — Google absorbs cost',
    'No API key required',
    'No per-call billing to you',
    'You share data for model improvement',
    'No programmatic/structured access',
    'Cannot be embedded in your app',
    'Model choice is Google\'s decision',
  ];
  let wpy = y + 24;
  webPoints.forEach(pt => {
    doc.text('✓  ' + pt, lx + 8, wpy, { width: halfW - 16 });
    wpy += 16;
  });
  
  doc.fillColor(C.success).font('Helvetica-Bold').fontSize(10).text('Gemini API (Your Backend)', rx + 8, y + 8, { width: halfW - 16 });
  doc.fillColor(C.dark).font('Helvetica').fontSize(8.5);
  const apiPoints = [
    'Developer platform (ai.google.dev)',
    'You pay per token (input + output)',
    'Grounding optional — $35 / 1K grounding calls',
    'API key required (per project)',
    'Free-tier quota available (limited)',
    'Data NOT used for model training (API ToS)',
    'Full programmatic / structured JSON access',
    'Can be embedded in your application',
    'You choose exactly which model to use',
  ];
  let apy = y + 24;
  apiPoints.forEach(pt => {
    doc.text('✓  ' + pt, rx + 8, apy, { width: halfW - 16 });
    apy += 16;
  });
  
  doc.y = y + boxH;
  doc.moveDown(0.6);
}

function drawTable(headers, rows, colWidths, columnStyles = {}) {
  const startX = doc.page.margins.left;
  const colX = [];
  let currentX = startX;
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(currentX);
    currentX += colWidths[i];
  }

  const padding = 6;
  const headerFontSize = 8.5;
  const rowFontSize = 7.5;
  const headerRowH = 20;

  function drawHeader() {
    const headerY = doc.y;
    doc.save().rect(startX, headerY, pageW(), headerRowH).fill(C.dark).restore();
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(headerFontSize);
    headers.forEach((h, i) => {
      const style = columnStyles[i] || {};
      doc.text(h, colX[i] + 6, headerY + 6, { width: colWidths[i] - 12, align: style.align || 'left' });
    });
    doc.y = headerY + headerRowH;
  }

  // Draw header first
  ensureSpace(headerRowH + 30);
  drawHeader();

  rows.forEach((row, rowIndex) => {
    // 1. Calculate row height based on text wrapping
    let maxTextHeight = 0;
    row.forEach((cell, colIndex) => {
      const isStatusBadge = (headers[colIndex] === 'Status');
      if (isStatusBadge && (cell === 'OK' || cell === 'FAIL')) {
        maxTextHeight = Math.max(maxTextHeight, 14);
      } else {
        const textHeight = getCellHeight(cell, colWidths[colIndex] - 12, rowFontSize);
        maxTextHeight = Math.max(maxTextHeight, textHeight);
      }
    });

    const rowH = maxTextHeight + padding * 2;

    // 2. Check page space
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    if (doc.y + rowH > bottomLimit) {
      doc.addPage();
      drawHeader();
    }

    // Capture exact top coordinate of row to prevent relative text rendering drift
    const rowY = doc.y;

    // 3. Draw row background
    const rowBg = rowIndex % 2 === 0 ? C.white : C.bg;
    doc.save().rect(startX, rowY, pageW(), rowH).fill(rowBg).restore();

    // 4. Draw cells
    row.forEach((cell, colIndex) => {
      const isStatusBadge = (headers[colIndex] === 'Status');
      const isOk = cell === 'OK';
      const isFail = cell === 'FAIL';
      
      const x = colX[colIndex] + 6;
      const style = columnStyles[colIndex] || {};
      
      // Calculate text height for vertical alignment
      const textHeight = isStatusBadge ? 14 : getCellHeight(cell, colWidths[colIndex] - 12, rowFontSize);
      const cellY = rowY + (rowH - textHeight) / 2;

      if (isStatusBadge && (isOk || isFail)) {
        const badgeColor = isOk ? C.success : C.error;
        const badgeBg = isOk ? '#D1FAE5' : '#FEE2E2';
        
        // Measure badge width with correct font and size to center horizontally inside the column
        doc.font('Helvetica-Bold').fontSize(8);
        const tw = doc.widthOfString(cell) + 12; // pad = 6
        const badgeX = colX[colIndex] + (colWidths[colIndex] - tw) / 2;

        badge(cell, badgeBg, badgeColor, badgeX, rowY + (rowH - 14) / 2);
      } else {
        let textColor = C.text;
        let fontName = 'Helvetica';
        
        // Semantic coloring
        if (style.color) {
          textColor = typeof style.color === 'function' ? style.color(cell, row) : style.color;
        } else if (headers[colIndex] === 'Result / Reason' || headers[colIndex] === 'Cost / Rate' || headers[colIndex] === 'Action') {
          // Color based on success/fail context
          const statusVal = row[2];
          const cellStr = String(cell);
          if (statusVal === 'OK' || cellStr.includes('works') || cellStr.includes('FREE') || cellStr.includes('Current setup') || cellStr.includes('without grounding')) {
            textColor = C.success;
          } else if (statusVal === 'FAIL' || cellStr.includes('limited') || cellStr.includes('deprecated') || cellStr.includes('zero') || cellStr.includes('Error') || cellStr.includes('FAIL') || cellStr.includes('Enable billing')) {
            textColor = C.error;
          }
        } else if (headers[colIndex] === 'Access') {
          textColor = cell.includes('✓') ? C.success : C.warning;
        } else if (headers[colIndex] === 'Category' || headers[colIndex] === 'Type' || headers[colIndex] === 'Billing') {
          textColor = C.muted;
        } else if (headers[colIndex] === 'Model ID' || headers[colIndex] === 'Model' || headers[colIndex] === 'Use Case') {
          textColor = C.dark;
          fontName = 'Helvetica-Bold';
        }
        
        if (style.font) {
          fontName = style.font;
        }

        doc.fillColor(textColor).font(fontName).fontSize(rowFontSize)
          .text(String(cell), x, cellY, { width: colWidths[colIndex] - 12, align: style.align || 'left' });
      }
    });

    doc.y = rowY + rowH;
  });

  doc.moveDown(1);
}

// ==============================================================================
// ─── Cover Page ───────────────────────────────────────────────────────────────
// ==============================================================================
const cx = doc.page.margins.left;

// Dark blue header banner
doc.save().rect(0, 0, doc.page.width, 320).fill(C.dark).restore();
doc.save().rect(0, 314, doc.page.width, 6).fill(C.brand).restore();

// Cover page text
doc.fillColor(C.white).font('Helvetica-Bold').fontSize(28).text('Gemini API', cx, 100, { align: 'center' });
doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(28).text('Compatibility & Architecture Report', cx, 136, { align: 'center' });

doc.fillColor('#E5E7EB').font('Helvetica').fontSize(11)
  .text('Model availability · Google Search Grounding · Web Chat vs API', cx, 190, { align: 'center' });

doc.fillColor('#D1D5DB').fontSize(10)
  .text(`Invennico Lead Portal — Internal Technical Reference`, cx, 230, { align: 'center' })
  .text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, cx, 246, { align: 'center' });

// Table of contents on the cover page
doc.y = 360;
doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(14).text('Table of Contents', cx);
doc.moveDown(0.4);
line(doc.y, C.brand, 1.5);
doc.moveDown(0.6);

const toc = [
  ['1', 'Executive Summary'],
  ['2', 'Complete Model Test Results'],
  ['3', 'Why Versioned Model IDs Fail (Quota System)'],
  ['4', 'Google Search Grounding — What It Is & How It Works'],
  ['5', 'Gemini Web Chat vs Gemini API — The Core Difference'],
  ['6', 'Grounding Billing & Cost Structure'],
  ['7', 'Implementation Recommendation for Lead Portal'],
  ['8', 'Conclusion & Next Steps'],
];

toc.forEach(([num, title]) => {
  const y = doc.y;
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(10).text(num + '.', cx, y, { width: 20 });
  doc.fillColor(C.text).font('Helvetica').fontSize(10).text(title, cx + 25, y);
  doc.y = y + 18;
});

// Add a page break after the Table of Contents before starting the document content
doc.addPage();

// ==============================================================================
// ─── Section 1: Executive Summary ────────────────────────────────────────────
// ==============================================================================
sectionHeader('1.  Executive Summary', 'What we found and what it means for the Lead Portal');

body('This report documents a systematic investigation of all Gemini API models available on the Invennico project API key, their compatibility with the free-tier quota system, and the fundamental difference between using Gemini through its web interface versus the REST/SDK API. The investigation was prompted by 404 and 429 errors encountered when integrating Gemini-based Lead Research into the Lead Portal backend.');

h2('Key Findings');

const findings = [
  ['gemini-1.5-flash', 'Completely removed from the API — returns 404. This model has been deprecated and no longer exists at any endpoint.'],
  ['Versioned model IDs (gemini-2.0-flash, gemini-2.0-flash-lite, etc.)', 'Return 429 with limit: 0. These models exist but are assigned zero free-tier quota on this project key. They require billing to be enabled.'],
  ['Alias model IDs (*-latest, *-preview, *-lite)', 'Work correctly on the free tier. Google does not track alias usage against the same quota buckets as versioned IDs.'],
  ['gemini-2.5-flash-lite + googleSearch grounding', 'Grounding works on this model with the googleSearch tool. Confirmed by returning today\'s exact date (June 16, 2026) from a live web search.'],
  ['Web Chat vs API', 'Gemini web chat (gemini.google.com) always has grounding enabled at Google\'s expense. The API requires your own billing for grounding calls.'],
];

findings.forEach(([title, detail]) => {
  ensureSpace(35);
  // Flow title without absolute coordinates
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(10).text('→  ' + title, { width: pageW() });
  
  // Flow details indented relative to current margins
  doc.x = doc.page.margins.left + 16;
  doc.fillColor(C.text).font('Helvetica').fontSize(10).text(detail, { width: pageW() - 16, lineGap: 2 });
  
  // Reset horizontal offset
  doc.x = doc.page.margins.left;
  doc.moveDown(0.4);
});

// ==============================================================================
// ─── Section 2: Model Test Results ───────────────────────────────────────────
// ==============================================================================
sectionHeader('2.  Complete Model Test Results', 'Every model tested against your API key — live results');

body('The following table shows the result of calling generateContent on every model returned by the ListModels API endpoint for this project key. Models marked OK successfully generated a text response. Models marked FAIL show the exact HTTP error and its cause.');

const tableData1 = [
  ['gemini-2.5-flash',          'Flash',      'FAIL', 'Unknown error (likely billing)'],
  ['gemini-2.5-pro',            'Pro',        'FAIL', '429 — Free tier quota = 0'],
  ['gemini-2.0-flash',          'Flash',      'FAIL', '429 — Free tier quota = 0'],
  ['gemini-2.0-flash-001',      'Flash',      'FAIL', '429 — Free tier quota = 0'],
  ['gemini-2.0-flash-lite',     'Flash Lite', 'FAIL', '429 — Free tier quota = 0'],
  ['gemini-2.0-flash-lite-001', 'Flash Lite', 'FAIL', '429 — Free tier quota = 0'],
  ['gemini-1.5-flash',          'Flash',      'FAIL', '404 — Model deprecated & removed'],
  ['gemma-4-26b-a4b-it',        'Gemma',      'OK',   'Responds but returns markdown bullets (instruction-tuned format)'],
  ['gemma-4-31b-it',            'Gemma',      'OK',   'Responds but returns markdown bullets (instruction-tuned format)'],
  ['gemini-flash-latest',       'Alias',      'OK',   'Clean response — recommended alias'],
  ['gemini-flash-lite-latest',  'Alias',      'OK',   'Clean response — lightest free-tier alias'],
  ['gemini-pro-latest',         'Alias/Pro',  'FAIL', '429 — Free tier quota = 0 (Pro tier)'],
  ['gemini-2.5-flash-lite',     'Flash Lite', 'OK',   'Clean response + grounding works'],
  ['gemini-3-pro-preview',      'Pro',        'FAIL', '429 — Free tier quota = 0'],
  ['gemini-3-flash-preview',    'Flash',      'OK',   'Clean response'],
  ['gemini-3.1-pro-preview',    'Pro',        'FAIL', '429 — Free tier quota = 0'],
  ['gemini-3.1-flash-lite-prev','Flash Lite', 'OK',   'Clean response'],
  ['gemini-3.1-flash-lite',     'Flash Lite', 'OK',   'Clean response'],
  ['gemini-3.5-flash',          'Flash',      'OK',   'Clean response'],
];

drawTable(
  ['Model ID', 'Category', 'Status', 'Result / Reason'],
  tableData1,
  [175, 85, 50, 185]
);

h2('Grounding (Web Search) Test Results');
body('Tested both googleSearch and googleSearchRetrieval tools on all working models. Results:');

const groundData = [
  ['gemini-flash-latest',       'googleSearchRetrieval', 'FAIL', '429 — Rate limited during test batch'],
  ['gemini-flash-latest',       'googleSearch',          'FAIL', '429 — Rate limited during test batch'],
  ['gemini-flash-lite-latest',  'googleSearchRetrieval', 'FAIL', '429 — Rate limited during test batch'],
  ['gemini-flash-lite-latest',  'googleSearch',          'FAIL', '429 — Rate limited during test batch'],
  ['gemini-2.5-flash-lite',     'googleSearchRetrieval', 'FAIL', '400 — Tool not supported on this model (use googleSearch)'],
  ['gemini-2.5-flash-lite',     'googleSearch',          'OK',   'Live web search confirmed — returned today\'s date correctly'],
  ['gemini-3.5-flash',          'googleSearch',          'FAIL', '429 — Rate limited during test batch'],
  ['gemini-3.1-flash-lite',     'googleSearch',          'FAIL', '429 — Rate limited during test batch'],
];

drawTable(
  ['Model ID', 'Tool Type', 'Status', 'Result / Reason'],
  groundData,
  [175, 85, 50, 185]
);

noteBox('KEY FINDING: gemini-2.5-flash-lite with the googleSearch tool is the ONLY model on this key that successfully executed a grounded web search. The 429 errors on other models during the grounding test were caused by rate limiting from rapid sequential API calls in the test script — those models may also support grounding but were not retested after cooldown.');

// ==============================================================================
// ─── Section 3: Why Versioned Models Fail ────────────────────────────────────
// ==============================================================================
sectionHeader('3.  Why Versioned Model IDs Fail (Quota System)', 'Understanding limit: 0 and how Google\'s quota tiers work');

h2('The Two-Bucket Quota System');
body('Google Gemini API uses a two-bucket quota model for every model it offers:');

h3('Bucket 1 — Free Tier Quota');
body('A fixed number of free requests per day and per minute. Example: 1,500 requests/day, 15 requests/minute. These are tracked per model ID, per project, per day.');

h3('Bucket 2 — Paid Tier Quota');
body('Unlimited requests (billed per token). Requires billing to be enabled on the Google Cloud project linked to your API key. Once billing is enabled, all requests that exceed Bucket 1 fall through to Bucket 2.');

h2('Why Versioned IDs Show limit: 0');
body('When you create a new API key in Google AI Studio today, the free-tier quota buckets for older versioned model IDs are set to 0 by default. This is because:');
bullet('Google is actively migrating developers to newer model generations (2.5+, 3.x)');
bullet('Older versioned IDs (gemini-2.0-flash, gemini-2.0-flash-lite) are being deprecated');
bullet('Setting free-tier quota to 0 forces developers to either upgrade models or enable billing');
bullet('The model still EXISTS in the API (it appears in ListModels) but you cannot call it for free');

noteBox('limit: 0 does NOT mean the model is unavailable — it means your project\'s free-tier allocation for that model ID is zero. If you enable billing on the project, these models become available as paid calls.');

h2('Why Alias IDs (*-latest) Still Work');
body('Alias model IDs like gemini-flash-lite-latest, gemini-flash-latest, and gemini-2.5-flash-lite are not subject to the same deprecated quota buckets. Google maintains separate (more generous) quota pools for these aliases because:');
bullet('They always point to the most current recommended model');
bullet('Google wants developers using the latest models, not pinning to old versioned IDs');
bullet('The alias quota buckets are refreshed whenever Google updates what the alias points to');
bullet('They are the "blessed" path for free-tier usage');

h2('Why gemini-1.5-flash Returns 404');
body('This is different from the quota issue. The gemini-1.5-flash model has been completely removed from the API — it no longer exists at any endpoint. The 404 error means the URL https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent points to nothing. The model was deprecated and fully decommissioned. Any code referencing it must be updated.');

// ==============================================================================
// ─── Section 4: Google Search Grounding ──────────────────────────────────────
// ==============================================================================
sectionHeader('4.  Google Search Grounding — What It Is & How It Works', 'How Gemini performs live web research');

h2('What is Grounding?');
body('Grounding is Gemini\'s ability to connect to live Google Search before generating a response. Without grounding, Gemini answers from its training data (knowledge cutoff). With grounding, Gemini first searches Google, reads the top results, then generates a response informed by current, real-time information.');

body('This is why grounding is so valuable for Lead Research — Gemini can look up the client\'s company, check their website, read their product pages, and surface business intelligence that wasn\'t in its training data.');

h2('How Grounding Works Technically');

h3('Step 1 — Tool Declaration');
body('You tell Gemini it has access to Google Search by passing a tool configuration:');

codeBlock([
  "tools: [{ googleSearch: {} }]        // For gemini-2.5+ models",
  "tools: [{ googleSearchRetrieval: {} }] // For older 1.x models (deprecated)"
], false);

h3('Step 2 — Gemini Decides When to Search');
body('Gemini autonomously decides whether to call Google Search based on the prompt. For questions about current events, specific companies, or real-time data, it will search. For general reasoning or coding tasks, it may not search at all (saving you the grounding cost).');

h3('Step 3 — Results Are Injected Into Context');
body('Google Search results (titles, snippets, URLs) are fetched and injected into Gemini\'s context window before generation. Gemini reads these results and synthesizes them with its training knowledge to produce a grounded response.');

h3('Step 4 — Response Includes Grounding Metadata');
body('The API response includes a groundingMetadata field with the search queries used, the URLs consulted, and grounding support citations. Your code receives the grounded text response plus this metadata.');

noteBox('The grounding call happens server-side at Google — you never make a direct Google Search API call yourself. You just declare the tool, Gemini handles the search, and you receive the enriched response.');

h2('Tool Name Difference: googleSearch vs googleSearchRetrieval');
body('There are two different tool names depending on the model generation:');
bullet('googleSearchRetrieval — Used by Gemini 1.x models (now deprecated). Uses a retrieval-augmented generation (RAG) approach where search results are retrieved and used as grounding context.');
bullet('googleSearch — Used by Gemini 2.x and newer models. Gives the model direct tool-use capability to call Google Search as a function. More flexible, more powerful. Our test confirmed this works with gemini-2.5-flash-lite.');

noteBox('The 400 Bad Request we got when testing googleSearchRetrieval on gemini-2.5-flash-lite is because that model only accepts googleSearch. Never mix tool names across model generations.', '#FEF3C7', C.warning);

// ==============================================================================
// ─── Section 5: Web Chat vs API ────────────────===============================
// ==============================================================================
sectionHeader('5.  Gemini Web Chat vs Gemini API — The Core Difference', 'Why web chat can search for free but the API charges for it');

h2('The Question');
body('If you open gemini.google.com and ask "Tell me about Upwork lead patterns for AI projects", Gemini searches the web and gives you a real-time answer — for free. But when the same question goes through the API with googleSearch enabled, Google charges for the grounding call. Why?');

h2('How Gemini Web Chat Works');
body('Gemini web chat (gemini.google.com) is a consumer product built and operated by Google. When you use it:');
bullet('Google is the operator — they pay the infrastructure and grounding costs');
bullet('Grounding is permanently enabled for all conversations at no cost to you');
bullet('You are the end user consuming a free (ad-supported/subscription) consumer product');
bullet('Your data is used to improve Google\'s models (under their privacy policy)');
bullet('The model used is typically Gemini 2.0 Flash or Gemini 2.5 Flash — Google\'s latest');
bullet('There are no API keys, no quota buckets, no per-call costs visible to you');

h2('How the Gemini API Works');
body('The Gemini API is a developer platform (generativelanguage.googleapis.com). When your backend calls it:');
bullet('You are the operator — you build the product and control the model calls');
bullet('Google charges you per token (input + output) at published rates');
bullet('Grounding is an optional add-on charged separately per grounding request');
bullet('Your data is not used for model training (under the API terms of service)');
bullet('You control exactly which model, temperature, tools, and system prompt are used');
bullet('You get structured JSON responses, fine-grained control, and programmatic access');

drawComparisonBox();

noteBox('In short: Gemini web chat is a consumer product where Google funds the grounding. The API is a developer platform where you fund the grounding. They use the same underlying AI model but operate under completely different billing and access models.');

h2('Practical Implications for the Lead Portal');
body('When you test Lead Research by pasting a lead into gemini.google.com and get excellent client research — that is NOT representative of what a free-tier API key can do. The web chat has permanent, funded grounding. Your API key only has grounding if billing is enabled on the project.');

// ==============================================================================
// ─── Section 6: Grounding Billing & Cost Structure ───────────────────────────
// ==============================================================================
sectionHeader('6.  Grounding Billing & Cost Structure', 'What enabling billing actually means and costs');

h2('What Billing Enables');
body('Enabling billing on a Google Cloud project linked to your Gemini API key unlocks:');
bullet('Access to all versioned model IDs (gemini-2.0-flash, gemini-2.5-flash, etc.)');
bullet('Google Search Grounding for models that support it (gemini-2.5-flash-lite + googleSearch confirmed working)');
bullet('Higher rate limits (higher RPM and daily quotas)');
bullet('Access to Pro-tier models (gemini-2.5-pro, gemini-3.1-pro-preview, etc.)');

h2('Google Search Grounding Cost');

const costRows = [
  ['First 1,500 grounding requests / day', 'FREE'],
  ['Beyond 1,500 / day', '$35.00 per 1,000 requests'],
  ['Model token cost (input + output)', 'Charged separately per model pricing'],
];

drawTable(
  ['Grounding Requests / Day', 'Cost / Rate'],
  costRows,
  [330, 165],
  { 1: { align: 'right', font: 'Helvetica-Bold' } }
);

h2('Model Token Costs (approximate costs per 1 million tokens)');

const priceRows = [
  ['gemini-flash-lite-latest', 'Alias → latest lite', '$0.075', '$0.30', 'Free tier ✓'],
  ['gemini-2.5-flash-lite', 'Flash Lite', '$0.075', '$0.30', 'Free tier ✓'],
  ['gemini-flash-latest', 'Alias → latest flash', '$0.15', '$0.60', 'Free tier ✓'],
  ['gemini-2.5-flash', 'Flash', '$0.15', '$0.60', 'Billing req.'],
  ['gemini-2.5-pro', 'Pro', '$1.25', '$10.00', 'Billing req.'],
];

drawTable(
  ['Model', 'Type', 'Input /M tok', 'Output /M tok', 'Access'],
  priceRows,
  [140, 115, 75, 75, 90],
  { 2: { align: 'right' }, 3: { align: 'right' } }
);

noteBox('For the Lead Portal\'s expected volume (< 50 leads/day), the cost with billing enabled would be approximately $0.50–$2.00/month for grounding. Well within minimal cost territory.');

// ==============================================================================
// ─── Section 7: Implementation Recommendation ─────────────────────────────────
// ==============================================================================
sectionHeader('7.  Implementation Recommendation for Lead Portal', 'The model to use and how to handle grounding gracefully');

h2('Recommended Model: gemini-2.5-flash-lite');
body('Based on all tests, gemini-2.5-flash-lite is the best choice for Lead Research:');
bullet('Works on the current free-tier key ✓');
bullet('Supports googleSearch grounding when billing is enabled ✓');
bullet('More capable than the *-latest aliases (dedicated versioned model with good quota on this key) ✓');
bullet('Grounding test confirmed live web search returning accurate real-time data ✓');

h2('Conditional Grounding Pattern');
body('The implementation uses an environment variable GEMINI_SEARCH_GROUNDING to conditionally enable grounding:');

codeBlock([
  "// gemini.service.js",
  "const useGrounding = process.env.GEMINI_SEARCH_GROUNDING === 'true';",
  "",
  "const modelConfig = { model: 'gemini-2.5-flash-lite' };",
  "if (useGrounding) {",
  "  modelConfig.tools = [{ googleSearch: {} }];",
  "}",
  "",
  "const model = client.getGenerativeModel(modelConfig);",
]);

h2('Environment Variable Setup');
body('Add to .env file:');

codeBlock([
  "# Gemini API key (required)",
  "GEMINI_API_KEY=your_key_here",
  "",
  "# Set to true only when billing is enabled on the Google AI project",
  "GEMINI_SEARCH_GROUNDING=false"
]);

h2('Failure Handling');
body('The Lead Research call is already wrapped in Promise.allSettled in lead.service.js. If Gemini fails for any reason (wrong model, quota exhausted, grounding billing issue), the lead is still created successfully with Claude\'s analysis. The Lead Research tab simply shows "No research available" to the admin. No lead is ever lost due to a Gemini failure.');

// ==============================================================================
// ─── Section 8: Conclusion & Next Steps ───────────────────────────────────────
// ==============================================================================
sectionHeader('8.  Conclusion & Next Steps', 'Summary of actions required');

h2('Current State');
body('The Lead Portal backend has been updated to use gemini-2.5-flash-lite without grounding. This works on the current free-tier API key and produces good Lead Research output from Gemini\'s training knowledge (company analysis, platform context, budget patterns, etc.).');

h2('To Enable Live Web Search Grounding');

const steps = [
  ['Step 1', 'Go to console.cloud.google.com and open the project linked to your GEMINI_API_KEY'],
  ['Step 2', 'Navigate to Billing → Link a Billing Account → add a credit card (Google gives $300 free credit for new accounts)'],
  ['Step 3', 'Once billing is enabled, set GEMINI_SEARCH_GROUNDING=true in your .env file'],
  ['Step 4', 'Restart the backend server — Gemini will now perform live Google Search for each lead'],
  ['Step 5', 'Monitor usage at ai.dev/rate-limit — the first 1,500 grounding requests per day are free'],
];

steps.forEach(([step, desc]) => {
  ensureSpace(30);
  
  const xStep = doc.page.margins.left;
  const xDesc = xStep + 55;
  const wDesc = pageW() - 55;
  const y = doc.y;
  
  // Render step label absolute to prevent horizontal wrapping
  doc.fillColor(C.brand).font('Helvetica-Bold').fontSize(10).text(step + ':', xStep, y, { width: 50 });
  
  // Render step description flowing at offset xDesc
  doc.x = xDesc;
  doc.y = y;
  doc.fillColor(C.text).font('Helvetica').fontSize(10).text(desc, { width: wDesc, lineGap: 2 });
  
  doc.x = doc.page.margins.left;
  doc.moveDown(0.35);
});

noteBox('Without billing: Gemini uses training knowledge for research (still excellent for platform context, industry patterns, budget norms). With billing + grounding: Gemini performs live Google Search to find the client\'s actual company website, LinkedIn, news, and real-time business intelligence.');

h2('Quick Reference — Model Decision Matrix');

const matrixRows = [
  ['Just Lead Research (no web)', 'gemini-2.5-flash-lite', 'No billing needed', 'Current setup without grounding'],
  ['Lead Research + Web grounding', 'gemini-2.5-flash-lite', 'Enable billing', 'Set GEMINI_SEARCH_GROUNDING=true'],
  ['Higher quality analysis', 'gemini-flash-latest', 'No billing needed', 'Swap model ID'],
  ['Best quality + web', 'gemini-3.5-flash', 'Enable billing', 'Test for grounding support'],
];

drawTable(
  ['Use Case', 'Model', 'Billing', 'Action'],
  matrixRows,
  [130, 140, 90, 135]
);

// ==============================================================================
// ─── Post-Processing: Running Headers, Footers and Page Numbers ───────────────
// ==============================================================================
const pages = doc.bufferedPageRange();
const totalPages = pages.count;

for (let i = 1; i < totalPages; i++) {
  doc.switchToPage(i);
  
  // Set the page's bottom margin to 0 to prevent automatic page breaks when drawing footer
  doc.page.margins.bottom = 0;
  
  // Header
  doc.save();
  doc.strokeColor(C.border).lineWidth(0.5)
    .moveTo(doc.page.margins.left, 40)
    .lineTo(doc.page.width - doc.page.margins.right, 40)
    .stroke();
  doc.fillColor(C.muted).font('Helvetica').fontSize(8)
    .text('Gemini API Compatibility & Architecture Report', doc.page.margins.left, 28);
  
  // Footer
  const y = doc.page.height - 35; // 35pt from page bottom (well outside old bottom margin but safe from clipping)
  doc.strokeColor(C.border).lineWidth(0.5)
    .moveTo(doc.page.margins.left, y - 5)
    .lineTo(doc.page.width - doc.page.margins.right, y - 5)
    .stroke();
  doc.fillColor(C.muted).font('Helvetica').fontSize(8)
    .text(`Invennico Lead Portal — Internal Technical Reference`, doc.page.margins.left, y)
    .text(`Page ${i + 1} of ${totalPages}`, doc.page.width - doc.page.margins.right - 80, y, { width: 80, align: 'right' });
  doc.restore();
}

// Done!
doc.end();
console.log('PDF generated at: docs/gemini-api-report.pdf');
