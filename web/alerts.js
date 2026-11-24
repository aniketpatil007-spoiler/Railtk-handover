const supported = 'Notification' in window && 'serviceWorker' in navigator;
const preference = 'rail-letter-alerts';
const registered = supported ? navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null) : Promise.resolve(null);

function alertsOn() {
  return supported && Notification.permission === 'granted' && localStorage.getItem(preference) === 'on';
}

function updateAlerts() {
  const btn = document.getElementById('alertsBtn');
  const state = document.getElementById('alertState');
  if (!btn || !state) return;

  btn.hidden = !supported || Notification.permission === 'denied';
  btn.textContent = alertsOn() ? 'Turn off alerts' : 'Enable browser alert';

  if (!supported) {
    state.textContent = 'Browser alerts not supported on this device.';
  } else if (Notification.permission === 'denied') {
    state.textContent = 'Notifications blocked in browser settings.';
  } else if (alertsOn()) {
    state.textContent = '✓ Alerts enabled for ready letters.';
  } else {
    state.textContent = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('alertsBtn');
  if (btn) {
    btn.onclick = async () => {
      if (alertsOn()) {
        localStorage.removeItem(preference);
      } else {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') localStorage.setItem(preference, 'on');
      }
      updateAlerts();
    };
  }
  updateAlerts();
});

async function triggerLetterNotification() {
  if (!alertsOn()) return;
  try {
    const reg = await registered;
    if (!reg) throw new Error();
    await reg.showNotification('Your request letter is ready!', {
      body: 'Review and print your Chief Reservation Supervisor letter in Rail Handover.',
      icon: '/favicon.svg',
      tag: 'rail-letter'
    });
  } catch {
    const state = document.getElementById('alertState');
    if (state) state.textContent = 'Your letter is ready to print.';
  }
}
