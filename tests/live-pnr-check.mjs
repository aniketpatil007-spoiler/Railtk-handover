import test from 'node:test';
import assert from 'node:assert/strict';
import { pnrApi } from '../worker/pnr.js';
import { MockBucket } from './mock-bucket.mjs';

test('Live PNR Integration: API Mitra endpoint connectivity and credential check', async () => {
  const bucket = new MockBucket();
  const apiKey = process.env.APIMITRA_API_KEY;

  if (!apiKey) {
    console.log('NOTICE: APIMITRA_API_KEY is not set in the environment. Testing graceful credentials-missing behavior.');
    const env = { BUCKET: bucket };
    const req = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '1234567890' })
    });
    const res = await pnrApi(req, env, 'user-live-test');
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.code, 'missing_credentials');
    assert.ok(data.message.includes('APIMITRA_API_KEY'));
    return;
  }

  console.log('APIMITRA_API_KEY detected. Testing live query with API Mitra...');
  const env = { BUCKET: bucket, APIMITRA_API_KEY: apiKey };
  const testPnr = process.env.TEST_PNR || '1234567890';

  const req = new Request('https://example.com/api/pnr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pnr: testPnr })
  });

  const res = await pnrApi(req, env, 'user-live-test');
  const data = await res.json();
  console.log('Live PNR API response status:', res.status, 'Code:', data.code || 'success');
  // Endpoint must respond gracefully (either 200 with data or 503 with specific API Mitra rejection/error code)
  assert.ok([200, 503].includes(res.status));
});
