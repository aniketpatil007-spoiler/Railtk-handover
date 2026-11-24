const family = ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Husband', 'Wife'];

function parseIstDate(departure) {
  if (!departure) return NaN;
  if (typeof departure === 'number') return departure;
  const str = String(departure).trim();
  // If string has format YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss without timezone offset, append IST offset (+05:30)
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?$/.test(str)) {
    return Date.parse(str + '+05:30');
  }
  return Date.parse(str);
}

function assess(status, relationship, departure, now, options = {}) {
  const reasons = [];
  const depTime = parseIstDate(departure);
  const deadline = Number.isFinite(depTime) ? depTime - 86400000 : NaN;

  // 1. Confirmed reservation check: Only confirmed reservations are eligible
  const isConfirmed = /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(String(status || '').trim());
  if (!isConfirmed) {
    reasons.push('Indian Railways allows family name changes only on confirmed reservations. RAC and Waitlisted tickets are not eligible.');
  }

  // 2. Qualifying relationship check
  if (!family.includes(relationship)) {
    reasons.push('The family-transfer rule covers only direct family members (Father, Mother, Brother, Sister, Son, Daughter, Husband, Wife). Friends and other relatives are not eligible.');
  }

  // 3. 24-hour deadline before scheduled departure in IST
  if (!Number.isFinite(depTime) || !Number.isFinite(deadline)) {
    reasons.push('Please enter a valid scheduled departure date and time.');
  } else if (now > deadline) {
    reasons.push('The 24-hour submission deadline before train departure has passed.');
  }

  // 4. Prior name change check: Allowed only once per ticket
  if (options.priorChange === 'yes' || options.priorChange === true) {
    reasons.push('A name change is permitted only once per ticket under Indian Railways regulations.');
  }

  // 5. Booking circumstances check: Regular full-fare vs special concessions
  if (options.circumstances === 'no' || options.circumstances === 'special') {
    reasons.push('This process covers first requests for regular full-fare tickets. Contact the reservation office about concession, quota, or special bookings.');
  }

  return {
    deadline,
    depTime,
    isConfirmed,
    reasons,
    eligible: reasons.length === 0
  };
}

if (typeof module !== 'undefined') {
  module.exports = { family, assess, parseIstDate };
}
