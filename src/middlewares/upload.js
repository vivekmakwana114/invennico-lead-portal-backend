const multer = require('multer');
const path = require('path');
const fs = require('fs');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

// ── Avatar ────────────────────────────────────────────────────────────────────
const avatarDir = path.join(__dirname, '..', '..', 'images', 'avatars');
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    return cb(new ApiError(httpStatus.BAD_REQUEST, 'Only JPEG, PNG, and WebP images are allowed'), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 },
});

// ── Logo ──────────────────────────────────────────────────────────────────────
const logoDir = path.join(__dirname, '..', '..', 'images', 'logos');
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${req.user.id}-${Date.now()}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
    return cb(new ApiError(httpStatus.BAD_REQUEST, 'Only JPEG and PNG images are allowed for logos'), false);
  },
  limits: { fileSize: 1 * 1024 * 1024 },
});

module.exports = { upload, logoUpload };
