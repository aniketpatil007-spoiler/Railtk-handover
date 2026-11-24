// Find Trains & My Trips Manager
const bookingUrl = 'https://www.irctc.co.in/nget/train-search';

function formatIstDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(dt);
}

function initDateControls() {
  const dateInput = document.getElementById('searchDate');
  if (!dateInput) return;

  const nowIst = new Date(Date.now() + 19800000);
  const todayStr = nowIst.toISOString().slice(0, 10);
  dateInput.min = todayStr;
  if (!dateInput.value) {
    // Default to tomorrow in IST
    const tomorrowIst = new Date(Date.now() + 19800000 + 86400000);
    dateInput.value = tomorrowIst.toISOString().slice(0, 10);
  }

  const setOffset = (days) => {
    const target = new Date(Date.now() + 19800000 + days * 86400000);
    dateInput.value = target.toISOString().slice(0, 10);
  };

  const chipToday = document.getElementById('chipToday');
  const chipTomorrow = document.getElementById('chipTomorrow');
  const chipPlus7 = document.getElementById('chipPlus7');

  if (chipToday) chipToday.onclick = () => setOffset(0);
  if (chipTomorrow) chipTomorrow.onclick = () => setOffset(1);
  if (chipPlus7) chipPlus7.onclick = () => setOffset(7);

  // Swap stations button
  const swapBtn = document.getElementById('swapStationsBtn');
  if (swapBtn) {
    swapBtn.onclick = () => {
      const orig = document.getElementById('searchOrigin');
      const dest = document.getElementById('searchDestination');
      if (orig && dest) {
        const tmp = orig.value;
        orig.value = dest.value;
        dest.value = tmp;
      }
    };
  }

  // Toggle PNR field for held ticket
  const kindSelect = document.getElementById('searchKind');
  const heldPnrGroup = document.getElementById('heldPnrGroup');
  if (kindSelect && heldPnrGroup) {
    kindSelect.onchange = () => {
      heldPnrGroup.hidden = kindSelect.value !== 'held';
    };
  }
}

async function refreshJourneysList() {
  const container = document.getElementById('journeysList');
  const badge = document.getElementById('tripsBadge');
  if (!container) return;

  try {
    const [journeysRes, pnrRes] = await Promise.all([
      fetch('/api/journeys'),
      fetch('/api/pnr').catch(() => null)
    ]);

    if (!journeysRes.ok) throw new Error('Could not load journeys');
    const journeys = await journeysRes.json();
    const pnrChecks = new Map();

    if (pnrRes && pnrRes.ok) {
      const checks = await pnrRes.json().catch(() => []);
      for (const c of checks) {
        if (c.pnr) pnrChecks.set(c.pnr, c);
      }
    }

    if (badge) badge.textContent = journeys.length;
    container.replaceChildren();

    if (!journeys.length) {
      container.innerHTML = `
        <div style="text-align: center; padding: 32px 16px;">
          <p style="font-size: 16px; color: var(--text-muted); margin-bottom: 12px;">No trips saved yet.</p>
          <button type="button" class="btn secondary" onclick="switchTab('trains')">Search & Plan a Journey</button>
        </div>
      `;
      return;
    }

    for (const item of journeys) {
      const card = document.createElement('article');
      card.className = 'savedJourney';

      const pnrData = item.pnr ? pnrChecks.get(item.pnr) : null;
      const maskedPnr = item.pnr ? maskPnrClient(item.pnr) : null;

      // Header row: route and date
      const topRow = document.createElement('div');
      topRow.className = 'journey-top';

      const routeEl = document.createElement('div');
      routeEl.className = 'journey-route';
      routeEl.innerHTML = `${escapeHtml(item.from)} <span>➔</span> ${escapeHtml(item.to)}`;

      const datePill = document.createElement('div');
      datePill.className = 'journey-date';
      datePill.textContent = formatIstDate(item.date);

      topRow.append(routeEl, datePill);
      card.append(topRow);

      // Meta row: kind, PNR, train info
      const metaRow = document.createElement('div');
      metaRow.style.margin = '8px 0';
      metaRow.style.display = 'flex';
      metaRow.style.alignItems = 'center';
      metaRow.style.gap = '8px';
      metaRow.style.flexWrap = 'wrap';

      const kindBadge = document.createElement('span');
      kindBadge.className = 'badge';
      kindBadge.textContent = item.kind === 'held' ? 'Ticket I Hold' : 'Journey Request';
      metaRow.append(kindBadge);

      if (maskedPnr) {
        const pnrBadge = document.createElement('span');
        pnrBadge.className = 'journey-pnr';
        pnrBadge.textContent = `PNR ${maskedPnr}`;
        metaRow.append(pnrBadge);
      }

      if (pnrData?.train) {
        const trainBadge = document.createElement('span');
        trainBadge.style.fontSize = '12px';
        trainBadge.style.color = 'var(--text-muted)';
        trainBadge.textContent = pnrData.trainNumber ? `${pnrData.trainNumber} - ${pnrData.train}` : pnrData.train;
        metaRow.append(trainBadge);
      }
      card.append(metaRow);

      // Passenger statuses section
      if (item.kind === 'held') {
        const passBox = document.createElement('div');
        passBox.className = 'journey-passengers';

        if (pnrData?.passengers?.length) {
          const allCnf = pnrData.passengers.every(p => {
            const s = typeof p === 'string' ? p : p.currentStatus;
            return /^(CNF|CONFIRMED)(?:$|[ /-])/i.test(s);
          });

          const timeStr = formatIstClient(pnrData.at);
          const srcLabel = pnrData.source === 'manual' ? 'Reported status · Entered by you' : 'API Mitra';

          let passHtml = `
            <div style="font-weight: 600; margin-bottom: 6px; display: flex; justify-content: space-between; flex-wrap: wrap;">
              <span style="color: ${allCnf ? 'var(--cnf-text)' : 'var(--text)'};">
                ${allCnf ? '✓ All passengers confirmed' : 'Latest Passenger Statuses'}:
              </span>
              <span style="font-size: 11px; font-weight: 400; color: var(--text-muted);">
                Checked: ${timeStr} · ${srcLabel}
              </span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          `;

          pnrData.passengers.forEach((p, idx) => {
            const pNum = typeof p === 'object' && p.passengerNumber ? p.passengerNumber : (idx + 1);
            const cur = typeof p === 'object' ? p.currentStatus : p;
            const coach = typeof p === 'object' && p.coach ? ` (${p.coach}${p.berth ? ' ' + p.berth : ''})` : '';

            let pill = 'cnf';
            if (/^RAC/i.test(cur)) pill = 'rac';
            else if (/^(WL|WAIT|CAN)/i.test(cur)) pill = 'wl';

            passHtml += `<span class="status-pill ${pill}">P${pNum}: ${cur}${coach}</span>`;
          });
          passHtml += `</div>`;
          passBox.innerHTML = passHtml;
        } else if (item.pnr) {
          passBox.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">PNR linked. Click "Check Status" below to retrieve live status.</span>';
        } else {
          passBox.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">No PNR linked to this ticket yet.</span>';
        }
        card.append(passBox);
      }

      // Inline notice for live checking feedback
      const notice = document.createElement('p');
      notice.setAttribute('role', 'status');
      notice.style.fontSize = '13px';
      notice.style.margin = '4px 0';
      card.append(notice);

      // Actions row
      const actions = document.createElement('div');
      actions.className = 'journey-actions';

      if (item.kind === 'held') {
        const checkBtn = document.createElement('button');
        checkBtn.type = 'button';
        checkBtn.className = 'btn secondary';
        checkBtn.style.padding = '6px 14px';
        checkBtn.style.fontSize = '13px';
        checkBtn.textContent = 'Check Status';
        checkBtn.onclick = async () => {
          let pnr = item.pnr;
          if (!pnr) {
            pnr = prompt('Enter the 10-digit PNR for this ticket:');
            if (!pnr || !/^\d{10}$/.test(pnr.trim())) {
              notice.textContent = 'A valid 10-digit PNR is required.';
              return;
            }
            pnr = pnr.trim();
            // Link PNR
            const patchRes = await fetch(`/api/journeys/${item.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pnr })
            });
            if (!patchRes.ok) {
              notice.textContent = 'Could not link PNR. Refresh and retry.';
              return;
            }
            item.pnr = pnr;
          }

          checkBtn.disabled = true;
          notice.textContent = 'Checking live status with API Mitra…';
          try {
            const res = await fetch('/api/pnr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pnr })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ticket) {
              notice.textContent = '✓ Status updated.';
              await refreshJourneysList();
            } else {
              let reason = data.message || 'Lookup failed.';
              if (data.preserved) {
                notice.textContent = `Notice: ${reason} Previous status preserved.`;
              } else {
                notice.textContent = `Notice: ${reason}`;
              }
            }
          } catch {
            notice.textContent = 'Network error while checking status.';
          } finally {
            checkBtn.disabled = false;
          }
        };

        const handoverBtn = document.createElement('button');
        handoverBtn.type = 'button';
        handoverBtn.className = 'btn';
        handoverBtn.style.padding = '6px 14px';
        handoverBtn.style.fontSize = '13px';
        handoverBtn.textContent = 'Prepare Family Name-Change Request';
        handoverBtn.onclick = () => {
          prefillFamilyHandoverFromTicket({
            pnr: item.pnr || '',
            from: item.from,
            to: item.to,
            date: item.date,
            trainNumber: pnrData?.trainNumber || '',
            train: pnrData?.train || '',
            passengers: pnrData?.passengers || []
          });
        };

        actions.append(checkBtn, handoverBtn);
      } else {
        const irctcBtn = document.createElement('a');
        irctcBtn.href = bookingUrl;
        irctcBtn.target = '_blank';
        irctcBtn.rel = 'noopener noreferrer';
        irctcBtn.className = 'btn secondary';
        irctcBtn.style.padding = '6px 14px';
        irctcBtn.style.fontSize = '13px';
        irctcBtn.textContent = 'Check Seats on IRCTC ↗';
        actions.append(irctcBtn);
      }

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn outline';
      removeBtn.style.padding = '6px 12px';
      removeBtn.style.fontSize = '12px';
      removeBtn.style.color = '#c62828';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = async () => {
        removeBtn.disabled = true;
        try {
          const res = await fetch(`/api/journeys/${item.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error();
          await refreshJourneysList();
        } catch {
          removeBtn.disabled = false;
          notice.textContent = 'Could not remove trip. Try again.';
        }
      };

      actions.append(removeBtn);
      card.append(actions);
      container.append(card);
    }
  } catch (err) {
    container.innerHTML = '<p style="color: #c62828; font-size: 14px;">Could not load saved trips. Refresh to try again.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDateControls();

  const form = document.getElementById('trainsForm');
  const msg = document.getElementById('trainsMessage');
  const saveBtn = document.getElementById('saveTripBtn');

  if (form) {
    form.onsubmit = async e => {
      e.preventDefault();
      saveBtn.disabled = true;
      msg.textContent = 'Saving journey…';

      const kind = document.getElementById('searchKind').value;
      const from = document.getElementById('searchOrigin').value.trim();
      const to = document.getElementById('searchDestination').value.trim();
      const date = document.getElementById('searchDate').value;
      const pnrInput = document.getElementById('searchPnr');
      const pnr = (kind === 'held' && pnrInput) ? pnrInput.value.trim() : undefined;

      try {
        const body = { kind, from, to, date };
        if (pnr && /^\d{10}$/.test(pnr)) body.pnr = pnr;

        const res = await fetch('/api/journeys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          msg.textContent = res.status === 400 ? await res.text() : 'Could not save journey.';
          return;
        }

        msg.textContent = kind === 'held' ? '✓ Held ticket saved privately.' : '✓ Journey request saved.';
        await refreshJourneysList();

        // If PNR was provided, trigger an automatic check for this PNR in the background
        if (pnr && /^\d{10}$/.test(pnr)) {
          fetch('/api/pnr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pnr })
          }).then(() => refreshJourneysList()).catch(() => {});
        }

        // Switch to My Trips tab to show the saved trip
        setTimeout(() => switchTab('trips'), 500);
      } catch {
        msg.textContent = 'Network error while saving journey.';
      } finally {
        saveBtn.disabled = false;
      }
    };
  }

  const refreshBtn = document.getElementById('refreshTripsBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => refreshJourneysList();
  }

  refreshJourneysList();
});
