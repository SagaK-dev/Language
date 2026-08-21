import { describe, expect, it } from 'vitest';
import { mixPairs, toggleSentence } from './mix';
import type { SentencePair } from '../types';

const pairs: SentencePair[] = Array.from({ length: 10 }, (_, index) => ({
  id: String(index),
  source: `source ${index}`,
  translated: `translated ${index}`,
  paragraphIndex: 0,
  sentenceIndex: index,
}));

describe('mixPairs', () => {
  it('translates the requested proportion', () => {
    const mixed = mixPairs(pairs, 40, 1234);
    expect(mixed.filter((item) => item.showTranslation)).toHaveLength(4);
  });

  it('is deterministic for a seed', () => {
    expect(mixPairs(pairs, 50, 9)).toEqual(mixPairs(pairs, 50, 9));
  });

  it('toggles one sentence', () => {
    const mixed = mixPairs(pairs, 0, 1);
    const toggled = toggleSentence(mixed, '3');
    expect(toggled[3].showTranslation).toBe(true);
    expect(toggled[2].showTranslation).toBe(false);
  });
});
