const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, userService, tokenService } = require('../services');

// register
const register = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  const tokens = await tokenService.generateAuthTokens(user);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Registration successful',
    data: { user, tokens },
  });
});

// login
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await authService.loginUserWithEmailAndPassword(email, password);
  const tokens = await tokenService.generateAuthTokens(user);
  res.send({
    success: true,
    message: 'Login successful',
    data: { user, tokens },
  });
});

// logout
const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.send({ success: true, message: 'Logged out successfully' });
});

// refresh tokens
const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({
    success: true,
    message: 'Tokens refreshed',
    data: tokens,
  });
});

// forgot password
const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.send({ success: true, message: 'OTP sent to your email' });
});

// verify otp
const verifyOtp = catchAsync(async (req, res) => {
  const resetToken = await authService.verifyOtp(req.body.email, req.body.otp);
  res.send({
    success: true,
    message: 'OTP verified successfully',
    data: { resetToken },
  });
});

// reset password
const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.send({ success: true, message: 'Password reset successful' });
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  verifyOtp,
  resetPassword,
};
