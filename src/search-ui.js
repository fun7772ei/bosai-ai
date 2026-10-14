import corpus from './bosai-data.json';
import { createSearch, legacySearch, applySelection, SEARCH_MODELS } from './bosai-search.js';
const $ = id => document.getElementById(id);
const node = (tag, text) => { const el = document.createElement(tag); el.textContent = text; return el; };
export function mountSearch({ state, select }) {
  const started = performance.now(), search = createSearch(corpus), indexMs = performance.now() - started;
  const runs = [];
  let searching = false;
  function refresh() {
    const { busy, ready, modelKey } = state();
    $('searchSubmit').disabled = busy || searching;
    $('searchMethod').disabled = busy || searching;
    $('searchModelStatus').textContent = ready && SEARCH_MODELS.includes(modelKey) ? '読み込み済みLFM CPUモデルを候補選別に使えます。' : '軽量検索はモデル不要。LLM選別を試す場合だけ、上の欄でLFM CPU版を保存・読み込みしてください。';
  }
  function render(results) {
    $('searchResults').replaceChildren();
    if (!results.length) { $('searchResults').append(node('p', '該当項目を確認できませんでした。場所・状況を具体的にするか、別の言葉で検索してください。')); return; }
    for (const { entry } of results) {
      const card = node('article', ''); card.className = 'search-card'; card.dataset.entryId = entry.id;
      card.append(node('h3', entry.title), node('p', `${entry.category} / 優先度 ${entry.priority} / ${entry.id}`), node('p', entry.summary));
      card.append(node('h4', '準備するもの'), node('p', entry.items), node('h4', '手順'));
      const steps = document.createElement('ol'); for (const step of entry.steps) steps.append(node('li', step)); card.append(steps);
      card.append(node('h4', '注意事項'), node('p', entry.warning), node('h4', '出典'));
      const sources = document.createElement('ul');
      for (const source of entry.sources) {
        const li = document.createElement('li'), a = node('a', source.label);
        if (/^https?:\/\//.test(source.url)) { a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        li.append(a); sources.append(li);
      }
      card.append(sources, node('p', `キーワード: ${entry.keywords.join('、')}`)); $('searchResults').append(card);
    }
  }
  $('searchForm').onsubmit = async event => {
    event.preventDefault(); if (state().busy || searching) return;
    const query = $('searchQuery').value.trim(); if (!query || query.length > 200) return;
    searching = true; refresh();
    const started = performance.now(), method = $('searchMethod').value;
    const candidates = method === 'keyword' ? legacySearch(corpus, query) : search(query);
    const retrievalMs = performance.now() - started;
    let results = candidates, selection = null, llm = null;
    const report = { query, method, modelKey: method === 'llm' ? state().modelKey : null, candidateIds: candidates.map(item => item.entry.id), retrievalMs, firstResponseMs: null, indexMs, time: new Date().toISOString() };
    render(candidates);
    // Yield through a paint opportunity; this includes DOM work, unlike retrievalMs.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    report.firstResponseMs = performance.now() - started;
    $('searchStatus').textContent = candidates.length ? `候補${candidates.length}件。${method === 'llm' ? 'LLM選別中…' : '検索完了'}` : '該当項目なし';
    $('searchMetrics').textContent = `検索 ${retrievalMs.toFixed(1)} ms`;
    $('searchTrace').textContent = '軽量検索候補: ' + (report.candidateIds.join(', ') || 'なし');
    if (method === 'llm' && candidates.length) {
      if (!state().ready || !SEARCH_MODELS.includes(state().modelKey)) selection = { outcome: 'fallback-model-not-ready', selectedId: null };
      else {
        try {
          llm = await select(query, candidates.map(item => item.entry.id));
          if (llm.error) selection = { outcome: 'fallback-error', selectedId: null };
          else { selection = applySelection(candidates, llm); results = selection.results; }
        } catch (error) { llm = { error: error.message }; selection = { outcome: 'fallback-error', selectedId: null }; }
      }
    }
    render(results);
    Object.assign(report, { results: results.map(item => item.entry.id), outcome: selection?.outcome || (candidates.length ? 'retrieved' : 'no-candidates'), selectedId: selection?.selectedId || null, llm, totalMs: performance.now() - started });
    runs.push(report); if (runs.length > 100) runs.shift();
    // Public diagnostic data on the result element, also included in JSON export.
    $('searchResults').dataset.run = JSON.stringify(report);
    $('searchStatus').textContent = `検索完了: ${results.length}件 / ${report.outcome}${llm?.error ? `（${llm.error}）` : ''}`;
    $('searchMetrics').textContent = `検索 ${retrievalMs.toFixed(1)} ms / 初回表示 ${report.firstResponseMs.toFixed(1)} ms / 完了 ${report.totalMs.toFixed(1)} ms${llm?.elapsedMs !== undefined ? ` / LLM ${llm.elapsedMs.toFixed(1)} ms / 初回token ${llm.ttftMs?.toFixed(1) ?? '—'} ms` : ''}`;
    $('searchTrace').textContent = `候補: ${report.candidateIds.join(', ') || 'なし'} / LLM選択: ${report.selectedId || 'なし'} / ${report.outcome}`;
    searching = false; refresh();
  };
  refresh();
  return { refresh, runs };
}
