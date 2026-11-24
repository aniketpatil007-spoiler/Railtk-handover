function storeJourney(bucket, key, data, options = {}) {
  return bucket.put(key, JSON.stringify(data), {
    ...options,
    customMetadata: {
      record: JSON.stringify(data).replace(/[^\x20-\x7E]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    }
  });
}

function escapeHtml(v) {
  return String(v || '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

const workerHandler = {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (path === '/style.css') return reply(files['style.css'], 'text/css');

    const id = req.headers.get('oai-authenticated-user-id');
    const email = req.headers.get('oai-authenticated-user-email');
    if (!id || !email) {
      return Response.redirect(url.origin + '/signin-with-chatgpt?return_to=%2F', 302);
    }

    const key = 'contacts/' + encodeURIComponent(id) + '.json';
    const form = (msg = '', status = 200) => reply(
      files['profile.html'].replace('EMAIL_VALUE', () => escapeHtml(email)).replace('FORM_MESSAGE', msg),
      'text/html',
      status
    );

    if (req.method === 'POST' && path === '/profile') {
      if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) {
        return reply('Invalid origin', 'text/plain', 403);
      }
      const data = await req.formData();
      const phone = String(data.get('phone') || '').replace(/[ ()-]/g, '');
      if (String(data.get('email') || '').trim().toLowerCase() !== email.toLowerCase()) {
        return form('Enter the email used to sign in.', 400);
      }
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        return form('Include the country code, for example +91 followed by your 10-digit number.', 400);
      }
      await env.BUCKET.put(key, JSON.stringify({ email, phone }));
      return Response.redirect(url.origin + '/', 303);
    }

    if (path === '/api/pnr') {
      if (!await env.BUCKET.head(key)) return reply('Complete your profile', 'text/plain', 403);
      return pnrApi(req, env, id);
    }

    if (path === '/api/journeys' || path.startsWith('/api/journeys/')) {
      if (!await env.BUCKET.head(key)) return reply('Complete your profile', 'text/plain', 403);
      const prefix = 'journeys/' + encodeURIComponent(id) + '/';

      if (path === '/api/journeys' && req.method === 'GET') {
        let cursor;
        const items = [];
        do {
          const page = await env.BUCKET.list({ prefix, cursor, include: ['customMetadata'] });
          items.push(...page.objects.map(o => {
            const parsed = o.customMetadata?.record ? JSON.parse(o.customMetadata.record) : {};
            return { ...parsed, id: o.key.slice(prefix.length) };
          }));
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return reply(JSON.stringify(items.sort((a, b) => (a.date || '').localeCompare(b.date || ''))), 'application/json');
      }

      if (req.headers.get('origin') && req.headers.get('origin') !== url.origin) {
        return reply('Invalid origin', 'text/plain', 403);
      }

      if (path === '/api/journeys' && req.method === 'POST') {
        const d = await req.json().catch(() => null);
        const validStation = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 80;
        const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
        if (!d || !['held', 'wanted'].includes(d.kind) || !validStation(d.from) || !validStation(d.to) ||
            d.from.trim().toLowerCase() === d.to.trim().toLowerCase() ||
            typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date < today ||
            !Number.isFinite(Date.parse(d.date)) || new Date(d.date).toISOString().slice(0, 10) !== d.date) {
          return reply('Enter two different stations and a valid journey date.', 'text/plain', 400);
        }
        const data = { kind: d.kind, from: d.from.trim(), to: d.to.trim(), date: d.date };
        if (d.kind === 'held' && typeof d.pnr === 'string' && /^\d{10}$/.test(d.pnr.trim())) {
          data.pnr = d.pnr.trim();
        }
        await storeJourney(env.BUCKET, prefix + crypto.randomUUID(), data);
        return reply('Saved', 'text/plain', 201);
      }

      const match = path.match(/^\/api\/journeys\/([a-f0-9-]{36})$/);
      if (match && req.method === 'PATCH') {
        const body = await req.json().catch(() => null);
        if (typeof body?.pnr !== 'string' || !/^\d{10}$/.test(body.pnr.trim())) {
          return reply('Enter a 10-digit PNR.', 'text/plain', 400);
        }
        const journeyKey = prefix + match[1];
        const record = await env.BUCKET.get(journeyKey);
        if (!record) return reply('Ticket not found.', 'text/plain', 404);
        const ticket = await record.json();
        if (ticket.kind !== 'held') return reply('Choose a ticket you hold.', 'text/plain', 400);
        ticket.pnr = body.pnr.trim();
        const saved = await storeJourney(env.BUCKET, journeyKey, ticket, { onlyIf: { etagMatches: record.etag } });
        return saved ? reply('Linked', 'text/plain') : reply('Ticket changed. Refresh and retry.', 'text/plain', 409);
      }

      if (match && req.method === 'DELETE') {
        const journeyKey = prefix + match[1];
        const record = await env.BUCKET.get(journeyKey);
        if (!record) return reply('Ticket not found.', 'text/plain', 404);
        await env.BUCKET.delete(journeyKey);
        return reply('Removed', 'text/plain');
      }

      return reply('Method unavailable', 'text/plain', 405);
    }

    if (req.method !== 'GET') return reply('Method unavailable', 'text/plain', 405);
    if (path === '/profile') return form();
    if (!await env.BUCKET.head(key)) {
      return (path === '/' || path === '/pnr') ? form() : reply('Complete your contact details.', 'text/plain', 403);
    }
    if (path === '/pnr') return reply(files['pnr.html']);
    if (path === '/pnr.js') return reply(files['pnr.js'], 'text/javascript');
    if (path === '/') return reply(files['index.html']);
    if (['/rules.js', '/app.js', '/alerts.js', '/sw.js', '/journeys.js'].includes(path)) {
      return reply(files[path.slice(1)], 'text/javascript');
    }
    return reply('Page not found', 'text/plain', 404);
  }
};

export default workerHandler;
if (typeof module !== 'undefined') {
  module.exports = { workerHandler, storeJourney, escapeHtml };
}
