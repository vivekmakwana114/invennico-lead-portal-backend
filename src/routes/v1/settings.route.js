const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const settingsValidation = require('../../validations/settings.validation');
const settingsController = require('../../controllers/settings.controller');

const router = express.Router();

router
  .route('/')
  .get(auth('manageSettings'), settingsController.getSettings)
  .put(auth('manageSettings'), validate(settingsValidation.updateSettings), settingsController.updateSettings);

module.exports = router;
