export async function onRequest({ request }) {
  const url = new URL(request.url);
  const size = parseInt(url.searchParams.get('size') || '192');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#0ea5e9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="${size*0.4}">🛡️</text></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}
