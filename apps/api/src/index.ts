import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { randomBytes, createCipheriv, createDecipheriv, createHmac, createHash } from 'crypto';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import {
  AuthenticatedUser,
  CredentialRecord,
  MintIntentSchema,
  PrivacyLevelEnum,
  PrivacyUpdateSchema,
  RevokeSchema,
  VerifySchema,
  canonicalize,
} from '@ton-resume/shared';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN || (process.env.NODE_ENV === 'test' ? 'test-token' : undefined);
const OFFCHAIN_MASTER_KEY =
  process.env.OFFCHAIN_MASTER_KEY || (process.env.NODE_ENV === 'test'
    ? '01234567890123456789012345678901'
    : undefined);
const API_PORT = Number(process.env.API_PORT || 4000);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!OFFCHAIN_MASTER_KEY || OFFCHAIN_MASTER_KEY.length < 32)
  throw new Error('OFFCHAIN_MASTER_KEY must be 32+ chars');

const SECRET_KEY = Buffer.from(OFFCHAIN_MASTER_KEY).subarray(0, 32);

const db = new Database('ton-resume.db');
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  holderTelegramId TEXT NOT NULL,
  holderWallet TEXT,
  issuerName TEXT NOT NULL,
  issuerTier TEXT NOT NULL,
  payloadEncrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  authTag TEXT NOT NULL,
  contentHash TEXT NOT NULL,
  status TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  revokedAt TEXT,
  privacyLevel TEXT NOT NULL
)`);

db.exec(`CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  username TEXT,
  role TEXT
)`);

const fastify = Fastify({ logger: true });

await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(cookie);

function generateToken(user: AuthenticatedUser) {
  const payload = JSON.stringify({ id: user.id, username: user.username, role: user.role });
  const signature = createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  const token = Buffer.from(`${payload}.${signature}`).toString('base64');
  db.prepare('INSERT OR REPLACE INTO tokens (token, userId, username, role) VALUES (?, ?, ?, ?)').run(
    token,
    user.id,
    user.username,
    user.role
  );
  return token;
}

function decodeToken(token: string): AuthenticatedUser | null {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const [payload, signature] = raw.split('.');
    if (!payload || !signature) return null;
    const expected = createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    if (expected !== signature) return null;
    const parsed = JSON.parse(payload);
    return parsed;
  } catch (err) {
    fastify.log.error(err);
    return null;
  }
}

function verifyInitData(initData: string, token: string = BOT_TOKEN) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;
  const userData = params.get('user');
  if (!userData) return null;
  return JSON.parse(userData) as { id: number; username?: string };
}

function encryptPayload(payload: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', SECRET_KEY, iv);
  const serialized = canonicalize(payload);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    payloadEncrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    serialized,
  };
}

function decryptPayload(record: CredentialRecord) {
  const decipher = createDecipheriv('aes-256-gcm', SECRET_KEY, Buffer.from(record.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.payloadEncrypted, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

function hashPayload(serialized: string) {
  return createHash('sha256').update(serialized).digest('hex');
}

fastify.decorateRequest('user', null as AuthenticatedUser | null);
fastify.addHook('preHandler', async (request) => {
  const authHeader = request.headers.authorization;
  if (!authHeader) return;
  const token = authHeader.replace('Bearer ', '').trim();
  const cached = db.prepare('SELECT * FROM tokens WHERE token = ?').get(token);
  const decoded = cached ? decodeToken(token) : null;
  if (decoded) {
    request.user = decoded;
  }
});

fastify.post('/v1/auth/telegram/validate', async (request, reply) => {
  const bodySchema = z.object({ initData: z.string(), role: z.enum(['issuer', 'holder']).optional() });
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: 'Invalid payload' });
  const user = verifyInitData(parsed.data.initData);
  if (!user) return reply.status(401).send({ ok: false, error: 'Invalid initData' });
  const userPayload: AuthenticatedUser = { id: String(user.id), username: user.username, role: parsed.data.role };
  const token = generateToken(userPayload);
  return { ok: true, user: userPayload, token };
});

fastify.get('/v1/portfolio', async (request, reply) => {
  if (!request.user) return reply.status(401).send({ ok: false, error: 'Unauthorized' });
  const rows = db.prepare('SELECT * FROM credentials WHERE holderTelegramId = ?').all(request.user.id);
  const formatted = rows.map((row) => {
    const record = row as CredentialRecord;
    const base = {
      id: record.id,
      issuerName: record.issuerName,
      issuerTier: record.issuerTier,
      contentHash: record.contentHash,
      status: record.status,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
      privacyLevel: record.privacyLevel,
    };
    if (record.privacyLevel === 'FACT_ONLY' && request.user?.id !== record.holderTelegramId) {
      return base;
    }
    return { ...base, payload: decryptPayload(record) };
  });
  return { ok: true, credentials: formatted };
});

fastify.post('/v1/mint-intent', async (request, reply) => {
  if (!request.user || request.user.role !== 'issuer')
    return reply.status(403).send({ ok: false, error: 'Issuer role required' });
  const parsed = MintIntentSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: parsed.error.message });
  const { holderTelegramId, holderWallet, issuerName, issuerTier, payload } = parsed.data;
  const { payloadEncrypted, iv, authTag, serialized } = encryptPayload(payload);
  const contentHash = hashPayload(serialized);
  const id = nanoid();
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO credentials
    (id, holderTelegramId, holderWallet, issuerName, issuerTier, payloadEncrypted, iv, authTag, contentHash, status, createdAt, privacyLevel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(id, holderTelegramId, holderWallet ?? null, issuerName, issuerTier, payloadEncrypted, iv, authTag, contentHash, 'active', now, 'FULL');
  // TODO: integrate TON contract mint transaction builder
  return { ok: true, id, contentHash, status: 'active', sbtId: `sbt_${id}` };
});

fastify.post('/v1/revoke', async (request, reply) => {
  if (!request.user || request.user.role !== 'issuer')
    return reply.status(403).send({ ok: false, error: 'Issuer role required' });
  const parsed = RevokeSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: parsed.error.message });
  const existing = db.prepare('SELECT * FROM credentials WHERE id = ?').get(parsed.data.id) as CredentialRecord | undefined;
  if (!existing) return reply.status(404).send({ ok: false, error: 'Not found' });
  db.prepare('UPDATE credentials SET status = ?, revokedAt = ? WHERE id = ?').run('revoked', new Date().toISOString(), parsed.data.id);
  // TODO: TON revoke transaction
  return { ok: true, id: parsed.data.id, status: 'revoked' };
});

fastify.post('/v1/verify', async (request, reply) => {
  const parsed = VerifySchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: parsed.error.message });
  const { id, hash } = parsed.data;
  const record = id
    ? (db.prepare('SELECT * FROM credentials WHERE id = ?').get(id) as CredentialRecord | undefined)
    : hash
    ? (db.prepare('SELECT * FROM credentials WHERE contentHash = ?').get(hash) as CredentialRecord | undefined)
    : undefined;
  if (!record) return { ok: false, match: false };
  const payload = decryptPayload(record);
  const recomputedHash = hashPayload(canonicalize(payload));
  const match = recomputedHash === record.contentHash;
  const response: any = {
    ok: true,
    status: record.status,
    contentHash: record.contentHash,
    match,
    issuerTier: record.issuerTier,
  };
  if (record.privacyLevel === 'FULL') {
    response.payload = payload;
    response.issuerName = record.issuerName;
  }
  return response;
});

fastify.post('/v1/privacy/update', async (request, reply) => {
  if (!request.user) return reply.status(401).send({ ok: false, error: 'Unauthorized' });
  const parsed = PrivacyUpdateSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: parsed.error.message });
  const existing = db.prepare('SELECT * FROM credentials WHERE id = ?').get(parsed.data.id) as CredentialRecord | undefined;
  if (!existing || existing.holderTelegramId !== request.user.id)
    return reply.status(404).send({ ok: false, error: 'Not found or forbidden' });
  db.prepare('UPDATE credentials SET privacyLevel = ? WHERE id = ?').run(parsed.data.visibility, parsed.data.id);
  return { ok: true, id: parsed.data.id, visibility: parsed.data.visibility };
});

fastify.get('/health', async () => ({ ok: true }));

if (process.env.NODE_ENV !== 'test') {
  fastify.listen({ port: API_PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  });
}

export { verifyInitData, canonicalize, hashPayload };
