// Prints a new pair of VAPID keys for push notifications (npm run vapid-keys).
// Put the three lines in backend/.env (and in the deployment's environment
// variables), with VAPID_SUBJECT set to a real contact address. Generate them
// once: new keys invalidate every device's subscription, so everyone would
// have to turn device notifications on again.
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:your-address@example.com');
console.log('\nKeep VAPID_PRIVATE_KEY secret (never in the frontend or in Git).');
