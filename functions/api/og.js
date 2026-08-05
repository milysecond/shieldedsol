// Legacy Pages Functions OG — keep in sync with dynamic /api/og design.
// Do NOT serve the old static og-base.png card.
export async function onRequest() {
  const imageRes = await fetch(
    'https://www.shieldedsol.com/api/og?v=20260805b',
    { headers: { 'Cache-Control': 'no-cache' } }
  );
  if (!imageRes.ok) {
    return new Response('OG unavailable', { status: 502 });
  }
  return new Response(imageRes.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=120',
    },
  });
}
