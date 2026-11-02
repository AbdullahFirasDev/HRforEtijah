// How long a sign-in lasts. After this the API rejects the token and the
// frontend signs the user out automatically.
const SESSION_TIMEOUT_MINUTES = Number(process.env.SESSION_TIMEOUT_MINUTES) || 15;

module.exports = { SESSION_TIMEOUT_MINUTES };
