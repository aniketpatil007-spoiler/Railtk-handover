import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, family, parseIstDate } from '../web/rules.js';

test('Family Handover: Qualifying relationships', () => {
  const expectedFamily = ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Husband', 'Wife'];
  assert.deepEqual(family, expectedFamily);

  for (const rel of expectedFamily) {
    const res = assess('Confirmed', rel, '2026-11-30T10:00', Date.parse('2026-11-28T10:00+05:30'));
    assert.equal(res.eligible, true, `Expected ${rel} to be eligible`);
  }

  // Ineligible relationships
  for (const nonRel of ['Friend', 'Colleague', 'Cousin', 'Uncle', 'In-Law', 'Other']) {
    const res = assess('Confirmed', nonRel, '2026-11-30T10:00', Date.parse('2026-11-28T10:00+05:30'));
    assert.equal(res.eligible, false);
    assert.ok(res.reasons.some(r => r.includes('direct family members')));
  }
});

test('Family Handover: Confirmed status check', () => {
  const departure = '2026-11-30T10:00';
  const now = Date.parse('2026-11-28T10:00+05:30');

  // Confirmed variations
  assert.equal(assess('Confirmed', 'Brother', departure, now).eligible, true);
  assert.equal(assess('CNF', 'Brother', departure, now).eligible, true);
  assert.equal(assess('CNF / B2 / 23', 'Brother', departure, now).eligible, true);

  // RAC and Waitlisted
  const racRes = assess('RAC', 'Brother', departure, now);
  assert.equal(racRes.eligible, false);
  assert.ok(racRes.reasons.some(r => r.includes('confirmed reservations')));

  const wlRes = assess('Waitlisted', 'Brother', departure, now);
  assert.equal(wlRes.eligible, false);
  assert.ok(wlRes.reasons.some(r => r.includes('confirmed reservations')));

  const wlNumRes = assess('WL 12', 'Brother', departure, now);
  assert.equal(wlNumRes.eligible, false);
});

test('Family Handover: 24-hour deadline in IST calculation', () => {
  // Departure: 2026-11-30 at 18:00 IST
  const depStr = '2026-11-30T18:00';
  const depTime = parseIstDate(depStr);
  const deadline = depTime - 86400000; // 2026-11-29 18:00 IST

  // Test A: Current time is 25 hours before departure (1 hour before deadline) -> ELIGIBLE
  const nowA = depTime - (25 * 3600000);
  const resA = assess('Confirmed', 'Sister', depStr, nowA);
  assert.equal(resA.eligible, true);
  assert.equal(resA.deadline, deadline);

  // Test B: Current time is exactly 24 hours before departure (at deadline) -> ELIGIBLE
  const nowB = deadline;
  const resB = assess('Confirmed', 'Sister', depStr, nowB);
  assert.equal(resB.eligible, true);

  // Test C: Current time is 23 hours before departure (1 hour past deadline) -> BLOCKED
  const nowC = depTime - (23 * 3600000);
  const resC = assess('Confirmed', 'Sister', depStr, nowC);
  assert.equal(resC.eligible, false);
  assert.ok(resC.reasons.some(r => r.includes('24-hour submission deadline')));
});

test('Family Handover: Prior name change rule (allowed only once per ticket)', () => {
  const departure = '2026-11-30T10:00';
  const now = Date.parse('2026-11-28T10:00+05:30');

  // First request -> eligible
  assert.equal(assess('Confirmed', 'Mother', departure, now, { priorChange: 'no' }).eligible, true);

  // Previously changed -> blocked
  const res = assess('Confirmed', 'Mother', departure, now, { priorChange: 'yes' });
  assert.equal(res.eligible, false);
  assert.ok(res.reasons.some(r => r.includes('only once per ticket')));
});

test('Family Handover: Booking circumstances check', () => {
  const departure = '2026-11-30T10:00';
  const now = Date.parse('2026-11-28T10:00+05:30');

  // Regular booking -> eligible
  assert.equal(assess('Confirmed', 'Father', departure, now, { circumstances: 'regular' }).eligible, true);

  // Special concessions / quotas -> flagged for direct staff review
  const res = assess('Confirmed', 'Father', departure, now, { circumstances: 'special' });
  assert.equal(res.eligible, false);
  assert.ok(res.reasons.some(r => r.includes('regular full-fare tickets')));
});
