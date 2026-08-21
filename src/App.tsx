import { useEffect, useMemo, useState } from 'react';
import { extractArticle, translateSentences } from './lib/api';
import { createSeed, mixPairs, toggleSentence } from './lib/mix';
import { flattenSentences } from './lib/sentences';
import { clearHistory, loadHistory, saveHistory } from './lib/storage';
import type { HistoryEntry, MixedSentence, SentencePair, TranslationOptions } from './types';

const MAX_TEXT_LENGTH = 5000;
const MAX_SENTENCES = 120;
const EXAMPLE = `朝は少し早く起きて、近所を散歩しました。空気が涼しくて気持ちよかったです。\n\n帰宅してからコーヒーを入れ、今日やることを三つだけメモしました。全部を完璧に終わらせるより、大切なことから始めることにしました。`;

const languageOptions = [
  'English', 'Japanese', 'Chinese', 'Korean', 'French', 'German',
  'Spanish', 'Italian', 'Portuguese', 'Hindi', 'Vietnamese', 'Thai',
];

const initialOptions: TranslationOptions = {
  sourceLanguage: 'Japanese',
  targetLanguage: 'English',
  speakerGender: 'neutral',
  politeness: 'natural',
  audience: 'general',
  context: '',
};

function App() {
  const [text, setText] = useState('');
  const [ratio, setRatio] = useState(40);
  const [options, setOptions] = useState<TranslationOptions>(initialOptions);
  const [pairs, setPairs] = useState<SentencePair[]>([]);
  const [mixed, setMixed] = useState<MixedSentence[]>([]);
  const [seed, setSeed] = useState(createSeed());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [articleOpen, setArticleOpen] = useState(false);
  const [articleUrl, setArticleUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<number, MixedSentence[]>();
    mixed.forEach((item) => map.set(item.paragraphIndex, [...(map.get(item.paragraphIndex) || []), item]));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [mixed]);

  useEffect(() => {
    if (!historyOpen && !articleOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || loading) return;
      setHistoryOpen(false);
      setArticleOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [articleOpen, historyOpen, loading]);

  function invalidateResult(): void {
    setPairs([]);
    setMixed([]);
  }

  function updateText(next: string): void {
    setText(next);
    invalidateResult();
    setMessage(null);
  }

  function updateOptions(patch: Partial<TranslationOptions>): void {
    setOptions((current) => ({ ...current, ...patch }));
    invalidateResult();
    setMessage(null);
  }

  async function handleMix() {
    const trimmed = text.trim();
    if (!trimmed) {
      setMessage('文章を入力してください。');
      return;
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      setMessage(`文章は${MAX_TEXT_LENGTH}文字以内にしてください。`);
      return;
    }
    if (options.sourceLanguage === options.targetLanguage) {
      setMessage('元の言語と学習言語は別にしてください。');
      return;
    }

    const units = flattenSentences(trimmed);
    if (units.length === 0) {
      setMessage('文章を文として認識できませんでした。');
      return;
    }
    if (units.length > MAX_SENTENCES) {
      setMessage(`一度に処理できるのは${MAX_SENTENCES}文までです。文章を短くしてください。`);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const translated = await translateSentences(units.map((item) => item.text), options);
      const batchId = crypto.randomUUID();
      const nextPairs = units.map((item, index) => ({
        id: `${batchId}:${index}`,
        source: item.text,
        translated: translated[index],
        paragraphIndex: item.paragraphIndex,
        sentenceIndex: item.sentenceIndex,
      }));
      const nextSeed = createSeed();
      setPairs(nextPairs);
      setSeed(nextSeed);
      setMixed(mixPairs(nextPairs, ratio, nextSeed));

      const entry: HistoryEntry = {
        id: batchId,
        createdAt: new Date().toISOString(),
        title: trimmed.slice(0, 44),
        sourceText: trimmed,
        ratio,
        options: { ...options },
        pairs: nextPairs,
      };
      const saved = saveHistory(entry);
      setHistory(saved.entries);
      if (!saved.persisted) {
        setMessage('翻訳は完了しましたが、この端末に履歴を保存できませんでした。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '翻訳に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  function remix(nextRatio = ratio) {
    if (!pairs.length) return;
    const nextSeed = createSeed();
    setSeed(nextSeed);
    setMixed(mixPairs(pairs, nextRatio, nextSeed));
  }

  function changeRatio(next: number) {
    setRatio(next);
    if (pairs.length) setMixed(mixPairs(pairs, next, seed));
  }

  function restoreHistory(entry: HistoryEntry) {
    setText(entry.sourceText);
    setRatio(entry.ratio);
    setOptions({ ...entry.options });
    setPairs(entry.pairs);
    const nextSeed = createSeed();
    setSeed(nextSeed);
    setMixed(mixPairs(entry.pairs, entry.ratio, nextSeed));
    setMessage(null);
    setHistoryOpen(false);
  }

  function removeAllHistory() {
    if (clearHistory()) {
      setHistory([]);
      return;
    }
    setMessage('履歴を削除できませんでした。ブラウザのストレージ設定を確認してください。');
  }

  function closeArticleModal() {
    if (!loading) setArticleOpen(false);
  }

  async function importArticle() {
    const requestedUrl = articleUrl.trim();
    if (!requestedUrl) return;
    setLoading(true);
    setMessage(null);
    try {
      const article = await extractArticle(requestedUrl);
      const wasTruncated = article.text.length > MAX_TEXT_LENGTH;
      updateText(article.text.slice(0, MAX_TEXT_LENGTH));
      setArticleOpen(false);
      setArticleUrl('');
      setMessage(
        wasTruncated
          ? `「${article.title}」を読み込み、先頭${MAX_TEXT_LENGTH}文字を使用しました。`
          : `「${article.title}」を読み込みました。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '記事の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="ghost" onClick={() => setHistoryOpen(true)} disabled={loading}>履歴</button>
        <a className="brand" href="#top" aria-label="Language home">
          <span className="brand-mark">L</span>
          <span>Language</span>
        </a>
        <span className="privacy-pill">Local history</span>
      </header>

      <main id="top" className="page">
        <section className="hero">
          <span className="eyebrow">MIXED-LANGUAGE READING</span>
          <h1>好きな文章を、<br />そのまま語学教材に。</h1>
          <p>文章の一部だけを学習言語へ置き換えます。前後の文脈から意味を推測しながら、辞書に頼りすぎず読み進められます。</p>
        </section>

        <section className="workspace card">
          <div className="section-heading">
            <div>
              <span className="step">01</span>
              <h2>読みたい文章</h2>
            </div>
            <span className="counter">{text.length} / {MAX_TEXT_LENGTH}</span>
          </div>

          <textarea
            value={text}
            onChange={(event) => updateText(event.target.value)}
            placeholder="ニュース、メモ、勉強したい文章などを貼り付けてください…"
            rows={11}
            maxLength={MAX_TEXT_LENGTH}
            disabled={loading}
          />

          <div className="toolbar">
            <button type="button" className="soft" onClick={() => updateText(EXAMPLE)} disabled={loading}>📄 例文を入れる</button>
            <button type="button" className="soft" onClick={() => setArticleOpen(true)} disabled={loading}>📰 記事URLから読み込む</button>
            <button type="button" className="text-button" onClick={() => updateText('')} disabled={loading || !text}>クリア</button>
          </div>

          <div className="grid two">
            <label>
              <span>元の言語</span>
              <select value={options.sourceLanguage} onChange={(e) => updateOptions({ sourceLanguage: e.target.value })} disabled={loading}>
                {languageOptions.map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>
            <label>
              <span>学習言語</span>
              <select value={options.targetLanguage} onChange={(e) => updateOptions({ targetLanguage: e.target.value })} disabled={loading}>
                {languageOptions.map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>
          </div>

          <details className="speech-options">
            <summary>🗣 翻訳の話し方を調整</summary>
            <div className="option-group">
              <span>話者</span>
              <div className="segmented">
                {(['neutral', 'female', 'male'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={options.speakerGender === value ? 'active' : ''}
                    aria-pressed={options.speakerGender === value}
                    disabled={loading}
                    onClick={() => updateOptions({ speakerGender: value })}
                  >
                    {value === 'neutral' ? '指定なし' : value === 'female' ? '女性' : '男性'}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <span>丁寧さ</span>
              <div className="segmented">
                {(['natural', 'polite', 'casual'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={options.politeness === value ? 'active' : ''}
                    aria-pressed={options.politeness === value}
                    disabled={loading}
                    onClick={() => updateOptions({ politeness: value })}
                  >
                    {value === 'natural' ? '自然' : value === 'polite' ? '丁寧' : 'カジュアル'}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <span>相手</span>
              <div className="segmented">
                {(['general', 'senior', 'friend'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={options.audience === value ? 'active' : ''}
                    aria-pressed={options.audience === value}
                    disabled={loading}
                    onClick={() => updateOptions({ audience: value })}
                  >
                    {value === 'general' ? '一般' : value === 'senior' ? '目上' : '友達'}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>補足</span>
              <input
                value={options.context}
                onChange={(e) => updateOptions({ context: e.target.value })}
                placeholder="例: ビジネスメール。話者は女性、相手は上司。"
                maxLength={300}
                disabled={loading}
              />
            </label>
          </details>

          <div className="ratio-block">
            <div className="ratio-copy">
              <span className="step">02</span>
              <div>
                <h2>学習言語の割合</h2>
                <p>読みながら変更できます。</p>
              </div>
              <strong>{ratio}%</strong>
            </div>
            <input
              className="range"
              type="range"
              min="0"
              max="100"
              step="10"
              value={ratio}
              aria-label="学習言語の割合"
              disabled={loading}
              onChange={(e) => changeRatio(Number(e.target.value))}
            />
            <div className="ratio-labels"><span>元の言語</span><span>{options.targetLanguage}</span></div>
          </div>

          <button type="button" className="primary" onClick={handleMix} disabled={loading || !text.trim()}>
            {loading ? '処理中…' : 'ミックスする'}
          </button>
          {message && <p className="message" role="status" aria-live="polite">{message}</p>}
        </section>

        {mixed.length > 0 && (
          <section className="result card">
            <div className="section-heading">
              <div>
                <span className="step">03</span>
                <h2>ミックス文</h2>
              </div>
              <button type="button" className="soft" onClick={() => remix()} disabled={loading}>🔀 混ぜ直す</button>
            </div>
            <p className="hint">各文をクリックすると、原文と訳文を切り替えられます。</p>
            <article className="reader">
              {grouped.map(([paragraphIndex, sentences]) => (
                <p key={paragraphIndex}>
                  {sentences.map((item) => (
                    <button
                      type="button"
                      className={item.showTranslation ? 'sentence translated' : 'sentence'}
                      key={item.id}
                      onClick={() => setMixed((current) => toggleSentence(current, item.id))}
                      title="クリックで原文/訳文を切り替え"
                      aria-label={`${item.showTranslation ? '訳文' : '原文'}: ${item.showTranslation ? item.translated : item.source}`}
                    >
                      {item.showTranslation ? item.translated : item.source}
                    </button>
                  ))}
                </p>
              ))}
            </article>
          </section>
        )}

        <section className="why">
          <span className="eyebrow">HOW IT HELPS</span>
          <h2>文脈を残したまま、負荷だけを変える。</h2>
          <div className="benefit-grid">
            <article><span>01</span><h3>文脈がヒントになる</h3><p>知らない表現が出ても、前後の原文から意味を推測しやすくなります。</p></article>
            <article><span>02</span><h3>量を読みやすい</h3><p>難しい文章を100%外国語にせず、読む総量を増やせます。</p></article>
            <article><span>03</span><h3>負荷をすぐ変更</h3><p>0%から100%まで、集中力や学習段階に合わせて切り替えられます。</p></article>
          </div>
        </section>
      </main>

      {historyOpen && (
        <div className="modal-backdrop" onMouseDown={() => setHistoryOpen(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <h2 id="history-title">履歴</h2>
              <button type="button" className="icon" aria-label="履歴を閉じる" onClick={() => setHistoryOpen(false)}>×</button>
            </div>
            <p className="muted">この端末の localStorage にのみ保存されます。</p>
            {history.length === 0 ? <p className="empty">まだ履歴はありません。</p> : history.map((entry) => (
              <button type="button" className="history-item" key={entry.id} onClick={() => restoreHistory(entry)}>
                <strong>{entry.title}</strong>
                <span>{new Date(entry.createdAt).toLocaleString('ja-JP')} · {entry.options.targetLanguage} {entry.ratio}%</span>
              </button>
            ))}
            {history.length > 0 && <button type="button" className="danger-button" onClick={removeAllHistory}>履歴をすべて削除</button>}
          </aside>
        </div>
      )}

      {articleOpen && (
        <div className="modal-backdrop" onMouseDown={closeArticleModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <h2 id="article-title">記事URLを読み込む</h2>
              <button type="button" className="icon" aria-label="記事URL画面を閉じる" onClick={closeArticleModal} disabled={loading}>×</button>
            </div>
            <p className="muted">公開されている http/https ページから本文候補を抽出します。サイト側の制限により取得できない場合があります。</p>
            <input
              type="url"
              placeholder="https://example.com/article"
              value={articleUrl}
              onChange={(e) => setArticleUrl(e.target.value)}
              maxLength={2048}
              disabled={loading}
            />
            <button type="button" className="primary" onClick={importArticle} disabled={loading || !articleUrl.trim()}>
              {loading ? '読み込み中…' : '読み込む'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
