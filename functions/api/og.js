// OG image generation — proxies to external or returns placeholder
// @resvg/resvg-js WASM needs special CF Workers setup
export async function onRequest({ request }) {
  // For now, return the static OG image
  const imageRes = await fetch('https://shieldedsol.com/og-base.png');
  return new Response(imageRes.body, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }
  });
}
