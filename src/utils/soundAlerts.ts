/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AlertSoundType = 'notification' | 'mandatory' | 'overdue' | 'chat' | 'info';

const SOUND_ENABLED_KEY = 'eta_crm_sound_alerts_v1';

let sharedAudioCtx: AudioContext | null = null;
let listenersAttached = false;
let pendingSound: AlertSoundType | null = null;
let lastPlayedAt = 0;

const PRIORITY: Record<AlertSoundType, number> = {
  info: 1,
  chat: 2,
  notification: 3,
  overdue: 4,
  mandatory: 5,
};

export function isSoundAlertsEnabled(): boolean {
  try {
    const val = localStorage.getItem(SOUND_ENABLED_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

export function setSoundAlertsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage limits
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function attachUnlockListeners(): void {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  const unlockAndFlush = async () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (ctx.state === 'running' && pendingSound) {
      const queued = pendingSound;
      pendingSound = null;
      playTonePattern(ctx, queued);
    }
  };

  const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'click'];
  events.forEach((ev) => {
    window.addEventListener(ev, unlockAndFlush, { passive: true });
  });
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume: number,
  waveType: OscillatorType = 'sine'
) {
  const start = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = waveType;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playTonePattern(ctx: AudioContext, type: AlertSoundType): void {
  try {
    if (type === 'chat') {
      scheduleTone(ctx, 880, 0, 0.14, 0.08, 'sine');
      scheduleTone(ctx, 1174.66, 0.1, 0.2, 0.09, 'sine');
      return;
    }

    if (type === 'info') {
      scheduleTone(ctx, 783.99, 0, 0.14, 0.07, 'sine');
      scheduleTone(ctx, 987.77, 0.11, 0.22, 0.08, 'sine');
      return;
    }

    if (type === 'notification') {
      // Crisp 2-tone administrative bell
      scheduleTone(ctx, 1046.5, 0, 0.16, 0.11, 'triangle');
      scheduleTone(ctx, 1318.51, 0.13, 0.26, 0.12, 'sine');
      return;
    }

    if (type === 'overdue') {
      // Distinct double warning pulse for +72h alerts
      scheduleTone(ctx, 698.46, 0, 0.14, 0.12, 'triangle');
      scheduleTone(ctx, 880, 0.13, 0.16, 0.12, 'triangle');
      scheduleTone(ctx, 698.46, 0.34, 0.14, 0.12, 'triangle');
      scheduleTone(ctx, 987.77, 0.47, 0.26, 0.13, 'triangle');
      return;
    }

    if (type === 'mandatory') {
      // Urgent 3-tone chime for mandatory staff notices
      scheduleTone(ctx, 880, 0, 0.16, 0.13, 'triangle');
      scheduleTone(ctx, 1108.73, 0.14, 0.18, 0.13, 'triangle');
      scheduleTone(ctx, 1318.51, 0.28, 0.34, 0.14, 'sine');
    }
  } catch {
    // Ignore audio context edge errors
  }
}

export function playAlertSound(type: AlertSoundType = 'notification'): void {
  if (!isSoundAlertsEnabled()) return;
  attachUnlockListeners();

  const now = Date.now();
  // Prevent overlapping rapid-fire chimes within 450ms unless higher priority
  if (now - lastPlayedAt < 450 && (!pendingSound || PRIORITY[type] <= PRIORITY[pendingSound])) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    if (!pendingSound || PRIORITY[type] > PRIORITY[pendingSound]) {
      pendingSound = type;
    }
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running' && pendingSound) {
          const toPlay = pendingSound;
          pendingSound = null;
          lastPlayedAt = Date.now();
          playTonePattern(ctx, toPlay);
        }
      })
      .catch(() => {
        // Will auto-flush on next user gesture via attachUnlockListeners
      });
    return;
  }

  lastPlayedAt = now;
  playTonePattern(ctx, type);
}
