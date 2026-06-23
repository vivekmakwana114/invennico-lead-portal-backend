const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const httpStatus = require('http-status');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const settingsValidation = require('../../validations/settings.validation');
const settingsController = require('../../controllers/settings.controller');
const ApiError = require('../../utils/ApiError');

const router = express.Router();

// ── Multer config for proposal template uploads ────────────────────────────────
const templateDir = path.join(__dirname, '../../../templates');
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (!fs.existsSync(templateDir)) fs.mkdirSync(templateDir, { recursive: true });

const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, templateDir),
  filename: (req, file, cb) => cb(null, 'proposal-template.docx'),
});

const templateUpload = multer({
  storage: templateStorage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.docx') return cb(null, true);
    return cb(new ApiError(httpStatus.BAD_REQUEST, 'Only .docx files are allowed'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ── Routes ─────────────────────────────────────────────────────────────────────

router
  .route('/')
  .get(auth('manageSettings'), settingsController.getSettings)
  .put(auth('manageSettings'), validate(settingsValidation.updateSettings), settingsController.updateSettings);

router.route('/prompt').get(auth('manageSettings'), settingsController.getPrompt);

router
  .route('/prompt/:key')
  .put(auth('manageSettings'), validate(settingsValidation.updateSinglePrompt), settingsController.updateSinglePrompt);

router
  .route('/proposal/template')
  .post(auth('manageSettings'), templateUpload.single('template'), settingsController.uploadProposalTemplate);

router.route('/proposal/template/download').get(auth('manageSettings'), settingsController.downloadProposalTemplate);

module.exports = router;
