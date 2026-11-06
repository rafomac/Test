// Usage: npm run hash-password -- "your dashboard password"
import crypto from "node:crypto";
const pw = process.argv[2];
if (!pw) { console.error('Usage: npm run hash-password -- "password"'); process.exit(1); }
const salt = crypto.randomBytes(16).toString("base64");
const h = crypto.scryptSync(pw, salt, 32, { N: 16384 }).toString("base64");
console.log(`APP_PASSWORD_HASH=scrypt:16384:${salt}:${h}`);
