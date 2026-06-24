const httpStatus = require('http-status');
const { User, Token } = require('../models');
const ApiError = require('../utils/ApiError');
const { CreditTransaction } = require('../models');
const { tokenTypes } = require('../config/tokens');

const createUser = async (userBody) => {
  if (await User.isEmailTaken(userBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (userBody.role === 'superAdmin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot create users with super admin role');
  }
  return User.create(userBody);
};

const queryUsers = async (filter, options) => {
  return User.paginate(filter, options);
};

const getUserById = async (id) => {
  return User.findById(id);
};

const getUserByEmail = async (email) => {
  return User.findOne({ email });
};

const updateUserById = async (userId, updateBody, requestingUserRole) => {
  const user = await getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  // superAdmin entries are invisible to non-superAdmin actors
  if (user.role === 'superAdmin' && requestingUserRole !== 'superAdmin') {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // superAdmin role cannot be assigned via API — set it directly in the database
  if (updateBody.role === 'superAdmin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot assign super admin role');
  }

  if (updateBody.email && (await User.isEmailTaken(updateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  const roleChanged = updateBody.role && updateBody.role !== user.role;
  Object.assign(user, updateBody);
  await user.save();
  if (roleChanged) {
    await user.updateOne({ roleChangedAt: new Date() });
    await Token.deleteMany({ user: userId, type: tokenTypes.REFRESH });
  }
  return user;
};

const deleteUserById = async (userId, requestingUserRole) => {
  const user = await getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  // superAdmin entries are invisible to non-superAdmin actors
  if (user.role === 'superAdmin' && requestingUserRole !== 'superAdmin') {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  if (user.status === 'active') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Mark the user as inactive before deleting');
  }
  await user.deleteOne();
  return user;
};

const changePassword = async (user, currentPassword, newPassword) => {
  if (!(await user.isPasswordMatch(currentPassword))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Current password is incorrect');
  }
  await updateUserById(user.id, { password: newPassword }, user.role);
};

/**
 * Grant or refill credits for a user (admin action).
 * Increments totalCredits and appends an entry to credit_transactions.
 */
const grantCredits = async (userId, amount, grantedById, note) => {
  const user = await getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');

  user.totalCredits += amount;
  await user.save();

  // Lazy-require to avoid circular dependency with models/index

  const transaction = await CreditTransaction.create({
    userId: user.id,
    type: 'grant',
    amount,
    grantedBy: grantedById,
    note: note || null,
  });

  return { user, transaction };
};

/**
 * Deduct 1 credit when a lead is AI-analyzed.
 * Called internally by the leads service — not exposed as a direct API endpoint.
 */
const consumeCredit = async (userId, leadId) => {
  const user = await getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  if (user.availableCredits < 1) {
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Insufficient credits. Contact your admin to top up.');
  }

  user.consumedCredits += 1;
  await user.save();

  const transaction = await CreditTransaction.create({
    userId: user.id,
    type: 'consume',
    amount: -1,
    leadId,
  });

  return { user, transaction };
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
  changePassword,
  grantCredits,
  consumeCredit,
};
