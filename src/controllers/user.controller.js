const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService } = require('../services');

// ── Admin: list all users ─────────────────────────────────────────────────────
const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role', 'status']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

// ── Admin: get any user / Partner: own profile via userId ─────────────────────
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  res.send(user);
});

// ── Admin: create / invite a new user ─────────────────────────────────────────
const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send(user);
});

// ── Admin: update any user's profile, role, or status ────────────────────────
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUserById(req.params.userId, req.body);
  res.send(user);
});

// ── Admin: delete user (only allowed when status = inactive) ──────────────────
const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUserById(req.params.userId);
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Any authenticated user: get own profile ───────────────────────────────────
const getMe = catchAsync(async (req, res) => {
  res.send(req.user);
});

// ── Any authenticated user: update own profile fields ────────────────────────
const updateMe = catchAsync(async (req, res) => {
  const allowedFields = pick(req.body, ['name', 'phone', 'department', 'location']);
  const user = await userService.updateUserById(req.user.id, allowedFields);
  res.send(user);
});

// ── Any authenticated user: change own password ───────────────────────────────
const changePassword = catchAsync(async (req, res) => {
  await userService.changePassword(req.user, req.body.currentPassword, req.body.newPassword);
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Admin: grant or refill credits for a user ────────────────────────────────
const grantCredits = catchAsync(async (req, res) => {
  const { amount, note } = req.body;
  const result = await userService.grantCredits(req.params.userId, amount, req.user.id, note);
  res.send(result);
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changePassword,
  grantCredits,
};
