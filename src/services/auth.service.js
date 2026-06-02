const httpStatus = require('http-status');
const moment = require('moment');
const config = require('../config/config');
const tokenService = require('./token.service');
const userService = require('./user.service');
const emailService = require('./email.service');
const { Token } = require('../models');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');

/**
 * Login with username and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await userService.getUserByEmail(email);
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  if (user.status === 'inactive') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Your account is inactive. Please contact your administrator to regain access.'
    );
  }
  return user;
};

/**
 * Logout
 * @param {string} refreshToken
 * @returns {Promise}
 */
const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({ token: refreshToken, type: tokenTypes.REFRESH, blacklisted: false });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh auth tokens
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(refreshToken, tokenTypes.REFRESH);
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Reset password
 * @param {string} resetPasswordToken
 * @param {string} newPassword
 * @returns {Promise}
 */
const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    const resetPasswordTokenDoc = await tokenService.verifyToken(resetPasswordToken, tokenTypes.RESET_PASSWORD);
    const user = await userService.getUserById(resetPasswordTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.RESET_PASSWORD });
    await userService.updateUserById(user.id, { password: newPassword });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Send OTP for password reset
 * @param {string} email
 * @returns {Promise}
 */
const forgotPassword = async (email) => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email');
  }
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpExpires = moment().add(config.jwt.otpExpirationMinutes, 'minutes').toDate();
  await userService.updateUserById(user.id, { otp, otpExpires });
  await emailService.sendOtpEmail(email, otp);
};

/**
 * Verify OTP and return a short-lived reset password token
 * @param {string} email
 * @param {string} otp
 * @returns {Promise<string>} resetToken
 */
const verifyOtp = async (email, otp) => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No user found with this email');
  }

  if (!user.otp || user.otp !== otp || !user.otpExpires || user.otpExpires < new Date()) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired OTP');
  }

  await userService.updateUserById(user.id, { otp: null, otpExpires: null });

  const expires = moment().add(config.jwt.resetPasswordExpirationMinutes, 'minutes');
  const resetToken = tokenService.generateToken(user.id, expires, tokenTypes.RESET_PASSWORD);
  await tokenService.saveToken(resetToken, user.id, expires, tokenTypes.RESET_PASSWORD);
  return resetToken;
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
