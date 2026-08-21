import type { HistoryEntry, SentencePair, TranslationOptions } from '../types';

const HISTORY_KEY = 'language.history.v1';
const MAX_HISTORY = 30;
const ALLOWED_LANGUAGES = new Set([
  'English', 'Japanese', 'Chinese', 'Korean', 'French', 'German',
  'Spanish', 'Italian', 'Portuguese', 'Hindi', 'Vietnamese', 'Thai',
]);

export interface HistorySaveResult {
  entries: HistoryEntry[];
  persisted: boolean;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

export function saveHistory(entry: HistoryEntry): HistorySaveResult {
  const current = loadHistory();
  const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return { entries: next, persisted: true };
  } catch {
    return { entries: current, persisted: false };
  }
}

export function clearHistory(): boolean {
  try {
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HistoryEntry>;
  if (
    typeof candidate.id !== 'string' || candidate.id.length === 0 || candidate.id.length > 100 ||
    typeof candidate.createdAt !== 'string' || Number.isNaN(Date.parse(candidate.createdAt)) ||
    typeof candidate.title !== 'string' || candidate.title.length > 100 ||
    typeof candidate.sourceText !== 'string' || candidate.sourceText.length === 0 || candidate.sourceText.length > 5000 ||
    !Number.isFinite(candidate.ratio) || candidate.ratio! < 0 || candidate.ratio! > 100 ||
    !isTranslationOptions(candidate.options) ||
    !Array.isArray(candidate.pairs) || candidate.pairs.length === 0 || candidate.pairs.length > 120
  ) {
    return false;
  }
  return candidate.pairs.every(isSentencePair);
}

function isTranslationOptions(value: unknown): value is TranslationOptions {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TranslationOptions>;
  return (
    ALLOWED_LANGUAGES.has(candidate.sourceLanguage || '') &&
    ALLOWED_LANGUAGES.has(candidate.targetLanguage || '') &&
    candidate.sourceLanguage !== candidate.targetLanguage &&
    ['neutral', 'female', 'male'].includes(candidate.speakerGender || '') &&
    ['natural', 'polite', 'casual'].includes(candidate.politeness || '') &&
    ['general', 'senior', 'friend'].includes(candidate.audience || '') &&
    typeof candidate.context === 'string' && candidate.context.length <= 300
  );
}

function isSentencePair(value: unknown): value is SentencePair {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SentencePair>;
  return (
    typeof candidate.id === 'string' && candidate.id.length > 0 && candidate.id.length <= 100 &&
    typeof candidate.source === 'string' && candidate.source.length > 0 && candidate.source.length <= 6000 &&
    typeof candidate.translated === 'string' && candidate.translated.trim().length > 0 && candidate.translated.length <= 12_000 &&
    Number.isInteger(candidate.paragraphIndex) && candidate.paragraphIndex! >= 0 &&
    Number.isInteger(candidate.sentenceIndex) && candidate.sentenceIndex! >= 0
  );
}
