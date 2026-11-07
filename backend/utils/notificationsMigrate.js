// Creates what the notifications feature needs in the database, and nothing
// else: three NEW collections with their indexes. No existing collection,
// document or index is read for changes, modified or removed.
//
//   npm run notifications:migrate            show what would be created (changes nothing)
//   npm run notifications:migrate -- --apply create it
//
// Uses MONGO_URI from backend/.env (or the environment). Safe to run again:
// what already exists is left as it is. Until it has run, the app keeps the
// feature off and writes nothing for it.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const NotificationPreference = require('../models/NotificationPreference');

const MODELS = [Notification, PushSubscription, NotificationPreference];

// Mongoose's default index name, e.g. user_1_key_1
const indexName = (fields, options) => options.name || Object.entries(fields).map(([k, v]) => `${k}_${v}`).join('_');

const describe = (fields, options) => {
  const extra = [
    options.unique && 'unique',
    options.expireAfterSeconds && `deletes entries after ${Math.round(options.expireAfterSeconds / 86400)} days`,
  ].filter(Boolean);
  return `${indexName(fields, options)}${extra.length ? ` (${extra.join(', ')})` : ''}`;
};

// What exists and what is missing, for each collection
const plan = async () => {
  const existing = new Set((await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const out = [];
  for (const Model of MODELS) {
    const name = Model.collection.collectionName;
    const exists = existing.has(name);
    const have = exists ? new Set((await Model.collection.indexes()).map((i) => i.name)) : new Set();
    const missing = Model.schema
      .indexes()
      .filter(([fields, options]) => !have.has(indexName(fields, options)))
      .map(([fields, options]) => describe(fields, options));
    out.push({ Model, name, exists, missing });
  }
  return out;
};

// Creates the missing collections and indexes (used by tests too)
const ensureNotificationStore = async () => {
  for (const { Model, exists } of await plan()) {
    if (!exists) await Model.createCollection();
    await Model.createIndexes(); // only adds missing indexes, never drops one
  }
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const { host, name } = mongoose.connection;
  console.log(`Database: ${name} on ${host}`);

  const steps = await plan();
  let changes = 0;
  for (const s of steps) {
    if (!s.exists) {
      changes += 1;
      console.log(`  + collection "${s.name}" (new, empty)`);
    } else {
      console.log(`  = collection "${s.name}" exists`);
    }
    s.missing.forEach((index) => {
      changes += 1;
      console.log(`      + index ${index}`);
    });
  }
  console.log('Existing collections (users, attendances, ...) are not touched.');

  if (!changes) {
    console.log('Nothing to do: notifications are already set up.');
  } else if (!apply) {
    console.log(`Dry run: ${changes} change(s) listed above, nothing was changed. Run again with --apply to create them.`);
  } else {
    await ensureNotificationStore();
    const left = (await plan()).reduce((n, s) => n + (s.exists ? 0 : 1) + s.missing.length, 0);
    if (left) throw new Error(`${left} change(s) could not be made`);
    console.log('Done. The app turns notifications on within a minute (no restart needed).');
  }
  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch(async (err) => {
    console.error(`Migration failed: ${err.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { ensureNotificationStore };
