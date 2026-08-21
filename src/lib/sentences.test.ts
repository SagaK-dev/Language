import { describe, expect, it } from 'vitest';
import { flattenSentences, splitText } from './sentences';

describe('sentence splitting', () => {
  it('keeps paragraph positions', () => {
    const result = splitText('今日は晴れです。散歩します。\n\nTomorrow is Friday. Great!');
    expect(result).toEqual([
      ['今日は晴れです。', '散歩します。'],
      ['Tomorrow is Friday.', 'Great!'],
    ]);
  });

  it('flattens with stable paragraph indexes', () => {
    const result = flattenSentences('A. B.\n\nC.');
    expect(result.map((item) => item.paragraphIndex)).toEqual([0, 0, 1]);
  });
});
