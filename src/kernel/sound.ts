import { getSettings } from "./settings";
import type { SoundKind } from "./types";

export type Tone = SoundKind | "ring" | "alarm";
/** [frequency (0 = noise), start s, duration s, waveform] — synthesized so the OS ships no audio files. */
type Note = [number, number, number, OscillatorType?];

const TONES: Record<Tone, Note[]> = {
  click: [[1800, 0, 0.015]],
  tick: [[1200, 0, 0.01]],
  notify: [[880, 0, 0.12], [1320, 0.12, 0.22]],
  shutter: [[0, 0, 0.05], [0, 0.07, 0.06]],
  error: [[220, 0, 0.15, "square"], [180, 0.15, 0.2, "square"]],
  success: [[660, 0, 0.1], [990, 0.1, 0.16]],
  start: [[600, 0, 0.08], [900, 0.09, 0.12]],
  stop: [[900, 0, 0.08], [600, 0.09, 0.12]],
  lock: [[700, 0, 0.05], [460, 0.06, 0.08]],
  unlock: [[460, 0, 0.05], [800, 0.06, 0.08]],
  ring: [[523, 0, 0.18], [659, 0.2, 0.18], [784, 0.4, 0.18], [1047, 0.6, 0.35]],
  alarm: [[1046, 0, 0.12, "triangle"], [1046, 0.2, 0.12, "triangle"], [1046, 0.4, 0.12, "triangle"], [1046, 0.6, 0.12, "triangle"]],
};

const SYSTEM: Tone[] = ["click", "tick", "lock", "unlock", "notify", "ring"];

let context: AudioContext | undefined;
let noise: AudioBuffer | undefined;

function audio(): AudioContext | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

function volumeFor(tone: Tone): number {
  const { volumes, ringer, touchSounds } = getSettings();
  if (tone === "alarm") return volumes.alarm;
  if ((tone === "click" || tone === "tick") && !touchSounds) return 0;
  if (SYSTEM.includes(tone)) return ringer === "sound" ? volumes.ring : 0;
  return volumes.media;
}

function schedule(ctx: AudioContext, notes: Note[], volume: number): void {
  for (const [frequency, start, duration, wave = "sine"] of notes) {
    const at = ctx.currentTime + start;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume * 0.3, at + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    envelope.connect(ctx.destination);
    let source: AudioScheduledSourceNode;
    if (frequency) {
      const oscillator = ctx.createOscillator();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      source = oscillator;
    } else {
      if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate / 4, ctx.sampleRate);
        const samples = noise.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
      }
      const buffer = ctx.createBufferSource();
      buffer.buffer = noise;
      source = buffer;
    }
    source.connect(envelope);
    source.start(at);
    source.stop(at + duration + 0.02);
  }
}

export function play(tone: Tone): void {
  const volume = volumeFor(tone);
  const ctx = volume > 0 ? audio() : undefined;
  if (ctx) schedule(ctx, TONES[tone], volume);
}

/** Repeats a ringtone until the returned function is called. */
export function loop(tone: "ring" | "alarm"): () => void {
  play(tone);
  const timer = setInterval(() => play(tone), tone === "ring" ? 2000 : 1200);
  return () => clearInterval(timer);
}
