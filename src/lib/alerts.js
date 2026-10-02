// Attention-getters for incoming orders: an optional desktop notification and a short beep.
// Both are best-effort — browsers gate them behind permission / a prior user gesture.

export const desktopAlertsSupported = () => typeof Notification !== 'undefined';
export const desktopAlertsEnabled = () => desktopAlertsSupported() && Notification.permission === 'granted';

export async function enableDesktopAlerts() {
  if (!desktopAlertsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function notifyDesktop(title, body) {
  if (!desktopAlertsEnabled() || document.hasFocus()) return; // no need to notify someone who is looking
  try { new Notification(title, { body, tag: 'others-order' }); } catch { /* ignore */ }
}

let ctx;
export function beep() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* audio not available */ }
}
