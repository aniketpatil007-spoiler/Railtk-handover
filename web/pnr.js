// PNR Status Agent Frontend
function maskPnrClient(pnr) {
  if (!pnr || typeof pnr !== 'string') return '******';
  const clean = pnr.trim();
  if (clean.length <= 4) return '******';
  return '******' + clean.slice(-4);
}

function formatIstClient(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d) + ' IST';
}

function explainPnrStatus(ticket) {
  if (!ticket?.passengers?.length) return 'Awaiting passenger status details.';
  const passengers = ticket.passengers.map(p => typeof p === 'string' ? { currentStatus: p } : p);
  const total = passengers.length;
  const confirmedCount = passengers.filter(p => /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(p.currentStatus)).length;
  const racCount = passengers.filter(p => /^RAC(?:$|[ /-])/i.test(p.currentStatus)).length;
  const wlCount = passengers.filter(p => /^(WL|WAIT|PQWL|RLWL|RSWL)(?:$|[ /-])/i.test(p.currentStatus)).length;

  if (confirmedCount === total) {
    return 'All passengers confirmed. Berths are allocated. Coach and berth details are shown above.';
  }
  if (racCount === total) {
    return 'All passengers are on RAC (Reservation Against Cancellation). Passengers are permitted to board with shared seating; berths may be upgraded if cancellations occur.';
  }
  if (wlCount === total) {
    return 'All passengers are currently Waitlisted. This ticket does not permit boarding unless upgraded to RAC or Confirmed before chart preparation.';
  }
  return `Mixed passenger status: ${confirmedCount} Confirmed, ${racCount} RAC, ${wlCount} Waitlisted. Note: Booking statuses or predictions are never treated as confirmation.`;
}

async function loadPnrHistory() {
  const container = document.getElementById('savedPnrChecksList');
  if (!container) return;
  try {
    const res = await fetch('/api/pnr');
    if (!res.ok) throw new Error();
    const tickets = await res.json();
    container.replaceChildren();

    if (!tickets.length) {
      container.innerHTML = '<p style="font-size: 14px; color: var(--text-muted);">No PNR checks saved yet. Enter a 10-digit PNR above to check.</p>';
      return;
    }

    for (const t of tickets) {
      const card = document.createElement('div');
      card.className = 'savedJourney';
      card.style.padding = '14px';

      const masked = maskPnrClient(t.pnr);
      const train = t.train ? (t.trainNumber ? `${t.trainNumber} - ${t.train}` : t.train) : 'Train details';
      const time = formatIstClient(t.at);

      const header = document.createElement('div');
      header.className = 'journey-top';
      header.innerHTML = `<strong>PNR ${masked} · ${train}</strong><span style="font-size: 12px; color: var(--text-muted);">${time}</span>`;
      card.append(header);

      const passList = document.createElement('div');
      passList.className = 'journey-passengers';

      const allCnf = t.passengers?.length && t.passengers.every(p => {
        const s = typeof p === 'string' ? p : p.currentStatus;
        return /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(s);
      });

      const srcLabel = t.source === 'manual' ? 'Reported status · Entered by you' : 'API Mitra';
      passList.innerHTML = `<div style="font-weight: 600; margin-bottom: 4px; color: ${allCnf ? 'var(--cnf-text)' : 'var(--text)'};">
        ${allCnf ? '✓ All passengers confirmed' : 'Passenger Statuses'} (${srcLabel}):
      </div>`;

      t.passengers.forEach((p, idx) => {
        const pNum = typeof p === 'object' && p.passengerNumber ? p.passengerNumber : (idx + 1);
        const cur = typeof p === 'object' ? p.currentStatus : p;
        const coach = typeof p === 'object' && p.coach ? ` · Coach ${p.coach}` : '';
        const berth = typeof p === 'object' && p.berth ? ` · Berth ${p.berth}` : '';
        const row = document.createElement('div');
        row.style.fontSize = '13px';
        row.textContent = `Passenger ${pNum}: ${cur}${coach}${berth}`;
        passList.append(row);
      });
      card.append(passList);

      const actions = document.createElement('div');
      actions.className = 'journey-actions';

      const recheckBtn = document.createElement('button');
      recheckBtn.type = 'button';
      recheckBtn.className = 'btn secondary';
      recheckBtn.style.padding = '6px 12px';
      recheckBtn.style.fontSize = '12px';
      recheckBtn.textContent = 'Check Again';
      recheckBtn.onclick = () => performPnrLookup(t.pnr);

      const handoverBtn = document.createElement('button');
      handoverBtn.type = 'button';
      handoverBtn.className = 'btn outline';
      handoverBtn.style.padding = '6px 12px';
      handoverBtn.style.fontSize = '12px';
      handoverBtn.textContent = 'Family Handover';
      handoverBtn.onclick = () => prefillFamilyHandoverFromTicket(t);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn outline';
      deleteBtn.style.padding = '6px 12px';
      deleteBtn.style.fontSize = '12px';
      deleteBtn.style.color = '#c62828';
      deleteBtn.textContent = 'Remove';
      deleteBtn.onclick = async () => {
        deleteBtn.disabled = true;
        try {
          await fetch('/api/pnr', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pnr: t.pnr })
          });
          await loadPnrHistory();
        } catch {
          deleteBtn.disabled = false;
        }
      };

      actions.append(recheckBtn, handoverBtn, deleteBtn);
      card.append(actions);
      container.append(card);
    }
  } catch {
    container.innerHTML = '<p style="color: #c62828; font-size: 14px;">Could not load PNR checks. Refresh page to try again.</p>';
  }
}

function renderPnrResult(ticket, isPreserved = false, preserveNotice = '') {
  const card = document.getElementById('pnrResultCard');
  if (!card || !ticket) return;

  const masked = maskPnrClient(ticket.pnr);
  document.getElementById('resPnrNumber').textContent = `PNR ${masked}`;

  const trainStr = ticket.train ? (ticket.trainNumber ? `${ticket.trainNumber} - ${ticket.train}` : ticket.train) : 'Indian Railways';
  document.getElementById('resTrainTitle').textContent = trainStr;

  const routeStr = (ticket.from && ticket.to) ? `${ticket.from} ➔ ${ticket.to}` : '';
  document.getElementById('resRoute').textContent = routeStr;

  const chartEl = document.getElementById('resChartStatus');
  if (typeof ticket.chartPrepared === 'boolean') {
    chartEl.hidden = false;
    chartEl.className = 'status-pill ' + (ticket.chartPrepared ? 'cnf' : 'rac');
    chartEl.textContent = ticket.chartPrepared ? 'Chart Prepared' : 'Chart Not Prepared';
  } else {
    chartEl.hidden = true;
  }

  // Passenger Rows
  const tbody = document.getElementById('resPassengerRows');
  tbody.replaceChildren();

  const passengers = (ticket.passengers || []).map((p, i) => {
    if (typeof p === 'string') return { passengerNumber: i + 1, currentStatus: p };
    return p;
  });

  passengers.forEach((p, idx) => {
    const tr = document.createElement('tr');
    const pNum = p.passengerNumber || (idx + 1);
    const cur = p.currentStatus || 'Unknown';
    let pillClass = 'cnf';
    if (/^RAC/i.test(cur)) pillClass = 'rac';
    else if (/^(WL|WAIT|CAN)/i.test(cur)) pillClass = 'wl';

    const coachBerth = [p.coach ? `Coach ${p.coach}` : '', p.berth ? `Berth ${p.berth} ${p.berthType ? '(' + p.berthType + ')' : ''}` : ''].filter(Boolean).join(', ') || '—';
    const booking = p.bookingStatus || '—';

    tr.innerHTML = `
      <td><strong>Passenger ${pNum}</strong></td>
      <td><span class="status-pill ${pillClass}">${cur}</span></td>
      <td>${coachBerth}</td>
      <td style="color: var(--text-muted);">${booking}</td>
    `;
    tbody.append(tr);
  });

  // Overall status banner
  const banner = document.getElementById('resStatusBanner');
  const allCnf = passengers.length > 0 && passengers.every(p => /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(p.currentStatus));
  const allRac = passengers.length > 0 && passengers.every(p => /^RAC(?:$|[ /-])/i.test(p.currentStatus));
  const allWl = passengers.length > 0 && passengers.every(p => /^(WL|WAIT)/i.test(p.currentStatus));

  if (allCnf) {
    banner.className = 'status-banner confirmed';
    banner.textContent = '✓ All passengers confirmed · Berths Allocated';
  } else if (allRac) {
    banner.className = 'status-banner rac';
    banner.textContent = '⏳ Reservation Against Cancellation (RAC) · Eligible to board';
  } else if (allWl) {
    banner.className = 'status-banner waitlisted';
    banner.textContent = '⚠️ Waitlisted · Reservation is not confirmed for travel';
  } else {
    banner.className = 'status-banner mixed';
    banner.textContent = 'ℹ Mixed Passenger Reservation Status';
  }

  // Explanation
  const expBox = document.getElementById('resAgentExplanation');
  expBox.innerHTML = `<strong>PNR Status Agent Summary:</strong><p style="margin: 4px 0 0;">${explainPnrStatus(ticket)}</p>`;
  if (isPreserved && preserveNotice) {
    expBox.innerHTML += `<p style="margin: 6px 0 0; color: #8c5200; font-weight: 600;">${preserveNotice}</p>`;
  }

  // Metadata
  const srcLabel = ticket.source === 'manual' ? 'Reported status · Entered by you' : 'API Mitra';
  const timeStr = formatIstClient(ticket.at);
  document.getElementById('resMetadata').textContent = `Data source: ${srcLabel} · Last checked: ${timeStr}`;

  // Action button
  const toHandoverBtn = document.getElementById('resToHandoverBtn');
  if (toHandoverBtn) {
    toHandoverBtn.onclick = () => prefillFamilyHandoverFromTicket(ticket);
  }

  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function performPnrLookup(pnrToLookup) {
  const input = document.getElementById('pnrInput');
  const btn = document.getElementById('pnrSubmitBtn');
  const feedback = document.getElementById('pnrFeedback');
  const alertBox = document.getElementById('pnrAlertBox');
  const alertMsg = document.getElementById('pnrAlertMessage');

  const pnr = (pnrToLookup || input.value || '').trim();
  if (!/^\d{10}$/.test(pnr)) {
    if (feedback) feedback.textContent = 'Enter a valid 10-digit PNR.';
    if (input) input.focus();
    return;
  }

  if (input) input.value = pnr;
  if (btn) btn.disabled = true;
  if (feedback) feedback.textContent = 'Checking live status with API Mitra…';
  if (alertBox) alertBox.hidden = true;

  try {
    const res = await fetch('/api/pnr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pnr })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ticket) {
      if (feedback) feedback.textContent = '✓ Status retrieved successfully.';
      renderPnrResult(data.ticket, false);
      await loadPnrHistory();
    } else {
      // Lookup failed: explain why and preserve prior result if available
      let reasonText = data.message || 'Live lookup unavailable.';
      if (data.code === 'missing_credentials') {
        reasonText = 'Automatic lookup needs an API Mitra key (APIMITRA_API_KEY server secret). Check on official Indian Railways enquiry and save the result here.';
      } else if (data.code === 'provider_rejection') {
        reasonText = 'API Mitra rejected the configured API key (401/403). Please verify credentials or use official Indian Railways enquiry.';
      } else if (data.code === 'rate_limited') {
        reasonText = 'API Mitra lookup limit reached (429). Please retry shortly or use official Indian Railways enquiry.';
      } else if (data.code === 'provider_outage') {
        reasonText = 'API Mitra service is temporarily unreachable or timed out. Use official Indian Railways enquiry.';
      }

      if (data.preserved && data.ticket) {
        if (alertBox && alertMsg) {
          alertMsg.innerHTML = `<strong>Lookup Notice:</strong> ${reasonText}<br><span style="font-weight: normal;">Previous result from ${formatIstClient(data.ticket.at)} is preserved below.</span>`;
          alertBox.hidden = false;
        }
        renderPnrResult(data.ticket, true, `Previous status from ${formatIstClient(data.ticket.at)} preserved.`);
      } else {
        if (alertBox && alertMsg) {
          alertMsg.innerHTML = `<strong>Lookup Failed:</strong> ${reasonText}`;
          alertBox.hidden = false;
        }
      }
      if (feedback) feedback.textContent = 'Lookup could not complete.';
    }
  } catch (err) {
    if (alertBox && alertMsg) {
      alertMsg.textContent = 'Could not reach server. Check network connection and retry.';
      alertBox.hidden = false;
    }
    if (feedback) feedback.textContent = 'Network error.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pnrForm');
  if (form) {
    form.onsubmit = e => {
      e.preventDefault();
      performPnrLookup();
    };
  }

  const manualBtn = document.getElementById('saveManualBtn');
  if (manualBtn) {
    manualBtn.onclick = async () => {
      const input = document.getElementById('pnrInput');
      const pnr = input.value.trim();
      if (!/^\d{10}$/.test(pnr)) {
        alert('Enter a 10-digit PNR above first.');
        input.focus();
        return;
      }
      const textarea = document.getElementById('manualStatuses');
      const statuses = textarea.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (!statuses.length) {
        alert('Enter at least one passenger status (e.g. CNF B4 23 or RAC 2).');
        textarea.focus();
        return;
      }

      manualBtn.disabled = true;
      try {
        const res = await fetch('/api/pnr', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pnr, passengers: statuses })
        });
        const data = await res.json();
        if (res.ok && data.ticket) {
          renderPnrResult(data.ticket, false);
          document.getElementById('manualDetails').open = false;
          textarea.value = '';
          await loadPnrHistory();
        } else {
          alert(data.message || 'Could not save manual status.');
        }
      } catch {
        alert('Could not save manual status.');
      } finally {
        manualBtn.disabled = false;
      }
    };
  }

  loadPnrHistory();
});
