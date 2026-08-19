/** Shared protocol slug helpers (client + server safe) */

export function slugifyProtocol(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function matchProtocolName(
  protocols: { name: string }[],
  key: string
): string | null {
  const raw = (() => {
    try {
      return decodeURIComponent(key).trim();
    } catch {
      return key.trim();
    }
  })();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const slug = slugifyProtocol(raw);
  const hit = protocols.find(
    (p) =>
      p.name === raw ||
      p.name.toLowerCase() === lower ||
      slugifyProtocol(p.name) === slug ||
      slugifyProtocol(p.name) === lower
  );
  return hit?.name || null;
}

export function protocolDeepLink(name: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined'
      ? window.location.origin
      : 'https://www.shieldedsol.com');
  return `${base}/p/${slugifyProtocol(name)}`;
}
