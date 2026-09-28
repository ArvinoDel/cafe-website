/**
 * lib/audio.ts
 *
 * Lightweight Web Audio API helper for notification sounds.
 * No external files or dependencies — generates sounds programmatically.
 * Zero bundle weight added beyond this single module.
 */

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

/**
 * Unlock the AudioContext. Must be called from a user-gesture event handler
 * (e.g., a button click) before any sounds can be played in modern browsers.
 */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {/* ignore */});
  }
}

/**
 * Play a short, pleasant two-tone order notification chime.
 * Silently does nothing if the AudioContext isn't available or is suspended
 * (i.e., the user hasn't clicked the "Aktifkan Suara" button yet).
 */
export function playOrderChime(): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;

  // Two ascending tones: 880 Hz → 1108 Hz (musical A5 → C#6)
  const tones: { freq: number; start: number; duration: number }[] = [
    { freq: 880,  start: now + 0.0, duration: 0.18 },
    { freq: 1108, start: now + 0.2, duration: 0.28 },
  ];

  for (const { freq, start, duration } of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    // Soft attack + quick decay → no click artefacts
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + duration + 0.01);
  }
}
