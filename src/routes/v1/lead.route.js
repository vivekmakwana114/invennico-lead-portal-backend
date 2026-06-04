const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const leadValidation = require('../../validations/lead.validation');
const leadController = require('../../controllers/lead.controller');

const router = express.Router();

// Multer — PDF upload to projectpdf/ at repo root
const uploadDir = path.join(__dirname, '../../../projectpdf');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// Static endpoints — must be defined before /:leadId to avoid route conflicts
router.get('/stats', auth(), leadController.getLeadStats);
router.post('/upload/pdf', auth(), pdfUpload.single('file'), leadController.uploadPdf);
router.post('/analyze', auth(), validate(leadValidation.analyzeLead), leadController.analyzeLead);
router.post('/whatsapp', auth(), validate(leadValidation.generateWhatsapp), leadController.generateWhatsapp);

router
  .route('/')
  .get(auth(), validate(leadValidation.getLeads), leadController.getLeads)
  .post(auth(), validate(leadValidation.createLead), leadController.createLead);

router
  .route('/:leadId')
  .get(auth(), validate(leadValidation.getLead), leadController.getLead)
  .patch(auth(), validate(leadValidation.updateLead), leadController.updateLead)
  .delete(auth(), validate(leadValidation.deleteLead), leadController.deleteLead);

module.exports = router;
