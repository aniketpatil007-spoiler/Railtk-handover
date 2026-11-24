function maskPnr(pnr) {
  if (!pnr || typeof pnr !== 'string') return '******';
  const clean = pnr.trim();
  if (clean.length <= 4) return '******';
  return '******' + clean.slice(-4);
}

function reply(body, type = 'text/html', status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': type + '; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

async function pnrApi(req, env, userId) {
  const prefix = 'pnr/' + encodeURIComponent(userId) + '/';
  const json = (data, status = 200) => reply(JSON.stringify(data), 'application/json', status);

  if (req.method === 'GET') {
    const items = [];
    let cursor;
    do {
      const page = await env.BUCKET.list({ prefix, cursor });
      const batch = await Promise.all(page.objects.map(async o => {
        const record = await env.BUCKET.get(o.key);
        return record ? record.json() : null;
      }));
      items.push(...batch.filter(Boolean));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return json(items.sort((a, b) => (b.at || '').localeCompare(a.at || '')));
  }

  if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) {
    return json({ message: 'Invalid origin.' }, 403);
  }

  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return json({ message: 'Method unavailable.' }, 405);
  }

  const input = await req.json().catch(() => null);
  if (typeof input?.pnr !== 'string' || !/^\d{10}$/.test(input.pnr.trim())) {
    return json({ message: 'Enter a 10-digit PNR.', code: 'invalid_input' }, 400);
  }

  const pnr = input.pnr.trim();
  const key = prefix + pnr;

  // Retrieve any existing record for this PNR to preserve on lookup failure
  const existingRecord = await env.BUCKET.get(key);
  const previousTicket = existingRecord ? await existingRecord.json().catch(() => null) : null;

  if (req.method === 'DELETE') {
    await env.BUCKET.delete(key);
    return json({ message: 'Ticket removed.' });
  }

  if (req.method === 'PUT') {
    // Manual status reporting
    if (!Array.isArray(input.passengers) || !input.passengers.length || input.passengers.length > 12) {
      return json({ message: 'Enter one current status per passenger, up to 12 passengers.', code: 'invalid_input' }, 400);
    }

    const passengers = input.passengers.map((p, i) => {
      if (typeof p === 'string') {
        return {
          passengerNumber: i + 1,
          currentStatus: p.trim().slice(0, 80),
          bookingStatus: '',
          coach: '',
          berth: '',
          berthType: ''
        };
      }
      return {
        passengerNumber: p.passengerNumber || p.no || (i + 1),
        currentStatus: String(p.currentStatus || p.current_status || p.status || '').trim().slice(0, 80),
        bookingStatus: String(p.bookingStatus || p.booking_status || '').trim().slice(0, 80),
        coach: String(p.coach || p.current_coach || '').trim().slice(0, 20),
        berth: String(p.berth || p.current_berth || p.berth_number || '').trim().slice(0, 20),
        berthType: String(p.berthType || p.berth_type || '').trim().slice(0, 20)
      };
    });

    if (!passengers.every(p => p.currentStatus)) {
      return json({ message: 'Each passenger must have a valid current status.', code: 'invalid_input' }, 400);
    }

    const allConfirmed = passengers.length > 0 && passengers.every(p => /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(p.currentStatus));

    const item = {
      pnr,
      at: new Date().toISOString(),
      passengers,
      source: 'manual',
      train: typeof input.train === 'string' ? input.train.slice(0, 100) : (previousTicket?.train || ''),
      trainNumber: typeof input.trainNumber === 'string' && /^\d{5}$/.test(input.trainNumber) ? input.trainNumber : (previousTicket?.trainNumber || ''),
      from: typeof input.from === 'string' ? input.from.slice(0, 80) : (previousTicket?.from || ''),
      to: typeof input.to === 'string' ? input.to.slice(0, 80) : (previousTicket?.to || ''),
      chartPrepared: typeof input.chartPrepared === 'boolean' ? input.chartPrepared : previousTicket?.chartPrepared,
      allConfirmed
    };

    await env.BUCKET.put(key, JSON.stringify(item));
    return json({ message: 'Reported status saved.', ticket: item, source: 'manual', allConfirmed });
  }

  // POST: Automatic lookup via API Mitra
  if (!env.APIMITRA_API_KEY) {
    return json({
      message: 'Automatic lookup needs an API Mitra key (APIMITRA_API_KEY server secret). Check on official Indian Railways enquiry and save the result here.',
      code: 'missing_credentials',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  let response;
  try {
    response = await fetch('https://api.apimitra.in/train/pnr?number=' + encodeURIComponent(pnr), {
      headers: { 'x-api-key': env.APIMITRA_API_KEY },
      redirect: 'error',
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    return json({
      message: 'API Mitra connection timed out or is temporarily unavailable. Previous status preserved. Check on Indian Railways enquiry.',
      code: 'provider_outage',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  if (response.status === 401 || response.status === 403) {
    return json({
      message: 'API Mitra rejected the configured API key. Please verify credentials or use Indian Railways enquiry.',
      code: 'provider_rejection',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  if (response.status === 429) {
    return json({
      message: 'API Mitra lookup limit reached. Please retry shortly or use Indian Railways enquiry.',
      code: 'rate_limited',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  if (!response.ok) {
    return json({
      message: 'API Mitra returned an error (' + response.status + '). Previous status preserved. Check on Indian Railways enquiry.',
      code: 'provider_outage',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return json({
      message: 'API Mitra returned an unreadable response. Previous status preserved. Check on Indian Railways enquiry.',
      code: 'provider_outage',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  const rawPassengers = Array.isArray(data?.passengers) ? data.passengers : [];
  if ((data.status !== 'ok' && !data.success && !rawPassengers.length) || String(data.pnr || pnr) !== pnr) {
    return json({
      message: data?.error || data?.message || 'API Mitra could not find data for this PNR. Check on Indian Railways enquiry.',
      code: 'provider_error',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  if (!rawPassengers.length) {
    return json({
      message: 'API Mitra returned no passenger records for this PNR. Check on Indian Railways enquiry.',
      code: 'provider_error',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  const passengers = rawPassengers.map((p, i) => {
    if (typeof p === 'string') {
      return {
        passengerNumber: i + 1,
        currentStatus: p.trim().slice(0, 80),
        bookingStatus: '',
        coach: '',
        berth: '',
        berthType: ''
      };
    }
    return {
      passengerNumber: p.no || p.passengerNumber || (i + 1),
      currentStatus: String(p.current_status || p.currentStatus || p.status || '').trim().slice(0, 80),
      bookingStatus: String(p.booking_status || p.bookingStatus || '').trim().slice(0, 80),
      coach: String(p.coach || p.current_coach || '').trim().slice(0, 20),
      berth: String(p.berth || p.current_berth || p.berth_number || '').trim().slice(0, 20),
      berthType: String(p.berth_type || p.berthType || '').trim().slice(0, 20)
    };
  });

  if (!passengers.every(p => p.currentStatus)) {
    return json({
      message: 'Passenger status information is incomplete from provider. Check on Indian Railways enquiry.',
      code: 'provider_error',
      ticket: previousTicket,
      preserved: !!previousTicket
    }, 503);
  }

  // All passengers confirmed rule: only true if EVERY passenger current status is Confirmed
  const allConfirmed = passengers.length > 0 && passengers.every(p => /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(p.currentStatus));

  const trainName = String(data.train_name || data.trainName || previousTicket?.train || '').slice(0, 100);
  const trainNum = String(data.train_number || data.trainNumber || previousTicket?.trainNumber || '');

  const item = {
    pnr,
    at: new Date().toISOString(),
    passengers,
    source: 'apimitra',
    train: trainName,
    trainNumber: /^\d{5}$/.test(trainNum) ? trainNum : (previousTicket?.trainNumber || ''),
    from: String(data.boarding_station || data.from || previousTicket?.from || '').slice(0, 80),
    to: String(data.destination_station || data.to || previousTicket?.to || '').slice(0, 80),
    chartPrepared: typeof data.chart_prepared === 'boolean' ? data.chart_prepared : (typeof data.chartPrepared === 'boolean' ? data.chartPrepared : previousTicket?.chartPrepared),
    allConfirmed
  };

  await env.BUCKET.put(key, JSON.stringify(item));
  return json({
    message: 'Ticket status retrieved and saved.',
    ticket: item,
    allConfirmed
  });
}

if (typeof module !== 'undefined') {
  module.exports = { pnrApi, maskPnr, reply };
}
