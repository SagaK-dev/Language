import { describe, expect, it } from 'vitest';
import { isHistoryEntry } from './storage';

const validEntry = {
  id: 'entry-1',
  createdAt: '2026-08-21T09:00:00.000Z',
  title: 'Sample',
  sourceText: '今日は晴れです。',
  ratio: 40,
  options: {
    sourceLanguage: 'Japanese',
    targetLanguage: 'English',
    speakerGender: 'neutral',
    politeness: 'natural',
    audience: 'general',
    context: '',
  },
  pairs: [{
    id: 'pair-1',
    source: '今日は晴れです。',
    translated: 'It is sunny today.',
    paragraphIndex: 0,
    sentenceIndex: 0,
  }],
};

describe('history validation', () => {
  it('accepts a complete history entry', () => {
    expect(isHistoryEntry(validEntry)).toBe(true);
  });

  it('rejects malformed nested translation options', () => {
    expect(isHistoryEntry({
      ...validEntry,
      options: { ...validEntry.options, targetLanguage: '<script>' },
    })).toBe(false);
  });

  it('rejects malformed sentence pairs and ratios', () => {
    expect(isHistoryEntry({ ...validEntry, ratio: 140 })).toBe(false);
    expect(isHistoryEntry({
      ...validEntry,
      pairs: [{ ...validEntry.pairs[0], translated: '' }],
    })).toBe(false);
  });
});
