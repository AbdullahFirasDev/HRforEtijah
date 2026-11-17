// Removes keys starting with "$" (database operators such as $ne or $gt) from
// a JSON or form body, at any depth, so a value sent where a plain value is
// expected can never turn into a query condition. No real field starts with "$".
const strip = (value) => {
  if (Array.isArray(value)) {
    value.forEach(strip);
  } else if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    for (const key of Object.keys(value)) {
      if (key.startsWith('$')) delete value[key];
      else strip(value[key]);
    }
  }
  return value;
};

const dropOperatorKeys = (req, res, next) => {
  strip(req.body);
  next();
};

module.exports = dropOperatorKeys;
