import test from 'node:test';
import assert from 'node:assert/strict';
import { MockBucket } from './mock-bucket.mjs';

// Load worker pnr module
import { readFileSync } from 'node:fs';
const pnrCode = readFileSync('worker/pnr.js', 'utf8');
const pnrModule = new Function(
  'Response',
  `${pnrCode}; return { maskPnr, pnrApi, reply };`
)(Response);

const { maskPnr, pnrApi } = pnrModule;

test('PNR Status Agent: Masking PNR', () => {
  assert.equal(maskPnr('1234567890'), '******7890');
  assert.equal(maskPnr('9876543210'), '******3210');
  assert.equal(maskPnr('123'), '******');
  assert.equal(maskPnr(''), '******');
});

test('PNR Status Agent: Validation of PNR input', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket, APIMITRA_API_KEY: 'test-key' };

  // Invalid PNR: non-digits
  const req1 = new Request('https://example.com/api/pnr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pnr: '12345ABCDE' })
  });
  const res1 = await pnrApi(req1, env, 'user-1');
  assert.equal(res1.status, 400);
  const data1 = await res1.json();
  assert.equal(data1.code, 'invalid_input');

  // Invalid PNR: length 9
  const req2 = new Request('https://example.com/api/pnr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pnr: '123456789' })
  });
  const res2 = await pnrApi(req2, env, 'user-1');
  assert.equal(res2.status, 400);
});

test('PNR Status Agent: Missing APIMITRA_API_KEY returns 503 with missing_credentials and preserves prior ticket', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket }; // no APIMITRA_API_KEY

  // Seed an existing ticket in bucket
  const priorTicket = {
    pnr: '1234567890',
    at: '2026-11-20T10:00:00.000Z',
    passengers: [{ passengerNumber: 1, currentStatus: 'CNF', coach: 'B1', berth: '12' }],
    source: 'apimitra',
    allConfirmed: true
  };
  await bucket.put('pnr/user-1/1234567890', JSON.stringify(priorTicket));

  const req = new Request('https://example.com/api/pnr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pnr: '1234567890' })
  });

  const res = await pnrApi(req, env, 'user-1');
  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.code, 'missing_credentials');
  assert.equal(data.preserved, true);
  assert.deepEqual(data.ticket, priorTicket);

  // Verify the stored record in bucket was not wiped or overwritten
  const inBucket = await bucket.get('pnr/user-1/1234567890');
  assert.deepEqual(await inBucket.json(), priorTicket);
});

test('PNR Status Agent: Mixed passenger statuses - verifies individual statuses, coach/berth, and allConfirmed=false', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket, APIMITRA_API_KEY: 'test-key' };

  // Mock global fetch to return API Mitra response with mixed passengers
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    return new Response(JSON.stringify({
      status: 'ok',
      pnr: '2345678901',
      train_name: 'Karnataka Express',
      train_number: '12628',
      chart_prepared: false,
      boarding_station: 'SBC',
      destination_station: 'NDLS',
      passengers: [
        { no: 1, current_status: 'CNF', booking_status: 'WL 12', coach: 'B2', berth: 15, berth_type: 'LB' },
        { no: 2, current_status: 'RAC 5', booking_status: 'WL 13', coach: 'B2', berth: 16, berth_type: 'SL' },
        { no: 3, current_status: 'WL 8', booking_status: 'WL 14', coach: '', berth: '', berth_type: '' }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const req = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '2345678901' })
    });
    const res = await pnrApi(req, env, 'user-1');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.allConfirmed, false); // Mixed status must NOT be allConfirmed
    assert.equal(data.ticket.passengers.length, 3);
    assert.equal(data.ticket.passengers[0].currentStatus, 'CNF');
    assert.equal(data.ticket.passengers[0].coach, 'B2');
    assert.equal(data.ticket.passengers[0].berth, '15');
    assert.equal(data.ticket.passengers[1].currentStatus, 'RAC 5');
    assert.equal(data.ticket.passengers[2].currentStatus, 'WL 8');
    assert.equal(data.ticket.chartPrepared, false);
    assert.equal(data.ticket.train, 'Karnataka Express');
    assert.equal(data.ticket.trainNumber, '12628');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PNR Status Agent: All confirmed rule is strictly enforced (current status only, never booking status or predictions)', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket, APIMITRA_API_KEY: 'test-key' };

  const originalFetch = globalThis.fetch;
  try {
    // Case A: Every passenger confirmed -> allConfirmed = true
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: 'ok',
      pnr: '3456789012',
      passengers: [
        { current_status: 'CNF', coach: 'A1', berth: 21 },
        { current_status: 'CONFIRMED', coach: 'A1', berth: 22 }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const reqA = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '3456789012' })
    });
    const resA = await pnrApi(reqA, env, 'user-1');
    const dataA = await resA.json();
    assert.equal(dataA.allConfirmed, true);

    // Case B: Booking status was CNF, but current status was CANCELLED / WL -> allConfirmed = false
    globalThis.fetch = async () => new Response(JSON.stringify({
      status: 'ok',
      pnr: '4567890123',
      passengers: [
        { booking_status: 'CNF', current_status: 'CAN' }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const reqB = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '4567890123' })
    });
    const resB = await pnrApi(reqB, env, 'user-1');
    const dataB = await resB.json();
    assert.equal(dataB.allConfirmed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PNR Status Agent: Failed lookup preserves previous result and reports specific error code', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket, APIMITRA_API_KEY: 'test-key' };

  const prior = {
    pnr: '5678901234',
    at: '2026-11-23T14:30:00.000Z',
    passengers: [{ passengerNumber: 1, currentStatus: 'CNF', coach: 'S3', berth: '40' }],
    source: 'apimitra',
    allConfirmed: true
  };
  await bucket.put('pnr/user-1/5678901234', JSON.stringify(prior));

  const originalFetch = globalThis.fetch;
  try {
    // 1. Rate limited (429)
    globalThis.fetch = async () => new Response('Rate limited', { status: 429 });
    const req1 = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '5678901234' })
    });
    const res1 = await pnrApi(req1, env, 'user-1');
    assert.equal(res1.status, 503);
    const data1 = await res1.json();
    assert.equal(data1.code, 'rate_limited');
    assert.equal(data1.preserved, true);
    assert.deepEqual(data1.ticket, prior);

    // 2. Provider rejection (401)
    globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
    const req2 = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '5678901234' })
    });
    const res2 = await pnrApi(req2, env, 'user-1');
    assert.equal(res2.status, 503);
    const data2 = await res2.json();
    assert.equal(data2.code, 'provider_rejection');
    assert.equal(data2.preserved, true);

    // 3. Provider outage (network error / timeout)
    globalThis.fetch = async () => { throw new Error('Timeout'); };
    const req3 = new Request('https://example.com/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr: '5678901234' })
    });
    const res3 = await pnrApi(req3, env, 'user-1');
    assert.equal(res3.status, 503);
    const data3 = await res3.json();
    assert.equal(data3.code, 'provider_outage');
    assert.equal(data3.preserved, true);

    // Previous record in storage remains untouched
    const stored = await (await bucket.get('pnr/user-1/5678901234')).json();
    assert.deepEqual(stored, prior);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PNR Status Agent: Manual status reporting (PUT)', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket };

  const req = new Request('https://example.com/api/pnr', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pnr: '6789012345',
      passengers: ['CNF', 'RAC 2'],
      train: 'Shatabdi Express',
      trainNumber: '12002'
    })
  });

  const res = await pnrApi(req, env, 'user-1');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.source, 'manual');
  assert.equal(data.ticket.source, 'manual');
  assert.equal(data.ticket.passengers.length, 2);
  assert.equal(data.ticket.passengers[0].currentStatus, 'CNF');
  assert.equal(data.ticket.passengers[1].currentStatus, 'RAC 2');
  assert.equal(data.allConfirmed, false);
});
