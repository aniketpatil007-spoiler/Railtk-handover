import test from 'node:test';
import assert from 'node:assert/strict';
import { MockBucket } from './mock-bucket.mjs';
import server from '../dist/server/index.js';

test('Cross-Account Security: Complete profile requirement', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket };

  // Request from uncompleted profile
  const req = new Request('https://example.com/api/journeys', {
    headers: {
      'oai-authenticated-user-id': 'user-no-profile',
      'oai-authenticated-user-email': 'noprofile@example.com'
    }
  });

  const res = await server.fetch(req, env);
  assert.equal(res.status, 403);
});

test('Cross-Account Security: User B cannot access, modify, or delete User A journeys', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket };

  const userAHeaders = {
    'oai-authenticated-user-id': 'user-A',
    'oai-authenticated-user-email': 'userA@example.com',
    'origin': 'https://example.com'
  };
  const userBHeaders = {
    'oai-authenticated-user-id': 'user-B',
    'oai-authenticated-user-email': 'userB@example.com',
    'origin': 'https://example.com'
  };

  // Seed profiles for both users
  await bucket.put('contacts/user-A.json', JSON.stringify({ email: 'userA@example.com', phone: '+919876543210' }));
  await bucket.put('contacts/user-B.json', JSON.stringify({ email: 'userB@example.com', phone: '+919876543211' }));

  // User A creates a journey
  const createReqA = new Request('https://example.com/api/journeys', {
    method: 'POST',
    headers: { ...userAHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'held',
      from: 'Bengaluru (SBC)',
      to: 'Mysuru (MYS)',
      date: '2026-12-05',
      pnr: '1234567890'
    })
  });
  const createResA = await server.fetch(createReqA, env);
  assert.equal(createResA.status, 201);

  // User A lists journeys and gets the journey ID
  const listReqA = new Request('https://example.com/api/journeys', { headers: userAHeaders });
  const listResA = await server.fetch(listReqA, env);
  assert.equal(listResA.status, 200);
  const journeysA = await listResA.json();
  assert.equal(journeysA.length, 1);
  const journeyIdA = journeysA[0].id;
  assert.ok(journeyIdA);

  // User B lists journeys -> must NOT see User A's journey!
  const listReqB = new Request('https://example.com/api/journeys', { headers: userBHeaders });
  const listResB = await server.fetch(listReqB, env);
  assert.equal(listResB.status, 200);
  const journeysB = await listResB.json();
  assert.equal(journeysB.length, 0); // Completely empty for User B!

  // User B attempts to PATCH User A's journey -> 404 Not Found
  const patchReqB = new Request(`https://example.com/api/journeys/${journeyIdA}`, {
    method: 'PATCH',
    headers: { ...userBHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pnr: '9999999999' })
  });
  const patchResB = await server.fetch(patchReqB, env);
  assert.equal(patchResB.status, 404);

  // Verify User A's journey was NOT changed by User B's attempt
  const listResAAfter = await server.fetch(new Request('https://example.com/api/journeys', { headers: userAHeaders }), env);
  const journeysAAfter = await listResAAfter.json();
  assert.equal(journeysAAfter[0].pnr, '1234567890');

  // User B attempts to DELETE User A's journey -> 404 Not Found
  const deleteReqB = new Request(`https://example.com/api/journeys/${journeyIdA}`, {
    method: 'DELETE',
    headers: userBHeaders
  });
  const deleteResB = await server.fetch(deleteReqB, env);
  assert.equal(deleteResB.status, 404);

  // Verify User A's journey still exists
  const listResAEnd = await server.fetch(new Request('https://example.com/api/journeys', { headers: userAHeaders }), env);
  assert.equal((await listResAEnd.json()).length, 1);
});

test('Cross-Account Security: User B cannot access User A PNR status records', async () => {
  const bucket = new MockBucket();
  const env = { BUCKET: bucket };

  const userAHeaders = {
    'oai-authenticated-user-id': 'user-A',
    'oai-authenticated-user-email': 'userA@example.com',
    'origin': 'https://example.com'
  };
  const userBHeaders = {
    'oai-authenticated-user-id': 'user-B',
    'oai-authenticated-user-email': 'userB@example.com',
    'origin': 'https://example.com'
  };

  await bucket.put('contacts/user-A.json', JSON.stringify({ email: 'userA@example.com', phone: '+919876543210' }));
  await bucket.put('contacts/user-B.json', JSON.stringify({ email: 'userB@example.com', phone: '+919876543211' }));

  // User A puts a PNR check
  await bucket.put('pnr/user-A/1122334455', JSON.stringify({
    pnr: '1122334455',
    passengers: [{ currentStatus: 'CNF' }],
    at: new Date().toISOString()
  }));

  // User B queries PNR list -> User A's PNR is not returned
  const reqB = new Request('https://example.com/api/pnr', { headers: userBHeaders });
  const resB = await server.fetch(reqB, env);
  assert.equal(resB.status, 200);
  const pnrsB = await resB.json();
  assert.equal(pnrsB.length, 0);

  // User A queries PNR list -> User A's PNR is returned
  const reqA = new Request('https://example.com/api/pnr', { headers: userAHeaders });
  const resA = await server.fetch(reqA, env);
  assert.equal(resA.status, 200);
  const pnrsA = await resA.json();
  assert.equal(pnrsA.length, 1);
  assert.equal(pnrsA[0].pnr, '1122334455');
});
