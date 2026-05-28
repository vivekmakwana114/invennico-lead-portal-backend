const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userValidation = require('../../validations/user.validation');
const userController = require('../../controllers/user.controller');

const router = express.Router();

// ── Own profile (any authenticated user) ─────────────────────────────────────
router
  .route('/me')
  .get(auth(), userController.getMe)
  .patch(auth(), validate(userValidation.updateProfile), userController.updateMe);

router.post('/me/change/password', auth(), validate(userValidation.changePassword), userController.changePassword);

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

module.exports = router;
