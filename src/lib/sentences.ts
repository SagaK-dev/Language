const sentenceBoundary = /(?<=[。！？!?\.])\s+|(?<=[。！？!?])/u;

export function splitIntoParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitParagraphIntoSentences(paragraph: string): string[] {
  const normalized = paragraph.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const parts = normalized
    .split(sentenceBoundary)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [normalized];
}

export function splitText(text: string): string[][] {
  return splitIntoParagraphs(text).map(splitParagraphIntoSentences);
}

export function flattenSentences(text: string): Array<{ text: string; paragraphIndex: number; sentenceIndex: number }> {
  return splitText(text).flatMap((sentences, paragraphIndex) =>
    sentences.map((sentence, sentenceIndex) => ({
      text: sentence,
      paragraphIndex,
      sentenceIndex,
    })),
  );
}
