const EVENT_TYPES = new Set(['cow_view', 'favorite', 'mission_complete', 'product_view', 'list_add', 'checkout_intent', 'shop_outbound']);

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, analytics: Boolean(env.DB) });

    if (url.pathname === '/api/events') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (request.headers.get('Origin') !== url.origin) return json({ error: 'Origin rejected' }, 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Body required' }, 400);
      let byteLength = 0;
      const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > 1024) {
          await reader.cancel();
          return json({ error: 'Payload too large' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let data;
      try {
        data = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
      if (!data || !EVENT_TYPES.has(data.type) || typeof data.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(data.id) || !['A', 'B', 'C'].includes(data.variant)) {
        return json({ error: 'Invalid event' }, 400);
      }
      if (!env.DB) return json({ stored: false, reason: 'analytics_not_configured' }, 202);
      try {
        await env.DB.prepare('INSERT INTO events (event_type, entity_id, variant) VALUES (?, ?, ?)').bind(data.type, data.id, data.variant).run();
        return json({ stored: true }, 201);
      } catch {
        return json({ stored: false, error: 'analytics_unavailable' }, 503);
      }
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const response = await env.ASSETS.fetch(request);
    const secured = new Response(response.body, response);
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    secured.headers.set('X-Frame-Options', 'SAMEORIGIN');
    secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    secured.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
    if (/\.(json|html)$/.test(url.pathname) || url.pathname === '/') secured.headers.set('Cache-Control', 'no-cache');
    return secured;
  }
};
