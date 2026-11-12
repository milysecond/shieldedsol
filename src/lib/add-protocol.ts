/** Shared types, limits, and validation for the add-protocol form. */

export const PRIVACY_METHODS = ['zk', 'mpc', 'other'] as const;
export type PrivacyMethod = (typeof PRIVACY_METHODS)[number];

export const PRIVACY_METHOD_LABELS: Record<PrivacyMethod, string> = {
  zk: 'ZK',
  mpc: 'MPC',
  other: 'Other',
};

export const ADD_PROTOCOL_LIMITS = {
  name: 120,
  website: 500,
  xHandle: 32,
  description: 1000,
  privacyMethodOther: 120,
  programIds: 2000,
  dataSource: 2000,
  contactName: 120,
  contactEmail: 254,
  notes: 2000,
} as const;

export type AddProtocolFields = {
  name: string;
  website: string;
  xHandle: string;
  description: string;
  privacyMethod: PrivacyMethod | '';
  privacyMethodOther: string;
  programIds: string;
  dataSource: string;
  contactName: string;
  contactEmail: string;
  notes: string;
};

export type AddProtocolPayload = Omit<AddProtocolFields, 'privacyMethod'> & {
  privacyMethod: PrivacyMethod;
};

export type ValidationResult =
  | { ok: true; data: AddProtocolPayload }
  | { ok: false; error: string; field?: keyof AddProtocolFields };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,32}$/;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function trim(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function normalizeWebsite(raw: string): string | null {
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeHandle(raw: string): string | null {
  if (!raw) return '';
  const handle = raw.replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '');
  if (!X_HANDLE_RE.test(handle)) return null;
  return handle;
}

function normalizeProgramIds(raw: string): string | null {
  if (!raw) return '';
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return '';
  if (ids.length > 20) return null;
  if (ids.some((id) => !PUBKEY_RE.test(id))) return null;
  return ids.join('\n');
}

export function validateAddProtocol(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request' };
  }
  const raw = body as Record<string, unknown>;

  const name = trim(raw.name, ADD_PROTOCOL_LIMITS.name);
  if (!name) return { ok: false, error: 'Protocol name is required', field: 'name' };

  const websiteRaw = trim(raw.website, ADD_PROTOCOL_LIMITS.website);
  const website = normalizeWebsite(websiteRaw);
  if (website === null) {
    return { ok: false, error: 'Enter a valid website URL', field: 'website' };
  }

  const handleRaw = trim(raw.xHandle, ADD_PROTOCOL_LIMITS.xHandle + 40);
  const xHandle = normalizeHandle(handleRaw);
  if (xHandle === null) {
    return { ok: false, error: 'Enter a valid X handle', field: 'xHandle' };
  }

  const description = trim(raw.description, ADD_PROTOCOL_LIMITS.description);

  const privacyMethod = String(raw.privacyMethod ?? '')
    .trim()
    .toLowerCase();
  if (!PRIVACY_METHODS.includes(privacyMethod as PrivacyMethod)) {
    return {
      ok: false,
      error: 'Choose a privacy method (ZK, MPC, or Other)',
      field: 'privacyMethod',
    };
  }
  const privacyMethodOther = trim(
    raw.privacyMethodOther,
    ADD_PROTOCOL_LIMITS.privacyMethodOther
  );
  if (privacyMethod === 'other' && !privacyMethodOther) {
    return {
      ok: false,
      error: 'Tell us what privacy method you use',
      field: 'privacyMethodOther',
    };
  }

  const programRaw = trim(raw.programIds, ADD_PROTOCOL_LIMITS.programIds);
  const programIds = normalizeProgramIds(programRaw);
  if (programIds === null) {
    return {
      ok: false,
      error: 'Program IDs should be Solana addresses, one per line',
      field: 'programIds',
    };
  }

  const dataSource = trim(raw.dataSource, ADD_PROTOCOL_LIMITS.dataSource);
  const contactName = trim(raw.contactName, ADD_PROTOCOL_LIMITS.contactName);

  const contactEmail = trim(raw.contactEmail, ADD_PROTOCOL_LIMITS.contactEmail).toLowerCase();
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) {
    return { ok: false, error: 'A valid contact email is required', field: 'contactEmail' };
  }

  const notes = trim(raw.notes, ADD_PROTOCOL_LIMITS.notes);

  return {
    ok: true,
    data: {
      name,
      website,
      xHandle,
      description,
      privacyMethod: privacyMethod as PrivacyMethod,
      privacyMethodOther: privacyMethod === 'other' ? privacyMethodOther : '',
      programIds,
      dataSource,
      contactName,
      contactEmail,
      notes,
    },
  };
}

export function validateStep(
  field: keyof AddProtocolFields,
  values: AddProtocolFields
): string | null {
  const result = validateAddProtocol({
    ...values,
    // Soft-validate a single field: fill required later fields with placeholders
    // so earlier optional/required checks can run in isolation.
    name: field === 'name' ? values.name : values.name || 'placeholder',
    privacyMethod:
      field === 'privacyMethod' || field === 'privacyMethodOther'
        ? values.privacyMethod
        : values.privacyMethod || 'zk',
    privacyMethodOther:
      field === 'privacyMethodOther' ? values.privacyMethodOther : values.privacyMethodOther || 'n/a',
    contactEmail:
      field === 'contactEmail' ? values.contactEmail : values.contactEmail || 'ok@example.com',
  });
  if (result.ok) return null;
  if (result.field && result.field !== field) return null;
  return result.error;
}
