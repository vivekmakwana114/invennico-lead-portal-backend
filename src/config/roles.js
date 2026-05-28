const roles = ['admin', 'partner'];

const roleRights = new Map();

// admin: full platform access
roleRights.set('admin', ['getUsers', 'manageUsers', 'manageCredits', 'manageSettings']);

// partner: authenticated access to dashboard, leads, and their own profile only
roleRights.set('partner', []);

module.exports = {
  roles,
  roleRights,
};
