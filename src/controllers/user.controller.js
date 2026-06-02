const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');

const DEFAULT_PASSWORD = 'NewUser@707K10';

// ── Admin: list all users ─────────────────────────────────────────────────────
const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'status']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send({
    success: true,
    message: 'Users fetched successfully',
    data: result,
  });
});

// ── Admin: get any user by ID ─────────────────────────────────────────────────
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  res.send({
    success: true,
    message: 'User fetched successfully',
    data: { user },
  });
});

// ── Admin: create a new user with default password ───────────────────────────
const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser({ ...req.body, password: DEFAULT_PASSWORD });
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'User created successfully',
    data: { user },
  });
});

// ── Admin: update any user's profile, role, or status ────────────────────────
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send({
    success: true,
    message: 'User updated successfully',
    data: { user },
  });
});

// ── Admin: delete user (only allowed when status = inactive) ──────────────────
const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.send({ success: true, message: 'User deleted successfully' });
});

// ── Any authenticated user: get own profile ───────────────────────────────────
const getMe = catchAsync(async (req, res) => {
  res.send({
    success: true,
    message: 'Profile fetched successfully',
    data: { user: req.user },
  });
});

// ── Any authenticated user: update own profile fields ────────────────────────
const updateMe = catchAsync(async (req, res) => {
  const allowedFields = pick(req.body, ['name', 'phone', 'department', 'location']);
  const user = await userService.updateUserById(req.user.id, allowedFields);
  res.send({
    success: true,
    message: 'Profile updated successfully',
    data: { user },
  });
});

// ── Any authenticated user: change own password ───────────────────────────────
const changePassword = catchAsync(async (req, res) => {
  await userService.changePassword(req.user, req.body.currentPassword, req.body.newPassword);
  res.send({ success: true, message: 'Password changed successfully' });
});

// ── Any authenticated user: upload own avatar ─────────────────────────────────
const uploadAvatar = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  const avatarUrl = `/images/avatars/${req.file.filename}`;
  const user = await userService.updateUserById(req.user.id, { avatar: avatarUrl });
  res.send({
    success: true,
    message: 'Avatar uploaded successfully',
    data: { user },
  });
});

// ── Admin: grant or refill credits for a user ────────────────────────────────
const grantCredits = catchAsync(async (req, res) => {
  const { amount, note } = req.body;
  const result = await userService.grantCredits(req.params.userId, amount, req.user.id, note);
  res.send({
    success: true,
    message: `${amount} credit(s) granted successfully`,
    data: result,
  });
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  uploadAvatar,
  changePassword,
  grantCredits,
};
