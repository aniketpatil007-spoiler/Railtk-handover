// Main Application & Family Handover Assistant Controller

const $ = id => document.getElementById(id);
const officialRulesUrl = 'https://er.indianrailways.gov.in/offerings/schemes-and-services/preview/373';
const officialCancelUrl = 'https://contents.irctc.co.in/en/Eticket_new_cancel.html';

function escapeHtml(v) {
  return String(v || '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatIstFull(t) {
  if (!t || !Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(t) + ' IST';
}

// Tab Switching
function switchTab(tabId) {
  const tabs = ['trains', 'pnr', 'trips', 'handover'];
  if (!tabs.includes(tabId)) tabId = 'trains';

  tabs.forEach(t => {
    const sec = $(`section-${t}`);
    if (sec) sec.hidden = (t !== tabId);
  });

  // Update desktop tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  // Update mobile bottom nav
  document.querySelectorAll('.mobile-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  if (window.location.hash !== `#${tabId}`) {
    history.replaceState(null, '', `#${tabId}`);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Prefill Family Handover from a ticket (saved trip or PNR check)
function prefillFamilyHandoverFromTicket(ticket) {
  switchTab('handover');

  const banner = $('handoverPrefillBanner');
  if (banner) {
    const pnrStr = ticket.pnr ? `PNR: ${maskPnrClient(ticket.pnr)}` : '';
    const routeStr = (ticket.from && ticket.to) ? `${ticket.from} ➔ ${ticket.to}` : '';
    banner.innerHTML = `<strong>Ticket Selected for Family Handover:</strong> ${routeStr} ${pnrStr}. Select the passenger and check eligibility below.`;
    banner.hidden = false;
  }

  if (ticket.pnr) $('hoPnr').value = ticket.pnr;
  if (ticket.trainNumber) $('hoTrain').value = ticket.trainNumber;
  if (ticket.from) $('hoFrom').value = ticket.from;
  if (ticket.to) $('hoTo').value = ticket.to;

  if (ticket.date) {
    // If date provided e.g. YYYY-MM-DD, set default departure time 10:00 AM
    $('hoDep').value = `${ticket.date}T10:00`;
  }

  // Passenger selection if multiple passengers exist
  const passGroup = $('hoPassengerGroup');
  const passSelect = $('hoPassengerSelect');
  if (ticket.passengers && ticket.passengers.length) {
    passSelect.replaceChildren();
    ticket.passengers.forEach((p, idx) => {
      const pNum = typeof p === 'object' && p.passengerNumber ? p.passengerNumber : (idx + 1);
      const cur = typeof p === 'object' ? p.currentStatus : p;
      const opt = new Option(`Passenger ${pNum} (${cur})`, cur);
      opt.dataset.index = idx;
      passSelect.add(opt);
    });

    passSelect.onchange = () => {
      const selectedStatus = passSelect.value;
      if (/^CNF/i.test(selectedStatus)) $('hoStatus').value = 'Confirmed';
      else if (/^RAC/i.test(selectedStatus)) $('hoStatus').value = 'RAC';
      else $('hoStatus').value = 'Waitlisted';
      invalidateEligibility();
    };

    // Initialize with first passenger status
    const firstStatus = passSelect.value;
    if (/^CNF/i.test(firstStatus)) $('hoStatus').value = 'Confirmed';
    else if (/^RAC/i.test(firstStatus)) $('hoStatus').value = 'RAC';
    else if (firstStatus) $('hoStatus').value = 'Waitlisted';

    passGroup.hidden = false;
  } else {
    passGroup.hidden = true;
  }

  invalidateEligibility();
  $('hoStatus').focus();
}

function invalidateEligibility() {
  $('hoEligibilityResult').replaceChildren();
  $('hoCreateAction').hidden = true;
  $('hoLetterDetailsCard').hidden = true;
  $('hoLetterCard').hidden = true;
}

function runEligibilityCheck() {
  const status = $('hoStatus').value;
  const relation = $('hoRelation').value;
  const dep = $('hoDep').value;
  const priorChange = $('hoPriorChange').value;
  const circumstances = $('hoCircumstances').value;

  const result = assess(status, relation, dep, Date.now(), { priorChange, circumstances });
  const container = $('hoEligibilityResult');
  container.replaceChildren();

  if (!result.eligible) {
    const errorCard = document.createElement('div');
    errorCard.className = 'error-box';

    let html = '<strong>Eligibility Check: Request Blocked</strong><ul style="padding-left: 20px; margin: 8px 0;">';
    result.reasons.forEach(r => {
      html += `<li>${escapeHtml(r)}</li>`;
    });
    html += '</ul>';

    if (Number.isFinite(result.deadline)) {
      html += `<p style="font-size: 13px; margin: 4px 0;">Calculated submission deadline: ${formatIstFull(result.deadline)}.</p>`;
    }

    html += `<div style="margin-top: 8px;">
      <a href="${officialRulesUrl}" target="_blank" rel="noopener noreferrer" style="font-weight: 600; color: #9b1c1c;">Indian Railways Name-Change Guidelines ↗</a> ·
      <a href="${officialCancelUrl}" target="_blank" rel="noopener noreferrer" style="color: #9b1c1c;">IRCTC Cancellation Policy ↗</a>
    </div>`;

    errorCard.innerHTML = html;
    container.append(errorCard);
    $('hoCreateAction').hidden = true;
    $('hoLetterDetailsCard').hidden = true;
    $('hoLetterCard').hidden = true;
    return false;
  }

  // Eligible!
  const successCard = document.createElement('div');
  successCard.className = 'status-banner confirmed';
  successCard.style.display = 'block';

  let successHtml = `
    <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px;">
      ✓ Eligible to apply for Family Name Change!
    </div>
    <div style="font-size: 14px; font-weight: 500;">
      Your request meets Indian Railways Rule 229 criteria (confirmed reservation & eligible family relationship).
    </div>
    <div style="margin-top: 8px; font-size: 14px; font-weight: 600; background: rgba(255,255,255,0.7); padding: 8px 12px; border-radius: 6px;">
      Submission Deadline: ${formatIstFull(result.deadline)} (At least 24 hours prior to train departure).
    </div>
  `;

  successCard.innerHTML = successHtml;
  container.append(successCard);

  $('hoCreateAction').hidden = false;
  return true;
}

function generateLetter() {
  const pnr = $('hoPnr').value.trim();
  const train = $('hoTrain').value.trim();
  const from = $('hoFrom').value.trim();
  const to = $('hoTo').value.trim();
  const depStr = $('hoDep').value;
  const depTime = parseIstDate(depStr);
  const depFormatted = Number.isFinite(depTime) ? formatIstFull(depTime) : depStr;
  const deadline = Number.isFinite(depTime) ? depTime - 86400000 : null;

  const originalPassenger = $('hoOriginalName').value.trim();
  const proposedPassenger = $('hoProposedName').value.trim();
  const relationship = $('hoRelation').value;
  const proofDoc = $('hoProofDoc').value;
  const phone = $('hoPhone').value.trim() || '__________________';

  const todayIst = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'long'
  }).format(new Date());

  const letter = `Date: ${todayIst}

To,
The Chief Reservation Supervisor
Railway Reservation Office / PRS Centre
${from} Railway Station

Subject: Application for transfer of confirmed reservation under Indian Railways Commercial Rule 229

Respected Sir/Madam,

I, ${originalPassenger}, am holding a confirmed reservation on Indian Railways with the following particulars:

  PNR Number:          ${pnr}
  Train Number:        ${train}
  Journey Route:       ${from} to ${to}
  Scheduled Departure: ${depFormatted}

Due to unavoidable personal circumstances, I am unable to travel on this reservation. In accordance with Indian Railways Commercial Rule 229 permitting transfer of a confirmed ticket to a direct family member (blood relation / spouse), I respectfully request you to transfer this ticket in the name of my ${relationship.toLowerCase()}, ${proposedPassenger}.

I enclose herewith the necessary supporting documents for your verification:
  1. Printout of the Electronic Reservation Slip (ERS) / Ticket
  2. Copy of my Government Photo ID
  3. Copy of Government Photo ID of ${proposedPassenger}
  4. Document establishing family relationship: ${proofDoc}

I confirm that no prior name-change has been granted on this reservation and that this request is made in good faith without any commercial transfer or resale.

Kindly grant permission for this name change and update the passenger records.

Thanking you.

Yours faithfully,


________________________________________
(Signature of Original Passenger)
Name:           ${originalPassenger}
Mobile Number:  ${phone}
Address:        ________________________________________
`;

  $('letterText').value = letter;
  if (deadline) {
    $('hoDeadlineNotice').textContent = `Deadline: Submit this signed application at the reservation counter before ${formatIstFull(deadline)}.`;
  }

  $('hoLetterCard').hidden = false;
  $('hoLetterCard').scrollIntoView({ behavior: 'smooth' });

  // Trigger opt-in browser alert
  if (typeof triggerLetterNotification === 'function') {
    triggerLetterNotification();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Populate relationships dropdown
  const relSelect = $('hoRelation');
  if (relSelect) {
    const list = ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Husband', 'Wife', 'Friend', 'Other'];
    list.forEach(rel => relSelect.add(new Option(rel, rel)));
  }

  // Tab buttons click listeners
  document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    };
  });

  // Handle URL hash on load or change
  const initialHash = window.location.hash.replace('#', '');
  if (['trains', 'pnr', 'trips', 'handover'].includes(initialHash)) {
    switchTab(initialHash);
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['trains', 'pnr', 'trips', 'handover'].includes(hash)) {
      switchTab(hash);
    }
  });

  // Eligibility form
  const eligForm = $('eligibilityForm');
  if (eligForm) {
    eligForm.oninput = invalidateEligibility;
    eligForm.onsubmit = e => {
      e.preventDefault();
      runEligibilityCheck();
    };
  }

  // Start Letter Button
  const startLetterBtn = $('startLetterBtn');
  if (startLetterBtn) {
    startLetterBtn.onclick = () => {
      $('hoLetterDetailsCard').hidden = false;
      $('hoLetterDetailsCard').scrollIntoView({ behavior: 'smooth' });
      $('hoOriginalName').focus();
    };
  }

  // Letter details form
  const letterForm = $('letterDetailsForm');
  if (letterForm) {
    letterForm.onsubmit = e => {
      e.preventDefault();
      generateLetter();
    };
  }

  // Print button
  const printBtn = $('printLetterBtn');
  if (printBtn) {
    printBtn.onclick = () => {
      const letterContent = $('letterText').value;
      if (!letterContent.trim()) {
        alert('Please generate the request letter first.');
        return;
      }
      $('paper').textContent = letterContent;
      window.print();
    };
  }

  // Clear data button
  const clearBtn = $('clearDataBtn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm('Clear all form entries and reset the assistant?')) {
        document.querySelectorAll('form').forEach(f => f.reset());
        invalidateEligibility();
        $('handoverPrefillBanner').hidden = true;
        $('pnrResultCard').hidden = true;
        $('pnrAlertBox').hidden = true;
        $('paper').textContent = '';
      }
    };
  }
});
