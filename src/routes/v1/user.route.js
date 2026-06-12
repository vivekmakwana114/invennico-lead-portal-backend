const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { upload, logoUpload } = require('../../middlewares/upload');
const userValidation = require('../../validations/user.validation');
const userController = require('../../controllers/user.controller');

const router = express.Router();

// ── Own profile (any authenticated user) ─────────────────────────────────────
router
  .route('/profile')
  .get(auth(), userController.getMe)
  .patch(auth(), validate(userValidation.updateProfile), userController.updateMe);

router.post('/profile/avatar', auth(), upload.single('avatar'), userController.uploadAvatar);
router.post('/profile/logo', auth(), logoUpload.single('logo'), userController.uploadLogo);
router.delete('/profile/logo', auth(), userController.removeLogo);
router.post('/profile/change/password', auth(), validate(userValidation.changePassword), userController.changePassword);

// ── User management (admin only) ──────────────────────────────────────────────
router
  .route('/')
  .get(auth('getUsers'), validate(userValidation.getUsers), userController.getUsers)
  .post(auth('manageUsers'), validate(userValidation.createUser), userController.createUser);

router
  .route('/:userId')
  .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
  .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
  .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

// ── Credit management (admin only) ────────────────────────────────────────────
router.post('/:userId/credits', auth('manageCredits'), validate(userValidation.grantCredits), userController.grantCredits);

// ── Logo management (admin only) ──────────────────────────────────────────────
router.post('/:userId/logo', auth('manageUsers'), logoUpload.single('logo'), userController.adminUploadLogo);
router.delete('/:userId/logo', auth('manageUsers'), userController.adminRemoveLogo);

module.exports = router;
