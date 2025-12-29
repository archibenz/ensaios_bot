import { z } from 'zod';

export const CredentialStatusEnum = z.enum(['active', 'revoked']);
export const PrivacyLevelEnum = z.enum(['FULL', 'FACT_ONLY']);

export const CredentialPayloadSchema = z.object({
  holderName: z.string(),
  role: z.string(),
  company: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  description: z.string().optional(),
});

export const MintIntentSchema = z.object({
  holderTelegramId: z.string(),
  holderWallet: z.string().optional(),
  issuerName: z.string(),
  issuerTier: z.string().default('standard'),
  payload: CredentialPayloadSchema,
});

export const RevokeSchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
});

export const VerifySchema = z.object({
  id: z.string().optional(),
  hash: z.string().optional(),
});

export const PrivacyUpdateSchema = z.object({
  id: z.string(),
  visibility: PrivacyLevelEnum,
});

export type CredentialPayload = z.infer<typeof CredentialPayloadSchema>;
export type MintIntentInput = z.infer<typeof MintIntentSchema>;
export type RevokeInput = z.infer<typeof RevokeSchema>;
export type VerifyInput = z.infer<typeof VerifySchema>;
export type PrivacyUpdateInput = z.infer<typeof PrivacyUpdateSchema>;
export type CredentialStatus = z.infer<typeof CredentialStatusEnum>;
export type PrivacyLevel = z.infer<typeof PrivacyLevelEnum>;

export interface CredentialRecord {
  id: string;
  holderTelegramId: string;
  holderWallet?: string;
  issuerName: string;
  issuerTier: string;
  payloadEncrypted: string;
  iv: string;
  authTag: string;
  contentHash: string;
  status: CredentialStatus;
  createdAt: string;
  revokedAt?: string;
  privacyLevel: PrivacyLevel;
}

export interface AuthenticatedUser {
  id: string;
  username?: string;
  role?: 'issuer' | 'holder';
}

export function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalize(item)).join(',')}]`;
  }
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalize(value)}`).join(',')}}`;
}

