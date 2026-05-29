const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../config/logger');

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== 'test') {
  transport
    .verify()
    .then(() => logger.info('Connected to email server'))
    .catch(() => logger.warn('Unable to connect to email server. Make sure you have configured the SMTP options in .env'));
}

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text) => {
  const msg = { from: config.email.from, to, subject, text };
  await transport.sendMail(msg);
};

/**
 * Send OTP email for password reset
 * @param {string} to
 * @param {string} otp
 * @returns {Promise}
 */
const sendOtpEmail = async (to, otp) => {
  const subject = 'Your password reset code';
  const text = `Dear user,\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request a password reset, please ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send welcome email with login credentials when admin creates a new user
 * @param {string} to
 * @param {string} name
 * @param {string} password  plaintext password (before hashing)
 * @returns {Promise}
 */
const sendWelcomeEmail = async (to, name, password) => {
  const subject = 'Welcome to Invennico Lead Portal — Your Login Credentials';
  const text = `Hi ${name},\n\nYour account has been created on the Invennico Lead Portal.\n\nHere are your login credentials:\n  Email:    ${to}\n  Password: ${password}\n\nPlease log in and change your password as soon as possible.\n\nRegards,\nInvennico Team`;
  await sendEmail(to, subject, text);
};

module.exports = {
  transport,
  sendEmail,
  sendOtpEmail,
  sendWelcomeEmail,
};
