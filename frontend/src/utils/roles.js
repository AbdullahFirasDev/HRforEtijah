export const VALID_ROLES = ['employee', 'manager', 'admin'];

export const hasValidRole = (user) => !!user && VALID_ROLES.includes(user.role);
