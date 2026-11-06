/** AES-256-GCM encryption for secrets at rest (Kite access token). Key from ENCRYPTION_KEY. */
import crypto from "node:crypto";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (32-byte base64). Generate: openssl rand -base64 32");
  const b = Buffer.from(raw, "base64");
  if (b.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes");
  return b;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export function hmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** scrypt password hash, format: scrypt:N:salt:hash */
export function hashPassword(pw: string, salt = crypto.randomBytes(16).toString("base64")): string {
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384 }).toString("base64");
  return `scrypt:16384:${salt}:${h}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, , salt, h] = stored.split(":");
  if (alg !== "scrypt" || !salt || !h) return false;
  return safeEqual(hashPassword(pw, salt).split(":")[3], h);
}
