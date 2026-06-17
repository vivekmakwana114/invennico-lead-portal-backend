const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    ANTHROPIC_API_KEY: Joi.string().description('Anthropic API key for lead analysis and WhatsApp reply generation'),
    GEMINI_API_KEY: Joi.string().description('Google Gemini API key for lead research with web grounding'),
    ENCRYPTION_KEY: Joi.string().description('32-char AES-256 key for encrypting integration API keys in settings'),
    GOOGLE_SERVICE_ACCOUNT_KEY: Joi.string().description('Google service account JSON (stringified) for Drive uploads'),
    GOOGLE_DRIVE_FOLDER_ID: Joi.string().description('Fallback Google Drive folder ID for proposal uploads'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {},
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: 10,
    otpExpirationMinutes: 10,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: Number(envVars.SMTP_PORT) === 465,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
  },
  anthropic: {
    apiKey: envVars.ANTHROPIC_API_KEY,
  },
  gemini: {
    apiKey: envVars.GEMINI_API_KEY,
  },
  encryption: {
    key: envVars.ENCRYPTION_KEY,
  },
  google: {
    serviceAccountKey: (() => {
      try {
        return envVars.GOOGLE_SERVICE_ACCOUNT_KEY ? JSON.parse(envVars.GOOGLE_SERVICE_ACCOUNT_KEY) : null;
      } catch {
        return null;
      }
    })(),
    driveFolderId: envVars.GOOGLE_DRIVE_FOLDER_ID || null,
  },
};
