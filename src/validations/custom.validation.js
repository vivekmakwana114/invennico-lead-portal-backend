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

module.exports = {
  objectId,
  password,
};
