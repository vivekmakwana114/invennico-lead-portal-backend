const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

const password = (value, helpers) => {
  if (value.length < 8) {
    return helpers.message('password must be at least 8 characters');
  }
  if (!value.match(/[A-Z]/)) {
    return helpers.message('password must contain at least 1 uppercase letter');
  }
  if (!value.match(/\d/)) {
    return helpers.message('password must contain at least 1 number');
  }
  if (!value.match(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/)) {
    return helpers.message('password must contain at least 1 special character');
  }
  return value;
};

// Accepts optional leading +, then 7–15 digits (spaces, dashes, dots, parens allowed as separators)
const phone = (value, helpers) => {
  const digits = value.replace(/\D/g, '');
  if (!value.match(/^\+?[\d\s\-().]{7,20}$/) || digits.length < 7 || digits.length > 15) {
    return helpers.message('phone number must be a valid phone number (7–15 digits, optional country code)');
  }
  return value;
};

module.exports = {
  objectId,
  password,
  phone,
};
