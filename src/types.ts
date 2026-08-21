export type SpeakerGender = 'neutral' | 'female' | 'male';
export type Politeness = 'natural' | 'polite' | 'casual';
export type Audience = 'general' | 'senior' | 'friend';

export interface TranslationOptions {
  sourceLanguage: string;
  targetLanguage: string;
  speakerGender: SpeakerGender;
  politeness: Politeness;
  audience: Audience;
  context: string;
}

export interface SentencePair {
  id: string;
  source: string;
  translated: string;
  paragraphIndex: number;
  sentenceIndex: number;
}

export interface MixedSentence extends SentencePair {
  showTranslation: boolean;
}

export interface HistoryEntry {
  id: string;
  createdAt: string;
  title: string;
  sourceText: string;
  ratio: number;
  options: TranslationOptions;
  pairs: SentencePair[];
}

export interface TranslateResponse {
  translations: string[];
}
