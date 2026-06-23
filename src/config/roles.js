const roles = ['superAdmin', 'admin', 'partner'];

const roleRights = new Map();

// superAdmin: full platform access + can manage all users including admins and change roles
roleRights.set('superAdmin', ['getUsers', 'manageUsers', 'manageCredits', 'manageSettings']);

// admin: full platform access (cannot see/manage superAdmin users or change roles)
roleRights.set('admin', ['getUsers', 'manageUsers', 'manageCredits', 'manageSettings']);

// partner: authenticated access to dashboard, leads, and their own profile only
roleRights.set('partner', []);

module.exports = {
  roles,
  roleRights,
};
