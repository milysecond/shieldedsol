/**
 * OAuth 1.0a HMAC-SHA1 signer (RFC 5849) for Official X API requests.
 *
 * Uses Web Crypto (`crypto.subtle`) so the same code runs in Cloudflare
 * Workers (OpenNext) and Node 22. JSON and multipart/form-data bodies are
 * never included in the signature base string — only URL query parameters,
 * application/x-www-form-urlencoded fields, and oauth_* parameters.
 *
 * @see https://docs.x.com/fundamentals/authentication/oauth-1-0a/creating-a-signature
 * @see https://www.rfc-editor.org/rfc/rfc5849
 */

export type OAuth1Credentials = {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
};

export type SignOAuth1Input = {
  method: string;
  url: string;
  credentials: OAuth1Credentials;
  /** Only for application/x-www-form-urlencoded bodies. Do not pass JSON or multipart fields. */
  formParams?: Record<string, string>;
  nonce?: string;
  timestamp?: string;
};

export type SignOAuth1Result = {
  authorization: string;
  signature: string;
  signatureBaseString: string;
  parameterString: string;
  signingKey: string;
  nonce: string;
  timestamp: string;
};

/** RFC 5849 §3.6 / X percent-encoding: unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~". */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function oauthNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function baseUrlOf(url: URL): string {
  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const defaultPort =
    (protocol === 'https:' && url.port === '443') ||
    (protocol === 'http:' && url.port === '80');
  const port = url.port && !defaultPort ? `:${url.port}` : '';
  return `${protocol}//${hostname}${port}${url.pathname}`;
}

function collectParameterString(
  url: URL,
  oauthParams: Record<string, string>,
  formParams?: Record<string, string>
): string {
  const pairs: Array<[string, string]> = [];

  for (const [key, value] of url.searchParams.entries()) {
    pairs.push([key, value]);
  }
  if (formParams) {
    for (const [key, value] of Object.entries(formParams)) {
      pairs.push([key, value]);
    }
  }
  for (const [key, value] of Object.entries(oauthParams)) {
    pairs.push([key, value]);
  }

  pairs.sort((a, b) => {
    const ak = percentEncode(a[0]);
    const bk = percentEncode(b[0]);
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    const av = percentEncode(a[1]);
    const bv = percentEncode(b[1]);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });

  return pairs
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&');
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data) as BufferSource
  );
  const bytes = new Uint8Array(signature);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function signOAuth1(
  input: SignOAuth1Input
): Promise<SignOAuth1Result> {
  const method = input.method.toUpperCase();
  const url = new URL(input.url);
  const nonce = input.nonce ?? oauthNonce();
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: input.credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: input.credentials.token,
    oauth_version: '1.0',
  };

  const parameterString = collectParameterString(
    url,
    oauthParams,
    input.formParams
  );
  const signatureBaseString = [
    percentEncode(method),
    percentEncode(baseUrlOf(url)),
    percentEncode(parameterString),
  ].join('&');

  const signingKey = `${percentEncode(input.credentials.consumerSecret)}&${percentEncode(input.credentials.tokenSecret)}`;
  const signature = await hmacSha1Base64(signingKey, signatureBaseString);

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };
  const header = Object.keys(headerParams)
    .sort()
    .map(
      (key) =>
        `${percentEncode(key)}="${percentEncode(headerParams[key as keyof typeof headerParams])}"`
    )
    .join(', ');

  return {
    authorization: `OAuth ${header}`,
    signature,
    signatureBaseString,
    parameterString,
    signingKey,
    nonce,
    timestamp,
  };
}
