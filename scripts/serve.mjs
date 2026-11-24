import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import server from '../dist/server/index.js';

class LocalStorageBucket {
  constructor(filepath = '.local-storage.json') {
    this.filepath = filepath;
    this.store = new Map();
    if (existsSync(filepath)) {
      try {
        const data = JSON.parse(readFileSync(filepath, 'utf8'));
        for (const [k, v] of Object.entries(data)) {
          this.store.set(k, v);
        }
      } catch {}
    }
  }

  save() {
    const obj = {};
    for (const [k, v] of this.store.entries()) {
      obj[k] = v;
    }
    writeFileSync(this.filepath, JSON.stringify(obj, null, 2), 'utf8');
  }

  async get(key) {
    if (!this.store.has(key)) return null;
    const item = this.store.get(key);
    return {
      etag: item.etag,
      customMetadata: item.customMetadata || {},
      json: async () => JSON.parse(item.data),
      text: async () => item.data
    };
  }

  async put(key, data, options = {}) {
    const etag = Math.random().toString(36).slice(2);
    if (options.onlyIf?.etagMatches) {
      const existing = this.store.get(key);
      if (existing && existing.etag !== options.onlyIf.etagMatches) {
        return null;
      }
    }
    this.store.set(key, {
      data: String(data),
      etag,
      customMetadata: options.customMetadata || {}
    });
    this.save();
    return { etag };
  }

  async delete(key) {
    const res = this.store.delete(key);
    this.save();
    return res;
  }

  async head(key) {
    if (!this.store.has(key)) return null;
    const item = this.store.get(key);
    return { etag: item.etag, customMetadata: item.customMetadata || {} };
  }

  async list({ prefix = '', cursor } = {}) {
    const keys = Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
    const objects = keys.map(k => ({
      key: k,
      etag: this.store.get(k).etag,
      customMetadata: this.store.get(k).customMetadata || {}
    }));
    return { objects, truncated: false };
  }
}

const bucket = new LocalStorageBucket();

// Pre-seed local contact profile so user can immediately use the app
if (!bucket.store.has('contacts/local-user.json')) {
  bucket.put('contacts/local-user.json', JSON.stringify({
    email: 'passenger@railhandover.in',
    phone: '+919876543210'
  }));
}

// Pre-seed a sample journey if empty
if (!Array.from(bucket.store.keys()).some(k => k.startsWith('journeys/local-user/'))) {
  const sampleJourney = {
    kind: 'held',
    from: 'Bengaluru (SBC)',
    to: 'Mysuru (MYS)',
    date: '2026-11-28',
    pnr: '2345678901'
  };
  const recordStr = JSON.stringify(sampleJourney);
  bucket.put('journeys/local-user/sample-trip-1', recordStr, {
    customMetadata: {
      record: recordStr.replace(/[^\x20-\x7E]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
    }
  });

  bucket.put('pnr/local-user/2345678901', JSON.stringify({
    pnr: '2345678901',
    train: 'Kaviguru Express',
    trainNumber: '12658',
    from: 'Bengaluru (SBC)',
    to: 'Mysuru (MYS)',
    at: new Date().toISOString(),
    chartPrepared: false,
    allConfirmed: false,
    source: 'manual',
    passengers: [
      { passengerNumber: 1, currentStatus: 'CNF', bookingStatus: 'WL 12', coach: 'B2', berth: '23', berthType: 'LB' },
      { passengerNumber: 2, currentStatus: 'RAC 5', bookingStatus: 'WL 13', coach: 'B2', berth: '24', berthType: 'SL' }
    ]
  }));
}

const env = {
  BUCKET: bucket,
  APIMITRA_API_KEY: process.env.APIMITRA_API_KEY || ''
};

const PORT = process.env.PORT || 3000;

const app = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) {
        v.forEach(val => headers.append(k, val));
      } else if (v !== undefined) {
        headers.set(k, v);
      }
    }

    // Authenticate as local-user in local development
    if (!headers.has('oai-authenticated-user-id')) {
      headers.set('oai-authenticated-user-id', 'local-user');
    }
    if (!headers.has('oai-authenticated-user-email')) {
      headers.set('oai-authenticated-user-email', 'passenger@railhandover.in');
    }

    const webReq = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
      duplex: body ? 'half' : undefined
    });

    const webRes = await server.fetch(webReq, env);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.end('Internal Server Error: ' + err.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🚂 Rail Handover local server is live!`);
  console.log(`👉 Access URL: http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
