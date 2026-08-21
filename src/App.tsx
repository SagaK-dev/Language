import { useMemo, useState } from 'react';
import { extractArticle, translateSentences } from './lib/api';
import { createSeed, mixPairs, toggleSentence } from './lib/mix';
import { flattenSentences } from './lib/sentences';
import { clearHistory, loadHistory, saveHistory } from './lib/storage';
import type { HistoryEntry, MixedSentence, SentencePair, TranslationOptions } from './types';

const EXAMPLE = `朝は少し早く起きて、近所を散歩しました。空気が涼しくて気持ちよかったです。\n\n帰宅してからコーヒーを入れ、今日やることを三つだけメモしました。全部を完璧に終わらせるより、大切なことから始めることにしました。`;

const languageOptions = [
  'English', 'Japanese', 'Chinese', 'Korean', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Hindi', 'Vietnamese', 'Thai',
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

  async function handleMix() {
    const trimmed = text.trim();
    if (!trimmed) {
      setMessage('文章を入力してください。');
      return;
    }
    if (trimmed.length > 5000) {
      setMessage('文章は5000文字以内にしてください。');
      return;
    }
    if (options.sourceLanguage === options.targetLanguage) {
      setMessage('元の言語と学習言語は別にしてください。');
      return;
    }

    const units = flattenSentences(trimmed);
    if (units.length === 0) return;

    setLoading(true);
    setMessage(null);
    try {
      const translated = await translateSentences(units.map((item) => item.text), options);
      const nextPairs = units.map((item, index) => ({
        id: `${Date.now()}-${index}`,
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
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title: trimmed.slice(0, 44),
        sourceText: trimmed,
        ratio,
        options,
        pairs: nextPairs,
      };
      setHistory(saveHistory(entry));
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
    setOptions(entry.options);
    setPairs(entry.pairs);
    const nextSeed = createSeed();
    setSeed(nextSeed);
    setMixed(mixPairs(entry.pairs, entry.ratio, nextSeed));
    setHistoryOpen(false);
  }

  async function importArticle() {
    if (!articleUrl.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const article = await extractArticle(articleUrl.trim());
      setText(article.text.slice(0, 5000));
      setArticleOpen(false);
      setArticleUrl('');
      setMessage(`「${article.title}」を読み込みました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '記事の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="ghost" onClick={() => setHistoryOpen(true)}>履歴</button>
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
            <span className={text.length > 5000 ? 'counter danger' : 'counter'}>{text.length} / 5000</span>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="ニュース、メモ、勉強したい文章などを貼り付けてください…"
            rows={11}
          />

          <div className="toolbar">
            <button className="soft" onClick={() => setText(EXAMPLE)}>📄 例文を入れる</button>
            <button className="soft" onClick={() => setArticleOpen(true)}>📰 記事URLから読み込む</button>
            <button className="text-button" onClick={() => setText('')}>クリア</button>
          </div>

          <div className="grid two">
            <label>
              <span>元の言語</span>
              <select value={options.sourceLanguage} onChange={(e) => setOptions({ ...options, sourceLanguage: e.target.value })}>
                {languageOptions.map((language) => <option key={language}>{language}</option>)}
              </select>
            </label>
            <label>
              <span>学習言語</span>
              <select value={options.targetLanguage} onChange={(e) => setOptions({ ...options, targetLanguage: e.target.value })}>
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
                  <button key={value} className={options.speakerGender === value ? 'active' : ''} onClick={() => setOptions({ ...options, speakerGender: value })}>
                    {value === 'neutral' ? '指定なし' : value === 'female' ? '女性' : '男性'}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <span>丁寧さ</span>
              <div className="segmented">
                {(['natural', 'polite', 'casual'] as const).map((value) => (
                  <button key={value} className={options.politeness === value ? 'active' : ''} onClick={() => setOptions({ ...options, politeness: value })}>
                    {value === 'natural' ? '自然' : value === 'polite' ? '丁寧' : 'カジュアル'}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-group">
              <span>相手</span>
              <div className="segmented">
                {(['general', 'senior', 'friend'] as const).map((value) => (
                  <button key={value} className={options.audience === value ? 'active' : ''} onClick={() => setOptions({ ...options, audience: value })}>
                    {value === 'general' ? '一般' : value === 'senior' ? '目上' : '友達'}
                  </button>
                ))}
              </div>
            </div>
            <label>
              <span>補足</span>
              <input value={options.context} onChange={(e) => setOptions({ ...options, context: e.target.value })} placeholder="例: ビジネスメール。話者は女性、相手は上司。" maxLength={300} />
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
            <input className="range" type="range" min="0" max="100" step="10" value={ratio} onChange={(e) => changeRatio(Number(e.target.value))} />
            <div className="ratio-labels"><span>元の言語</span><span>{options.targetLanguage}</span></div>
          </div>

          <button className="primary" onClick={handleMix} disabled={loading || !text.trim()}>
            {loading ? '処理中…' : 'ミックスする'}
          </button>
          {message && <p className="message" role="status">{message}</p>}
        </section>

        {mixed.length > 0 && (
          <section className="result card">
            <div className="section-heading">
              <div>
                <span className="step">03</span>
                <h2>ミックス文</h2>
              </div>
              <button className="soft" onClick={() => remix()}>🔀 混ぜ直す</button>
            </div>
            <p className="hint">色の付いた文をクリックすると、原文と訳文を切り替えられます。</p>
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
            <article><span>03</span><h3>負荷をすぐ変更</h3><p>10%から100%まで、集中力や学習段階に合わせて切り替えられます。</p></article>
          </div>
        </section>
      </main>

      {historyOpen && (
        <div className="modal-backdrop" onMouseDown={() => setHistoryOpen(false)}>
          <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><h2>履歴</h2><button className="icon" onClick={() => setHistoryOpen(false)}>×</button></div>
            <p className="muted">この端末の localStorage にのみ保存されます。</p>
            {history.length === 0 ? <p className="empty">まだ履歴はありません。</p> : history.map((entry) => (
              <button className="history-item" key={entry.id} onClick={() => restoreHistory(entry)}>
                <strong>{entry.title}</strong>
                <span>{new Date(entry.createdAt).toLocaleString('ja-JP')} · {entry.options.targetLanguage} {entry.ratio}%</span>
              </button>
            ))}
            {history.length > 0 && <button className="danger-button" onClick={() => { clearHistory(); setHistory([]); }}>履歴をすべて削除</button>}
          </aside>
        </div>
      )}

      {articleOpen && (
        <div className="modal-backdrop" onMouseDown={() => setArticleOpen(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-head"><h2>記事URLを読み込む</h2><button className="icon" onClick={() => setArticleOpen(false)}>×</button></div>
            <p className="muted">公開されている http/https ページから本文候補を抽出します。サイト側の制限により取得できない場合があります。</p>
            <input type="url" placeholder="https://example.com/article" value={articleUrl} onChange={(e) => setArticleUrl(e.target.value)} />
            <button className="primary" onClick={importArticle} disabled={loading || !articleUrl.trim()}>読み込む</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
