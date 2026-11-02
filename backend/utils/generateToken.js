const jwt = require('jsonwebtoken');
const { SESSION_TIMEOUT_MINUTES } = require('../config/session');

const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: `${SESSION_TIMEOUT_MINUTES}m`,
  });
};

module.exports = generateToken;
