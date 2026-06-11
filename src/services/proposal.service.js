const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '../../templates/proposal-template.docx');

// ── Logo header injection ─────────────────────────────────────────────────────

const HDR_REL_ID = 'rId_logo_hdr';
const HDR_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
// Max display box for the logo: 10 cm × 10 cm (360000 EMU per cm)
const MAX_LOGO_CX = 3600000;
const MAX_LOGO_CY = 3600000;

// Parse pixel dimensions from a PNG or JPEG buffer without any external dependency.
const getImageDimensions = (buffer, mimeType) => {
  try {
    if (mimeType === 'image/png') {
      // PNG IHDR is always at byte 8; width at 16-19, height at 20-23 (big-endian)
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG: walk segments starting after SOI (FF D8)
    let offset = 2;
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const segLen = buffer.readUInt16BE(offset + 2); // includes its own 2 bytes
      // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF (skip C4=DHT, C8=JPG, CC=DAC)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + segLen;
    }
  } catch (_) {
    // ignore parse failures — caller will use fallback dimensions
  }
  return null;
};

// Fit the logo inside MAX_LOGO_CX × MAX_LOGO_CY while preserving aspect ratio.
const calcLogoEmu = (width, height) => {
  let cx = Math.round((MAX_LOGO_CY * width) / height);
  let cy = MAX_LOGO_CY;
  if (cx > MAX_LOGO_CX) {
    cx = MAX_LOGO_CX;
    cy = Math.round((MAX_LOGO_CX * height) / width);
  }
  return { cx, cy };
};

const buildHeaderXml = (cx, cy) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<w:hdr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
  ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
  ` xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:drawing>` +
  `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
  `<wp:extent cx="${cx}" cy="${cy}"/>` +
  `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
  `<wp:docPr id="1" name="logo_header"/>` +
  `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:nvPicPr>` +
  `<pic:cNvPr id="1" name="logo_header"/>` +
  `<pic:cNvPicPr><a:picLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></pic:cNvPicPr>` +
  `</pic:nvPicPr>` +
  `<pic:blipFill>` +
  `<a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/>` +
  `<a:stretch xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:fillRect/></a:stretch>` +
  `</pic:blipFill>` +
  `<pic:spPr>` +
  `<a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
  `<a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="rect"><a:avLst/></a:prstGeom>` +
  `</pic:spPr>` +
  `</pic:pic></a:graphicData></a:graphic>` +
  `</wp:inline></w:drawing></w:r></w:p></w:hdr>`;

const buildHeaderRels = (mediaFilename) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFilename}"/>` +
  `</Relationships>`;

const HDR_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';

const patchContentTypes = (zip, ext, mimeType) => {
  const ctXml = zip.file('[Content_Types].xml').asText();
  let patched = ctXml;
  if (!patched.includes(`Extension="${ext}"`)) {
    patched = patched.replace('</Types>', `<Default Extension="${ext}" ContentType="${mimeType}"/></Types>`);
  }
  if (!patched.includes('header1.xml')) {
    patched = patched.replace(
      '</Types>',
      `<Override PartName="/word/header1.xml" ContentType="${HDR_CONTENT_TYPE}"/></Types>`
    );
  }
  zip.file('[Content_Types].xml', patched);
};

const patchDocumentRels = (zip) => {
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (!relsFile) return;
  let relsXml = relsFile.asText();
  relsXml = relsXml.replace(/<Relationship[^>]*Id="rId_logo_hdr"[^/]*\/>/g, '');
  relsXml = relsXml.replace(
    '</Relationships>',
    `<Relationship Id="${HDR_REL_ID}" Type="${HDR_REL_TYPE}" Target="header1.xml"/></Relationships>`
  );
  zip.file('word/_rels/document.xml.rels', relsXml);
};

const patchDocumentXml = (zip) => {
  const docFile = zip.file('word/document.xml');
  if (!docFile) return;
  let docXml = docFile.asText();
  // Remove any existing default header reference regardless of attribute order
  docXml = docXml.replace(/<w:headerReference[^>]*w:type="default"[^/]*\/>/g, '');
  // Insert our header reference before the last </w:sectPr>
  const insertPos = docXml.lastIndexOf('</w:sectPr>');
  if (insertPos === -1) return;
  // eslint-disable-next-line prefer-template
  docXml = `${docXml.slice(0, insertPos)}<w:headerReference w:type="default" r:id="${HDR_REL_ID}"/>${docXml.slice(
    insertPos
  )}`;
  zip.file('word/document.xml', docXml);
};

const injectLogoIntoHeader = (docxBuffer, logoBuffer, mimeType) => {
  const zip = new PizZip(docxBuffer);
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const logoBase64 = logoBuffer.toString('base64');
  const dims = getImageDimensions(logoBuffer, mimeType);
  const { cx, cy } = dims && dims.width > 0 ? calcLogoEmu(dims.width, dims.height) : { cx: MAX_LOGO_CX, cy: MAX_LOGO_CY };

  // Strategy 1: Template already has a header with an image — replace only the image bytes
  // and update the display dimensions to match the new logo's aspect ratio.
  const headerRelsFile = zip.file('word/_rels/header1.xml.rels');
  if (headerRelsFile) {
    const headerRelsXml = headerRelsFile.asText();
    const imgMatch = headerRelsXml.match(/<Relationship\b[^>]*\bType="[^"]*\/relationships\/image"[^>]*\bTarget="([^"]+)"/);
    if (imgMatch) {
      const existingTarget = imgMatch[1]; // e.g. "../media/image1.jpg"
      const existingRelPath = existingTarget.replace(/^\.\.\//, ''); // "media/image1.jpg"
      const existingFullPath = `word/${existingRelPath}`; // "word/media/image1.jpg"
      const existingExt = existingRelPath.split('.').pop().toLowerCase(); // "jpg"

      if (existingExt === ext) {
        zip.file(existingFullPath, logoBase64, { base64: true });
      } else {
        const newRelPath = `media/logo_header.${ext}`;
        zip.file(`word/${newRelPath}`, logoBase64, { base64: true });
        zip.file('word/_rels/header1.xml.rels', headerRelsXml.replace(existingTarget, `../${newRelPath}`));
        patchContentTypes(zip, ext, mimeType);
      }

      // Patch wp:extent and a:ext in header1.xml to match actual logo aspect ratio
      const headerFile = zip.file('word/header1.xml');
      if (headerFile) {
        let hdrXml = headerFile.asText();
        hdrXml = hdrXml.replace(/(<wp:extent cx=")[^"]*(" cy=")[^"]*(")/g, `$1${cx}$2${cy}$3`);
        hdrXml = hdrXml.replace(/(<a:ext cx=")[^"]*(" cy=")[^"]*(")/g, `$1${cx}$2${cy}$3`);
        zip.file('word/header1.xml', hdrXml);
      }

      return zip.generate({ type: 'nodebuffer' });
    }
  }

  // Strategy 2 (fallback): Template has no header image — inject a fresh header with the logo.
  const mediaFilename = `logo_header.${ext}`;
  zip.file(`word/media/${mediaFilename}`, logoBase64, { base64: true });
  zip.file('word/header1.xml', buildHeaderXml(cx, cy));
  zip.file('word/_rels/header1.xml.rels', buildHeaderRels(mediaFilename));
  patchContentTypes(zip, ext, mimeType);
  patchDocumentRels(zip);
  patchDocumentXml(zip);

  return zip.generate({ type: 'nodebuffer' });
};

// ── Template data builder ─────────────────────────────────────────────────────
const buildTemplateData = (aiContent, companyInfo, lead, preparedFor, preparedBy, enabledSectionKeys) => {
  const c = aiContent || {};
  const enabledSet = new Set(enabledSectionKeys || []);
  const arr = (a) => (Array.isArray(a) ? a : []);
  const str = (s) => (Array.isArray(s) ? s.join(', ') : s || '');

  return {
    // Meta / cover
    company_name: companyInfo.name || 'Invennico TechnoLabs',
    company_tagline: companyInfo.tagline || '',
    company_website: companyInfo.website || '',
    company_email: companyInfo.email || '',
    company_phone: companyInfo.phone || '',
    prepared_for: preparedFor || '',
    prepared_by: preparedBy || '',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    lead_title: lead.title || '',

    // Section visibility flags — controlled by Settings proposalSections[].enabled
    show_clientBusinessDetails: enabledSet.has('clientBusinessDetails'),
    show_aboutInvennico: enabledSet.has('aboutInvennico'),
    show_executiveSummary: enabledSet.has('executiveSummary'),
    show_proposedSolution: enabledSet.has('proposedSolution'),
    show_scopeOfWork: enabledSet.has('scopeOfWork'),
    show_deliverables: enabledSet.has('deliverables'),
    show_technicalArchitecture: enabledSet.has('technicalArchitecture'),
    show_whyChooseUs: enabledSet.has('whyChooseUs'),
    show_assumptions: enabledSet.has('assumptions'),
    show_outOfScope: enabledSet.has('outOfScope'),
    show_milestones: enabledSet.has('milestones'),
    show_clientQuestions: enabledSet.has('clientQuestions'),
    show_postLaunchSupport: enabledSet.has('postLaunchSupport'),

    // Client business details
    client_overview: c.clientBusinessDetails?.businessOverview || '',
    client_what: c.clientBusinessDetails?.whatClientDoes || '',
    client_industry: c.clientBusinessDetails?.industryContext || '',
    client_objectives: c.clientBusinessDetails?.businessObjectives || '',

    // About company
    about_invennico: c.aboutInvennico || '',

    // Executive summary
    exec_vision: c.executiveSummary?.visionUnderstanding || '',
    exec_solution: c.executiveSummary?.proposedSolution || '',
    exec_outcomes: str(c.executiveSummary?.keyOutcomes),
    exec_why: c.executiveSummary?.whyThisApproach || '',

    // Proposed solution
    proposed_solution: c.proposedSolution?.overview || '',
    solution_components: arr(c.proposedSolution?.components).map((component) => ({ component })),

    // Scope of work
    scope_items: arr(c.scopeOfWork).map((s) => ({
      scope_num: s.number || '',
      scope_name: s.name || '',
      scope_details: s.details || '',
    })),

    // Deliverables
    deliverables: arr(c.deliverables).map((item) => ({ item })),

    // Technical architecture
    tech_frontend: str(c.technicalArchitecture?.frontend),
    tech_backend: str(c.technicalArchitecture?.backend),
    tech_database: str(c.technicalArchitecture?.database),
    tech_hosting: str(c.technicalArchitecture?.hosting),
    tech_integrations: str(c.technicalArchitecture?.integrations),
    tech_security: c.technicalArchitecture?.security || '',

    // Why choose us
    why_choose_us: arr(c.whyChooseUs).map((item) => ({ item })),

    // Assumptions / out of scope
    assumptions: arr(c.assumptions).map((item) => ({ item })),
    out_of_scope: arr(c.outOfScope).map((item) => ({ item })),

    // Milestones
    milestones: arr(c.milestones).map((m) => ({
      phase: m.phase || '',
      milestone: m.milestone || '',
      activities: m.activities || '',
      duration: m.duration || '',
    })),

    // Client questions
    client_questions: arr(c.clientQuestions).map((item) => ({ item })),

    // Post-launch support
    post_launch_warranty: c.postLaunchSupport?.warrantyPeriod || '',
    included_support: arr(c.postLaunchSupport?.includedSupport).map((item) => ({ item })),
    optional_retainer: arr(c.postLaunchSupport?.optionalRetainer).map((item) => ({ item })),
  };
};

const buildProposalDocxLegacy = async () => {
  throw new Error('No proposal template configured. Upload a template in the setting -> proposal template tab');
};

// ── Template-based DOCX builder ───────────────────────────────────────────────
const buildProposalDocx = async ({
  lead,
  aiContent,
  companyInfo,
  preparedFor,
  preparedBy,
  enabledSections,
  templatePath,
  logoBuffer,
  logoMimeType,
}) => {
  const tplPath = templatePath || DEFAULT_TEMPLATE_PATH;
  const enabledSectionKeys = (enabledSections || []).filter((s) => s.enabled).map((s) => s.key);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (tplPath && fs.existsSync(tplPath)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const content = fs.readFileSync(tplPath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    doc.render(buildTemplateData(aiContent, companyInfo, lead, preparedFor, preparedBy, enabledSectionKeys));

    let docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

    if (logoBuffer && logoMimeType) {
      docxBuffer = injectLogoIntoHeader(docxBuffer, logoBuffer, logoMimeType);
    }

    return docxBuffer;
  }

  return buildProposalDocxLegacy({ lead, aiContent, companyInfo, preparedFor, preparedBy, enabledSections });
};

module.exports = { buildProposalDocx };
