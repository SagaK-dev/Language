import type { MixedSentence, SentencePair } from '../types';

export function createSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function mixPairs(pairs: SentencePair[], ratio: number, seed: number): MixedSentence[] {
  const clamped = Math.max(0, Math.min(100, ratio));
  const targetCount = Math.round((pairs.length * clamped) / 100);
  const indices = pairs.map((_, index) => index);
  const random = mulberry32(seed);

  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const translated = new Set(indices.slice(0, targetCount));
  return pairs.map((pair, index) => ({ ...pair, showTranslation: translated.has(index) }));
}

export function toggleSentence(items: MixedSentence[], id: string): MixedSentence[] {
  return items.map((item) =>
    item.id === id ? { ...item, showTranslation: !item.showTranslation } : item,
  );
}
