import { writeFile } from "../kernel/fs";
import { pick } from "../kernel/i18n";
import { persisted } from "../kernel/storage";
import type { Text } from "../kernel/types";

/**
 * Sample media a new phone ships with. It is generated on the device (canvas landscapes,
 * synthesized songs) so the repository carries no binary assets.
 */
const useProvisioned = persisted("system/provisioned", { done: false });

/** Deterministic PRNG (mulberry32): every device gets the same sample photos. */
function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENES: Array<{ name: Text; sky: [string, string]; sun: string; hue: number; stars?: boolean }> = [
  { name: ["Gün batımı", "Sunset"], sky: ["#1e1b4b", "#fb923c"], sun: "#fde68a", hue: 280 },
  { name: ["Dağ sabahı", "Mountain morning"], sky: ["#7dd3fc", "#e0f2fe"], sun: "#ffffff", hue: 205 },
  { name: ["Orman", "Forest"], sky: ["#0f766e", "#a7f3d0"], sun: "#fef9c3", hue: 150 },
  { name: ["Çöl", "Desert"], sky: ["#c2410c", "#fde047"], sun: "#fff7ed", hue: 28 },
  { name: ["Gece", "Night"], sky: ["#020617", "#3730a3"], sun: "#e2e8f0", hue: 240, stars: true },
];

function landscape(index: number): Promise<Blob | null> {
  const [width, height] = [1080, 1350];
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  const next = randomFrom(index + 7);
  const scene = SCENES[index];
  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, scene.sky[0]);
  sky.addColorStop(0.75, scene.sky[1]);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  for (let star = 0; scene.stars && star < 160; star++) {
    context.fillStyle = `rgb(255 255 255 / ${0.3 + next() * 0.7})`;
    context.fillRect(next() * width, next() * height * 0.6, 2 + next() * 2, 2 + next() * 2);
  }
  const [sunX, sunY] = [200 + next() * 680, 300 + next() * 260];
  const glow = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, 460);
  glow.addColorStop(0, scene.sun);
  glow.addColorStop(1, "transparent");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.fillStyle = scene.sun;
  context.beginPath();
  context.arc(sunX, sunY, 80, 0, Math.PI * 2);
  context.fill();
  // Four ridgelines, nearer ones darker: a random walk per layer.
  for (let layer = 0; layer < 4; layer++) {
    let ridge = 640 + layer * 150;
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width; x += 24) {
      ridge += (next() - 0.5) * (70 - layer * 10);
      context.lineTo(x, ridge);
    }
    context.lineTo(width, height);
    context.fillStyle = `hsl(${scene.hue} ${30 + layer * 5}% ${58 - layer * 13}%)`;
    context.fill();
  }
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

const RATE = 22050;
/** Eighth-note arpeggio shapes, alternated bar by bar; numbers index the chord's tones. */
const PATTERNS = [[0, 1, 2, 3, 2, 1, 2, 1], [3, 2, 1, 2, 0, 1, 2, 3]];
/** Semitones above A3; each chord lists root, third, fifth, octave. */
const CHORD = { C: [3, 7, 10, 15], G: [10, 14, 17, 22], Am: [12, 15, 19, 24], F: [8, 12, 15, 20], Dm: [5, 8, 12, 17], Em: [7, 10, 14, 19] };
const SONGS: Array<{ title: Text; bpm: number; chords: Array<keyof typeof CHORD> }> = [
  { title: ["Sabah Yürüyüşü", "Morning Walk"], bpm: 104, chords: ["C", "G", "Am", "F", "C", "G", "F", "C"] },
  { title: ["Şehir Işıkları", "City Lights"], bpm: 84, chords: ["Am", "F", "C", "G", "Dm", "Am", "Em", "Am"] },
];

/** A soft plucked voice over a bass root, rendered to 16-bit mono PCM in a WAV container. */
function song(bpm: number, chords: number[][]): Blob {
  const step = 30 / bpm;
  const samples = new Float32Array(Math.ceil((chords.length * 8 + 4) * step * RATE));
  const pluck = (at: number, seconds: number, semitone: number, volume: number) => {
    const frequency = 220 * 2 ** (semitone / 12);
    const start = Math.floor(at * RATE);
    for (let index = 0; index < seconds * RATE && start + index < samples.length; index++) {
      const time = index / RATE;
      const wave = Math.sin(2 * Math.PI * frequency * time) + 0.3 * Math.sin(4 * Math.PI * frequency * time) + 0.12 * Math.sin(6 * Math.PI * frequency * time);
      samples[start + index] += volume * Math.min(1, time * 300) * Math.exp(-time * 3) * wave;
    }
  };
  chords.forEach((chord, bar) => {
    pluck(bar * 8 * step, 8 * step, chord[0] - 12, 0.2);
    PATTERNS[bar % 2].forEach((tone, eighth) => pluck((bar * 8 + eighth) * step, step * 3, chord[tone] + 12, 0.16));
  });
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return new Blob([view.buffer], { type: "audio/wav" });
}

/** Runs once per device (again after a factory reset), after setup so names use the chosen language. */
export async function provision(): Promise<void> {
  if (useProvisioned.getState().done) return;
  useProvisioned.setState({ done: true });
  const album = pick(["/Pictures/Örnekler", "/Pictures/Samples"]);
  for (const [index, scene] of SCENES.entries()) {
    const photo = await landscape(index);
    if (photo) await writeFile(`${album}/${pick(scene.name)}.jpg`, photo, "image/jpeg");
  }
  for (const { title, bpm, chords } of SONGS) await writeFile(`/Music/${pick(title)}.wav`, song(bpm, chords.map(name => CHORD[name])), "audio/wav");
}
