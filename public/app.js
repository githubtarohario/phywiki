// 高校物理Wiki フロントエンド（ハッシュルーティングのSPA）
'use strict';

const STATUS_LABEL = { todo: '未着手', draft: '執筆中', done: '完成' };
// 進捗率の重み（執筆中は半分として数える）
const STATUS_WEIGHT = { todo: 0, draft: 0.5, done: 1 };

const PAGE_TEMPLATE = `## 概要

（このトピックで学ぶこと）

## 重要な式

$$
v = v_0 + at
$$

## 解説

## よくある間違い

## 関連トピック
`;

const state = {
  curriculum: null, // { subjects, progress }
  dirty: false,     // エディタに未保存の変更があるか
  readOnly: false,  // GitHub Pages など API サーバーがない環境では閲覧専用
};

const $ = (sel) => document.querySelector(sel);
const main = () => $('#main');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function statusOf(id) {
  return state.curriculum.progress[id]?.status || 'todo';
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function fetchStatic(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res;
}

// API があればサーバーモード、なければ data/ を直接読む閲覧専用モード
async function loadCurriculum() {
  try {
    state.curriculum = await api('api/curriculum');
  } catch {
    const [curriculum, progress] = await Promise.all([
      fetchStatic('data/curriculum.json').then((r) => r.json()),
      fetchStatic('data/progress.json').then((r) => r.json()),
    ]);
    state.curriculum = { ...curriculum, progress };
    state.readOnly = true;
  }
}

function findTopic(id) {
  for (const subject of state.curriculum.subjects) {
    for (const field of subject.fields) {
      const topic = field.topics.find((t) => t.id === id);
      if (topic) return { topic, field, subject };
    }
  }
  return null;
}

async function loadPage(id) {
  if (!state.readOnly) return api(`api/pages/${id}`);
  const entry = findTopic(id);
  if (!entry) throw new Error('トピックが見つかりません');
  let content = '';
  try {
    content = await (await fetchStatic(`data/pages/${id}.md`)).text();
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  return {
    id,
    title: entry.topic.title,
    field: { id: entry.field.id, title: entry.field.title },
    subject: { id: entry.subject.id, title: entry.subject.title },
    content,
    status: statusOf(id),
    updatedAt: state.curriculum.progress[id]?.updatedAt || null,
  };
}

// ---------- Markdown + 数式 ----------

// marked が $...$ 内の _ や * を書式として解釈しないよう、先に数式を退避してから変換する
function renderMarkdown(src) {
  const math = [];
  const protectedSrc = src.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_, display, inline) => {
    math.push({ tex: display ?? inline, display: display !== undefined });
    return `@@MATH${math.length - 1}@@`;
  });
  const html = DOMPurify.sanitize(marked.parse(protectedSrc));
  return html.replace(/@@MATH(\d+)@@/g, (_, n) => {
    const { tex, display } = math[Number(n)];
    return katex.renderToString(tex, { displayMode: display, throwOnError: false });
  });
}

// ---------- 進捗集計 ----------

function summarize(topics) {
  const counts = { todo: 0, draft: 0, done: 0 };
  let score = 0;
  for (const t of topics) {
    const s = statusOf(t.id);
    counts[s]++;
    score += STATUS_WEIGHT[s];
  }
  const total = topics.length;
  return { counts, total, pct: total ? Math.round((score / total) * 100) : 0 };
}

function allTopics() {
  return state.curriculum.subjects.flatMap((s) => s.fields.flatMap((f) => f.topics));
}

function progressBar({ counts, total }) {
  const w = (n) => (total ? (n / total) * 100 : 0);
  return `<div class="bar" title="完成 ${counts.done} / 執筆中 ${counts.draft} / 未着手 ${counts.todo}">
    <span class="done" style="width:${w(counts.done)}%"></span>
    <span class="draft" style="width:${w(counts.draft)}%"></span>
  </div>`;
}

function statsLine({ counts, total, pct }) {
  return `<div class="stats">
    <span>進捗 <b>${pct}%</b></span>
    <span><span class="dot done" style="display:inline-block"></span> 完成 <b>${counts.done}</b></span>
    <span><span class="dot draft" style="display:inline-block"></span> 執筆中 <b>${counts.draft}</b></span>
    <span><span class="dot todo" style="display:inline-block"></span> 未着手 <b>${counts.todo}</b></span>
    <span>全 <b>${total}</b> トピック</span>
  </div>`;
}

// ---------- サイドバー ----------

function renderSidebar(activeId) {
  const q = $('#search').value.trim().toLowerCase();
  const html = state.curriculum.subjects.map((subject) => {
    const fields = subject.fields.map((field) => {
      const topics = field.topics.filter((t) => !q || t.title.toLowerCase().includes(q) || field.title.includes(q));
      if (!topics.length) return '';
      return `<div class="tree-field">${escapeHtml(field.title)}</div>` + topics.map((t) =>
        `<a class="tree-topic${t.id === activeId ? ' active' : ''}" href="#/page/${t.id}">
          <span class="dot ${statusOf(t.id)}"></span>${escapeHtml(t.title)}</a>`).join('');
    }).join('');
    return fields ? `<div class="tree-subject">${escapeHtml(subject.title)}</div>${fields}` : '';
  }).join('');
  $('#tree').innerHTML = html || '<div class="empty">該当なし</div>';

  const { pct } = summarize(allTopics());
  $('#topbarProgress').textContent = `全体の進捗 ${pct}%`;
}

// ---------- 画面: ダッシュボード ----------

function viewDashboard() {
  const overall = summarize(allTopics());
  const subjects = state.curriculum.subjects.map((subject) => {
    const subjectSum = summarize(subject.fields.flatMap((f) => f.topics));
    const fields = subject.fields.map((field) => {
      const sum = summarize(field.topics);
      const chips = field.topics.map((t) =>
        `<a class="chip" href="#/page/${t.id}"><span class="dot ${statusOf(t.id)}"></span>${escapeHtml(t.title)}</a>`).join('');
      return `<div class="field-row">
          <div>${escapeHtml(field.title)}</div>
          ${progressBar(sum)}
          <div class="pct">${sum.counts.done}/${sum.total}</div>
        </div>
        <div class="field-topics">${chips}</div>`;
    }).join('');
    return `<section class="card">
      <h2 style="margin:0 0 6px">${escapeHtml(subject.title)}</h2>
      ${progressBar(subjectSum)}
      ${statsLine(subjectSum)}
      <div style="margin-top:14px">${fields}</div>
    </section>`;
  }).join('');

  main().innerHTML = `
    <h1>執筆の進捗</h1>
    <section class="card">
      ${progressBar(overall)}
      ${statsLine(overall)}
    </section>
    ${subjects}`;
  renderSidebar(null);
}

// ---------- 画面: 記事 ----------

async function viewPage(id) {
  const page = await loadPage(id);
  const body = page.content.trim()
    ? renderMarkdown(page.content)
    : `<div class="empty">まだ本文がありません。${state.readOnly ? '' : `<br><br><a class="btn primary" href="#/edit/${id}">書き始める</a>`}</div>`;
  main().innerHTML = `
    <div class="breadcrumb">${escapeHtml(page.subject.title)} › ${escapeHtml(page.field.title)}</div>
    <h1>${escapeHtml(page.title)}</h1>
    <div class="meta">
      <span class="badge ${page.status}">${STATUS_LABEL[page.status]}</span>
      ${page.updatedAt ? `<span>最終更新: ${formatDate(page.updatedAt)}</span>` : ''}
      ${state.readOnly ? '' : `<a class="btn" href="#/edit/${id}">編集</a>`}
    </div>
    <article class="article">${body}</article>`;
  renderSidebar(id);
}

// ---------- 画面: 編集 ----------

async function viewEdit(id) {
  const page = await loadPage(id);
  const initial = page.content || PAGE_TEMPLATE;
  const options = Object.entries(STATUS_LABEL).map(([v, label]) =>
    `<option value="${v}"${v === page.status ? ' selected' : ''}>${label}</option>`).join('');

  main().innerHTML = `
    <div class="breadcrumb">${escapeHtml(page.subject.title)} › ${escapeHtml(page.field.title)}</div>
    <h1>${escapeHtml(page.title)} を編集</h1>
    <div class="editor-toolbar">
      <label>状態 <select id="status">${options}</select></label>
      <span class="save-state" id="saveState"></span>
      <span class="spacer"></span>
      <a class="btn" href="#/page/${id}">戻る</a>
      <button class="btn primary" id="saveBtn">保存</button>
    </div>
    <div class="editor">
      <textarea id="content" spellcheck="false"></textarea>
      <div class="article" id="preview"></div>
    </div>
    <div class="hint">Markdown で記述できます。数式は <code>$F = ma$</code>（文中）や <code>$$ ... $$</code>（別行）で KaTeX 表示。Ctrl+S で保存。</div>`;

  const textarea = $('#content');
  const preview = $('#preview');
  const statusSel = $('#status');
  const saveBtn = $('#saveBtn');
  const saveState = $('#saveState');
  textarea.value = initial;

  let timer;
  const updatePreview = () => { preview.innerHTML = renderMarkdown(textarea.value); };
  const markDirty = () => { state.dirty = true; saveState.textContent = '未保存の変更があります'; };
  updatePreview();

  textarea.addEventListener('input', () => {
    markDirty();
    clearTimeout(timer);
    timer = setTimeout(updatePreview, 200);
  });
  statusSel.addEventListener('change', markDirty);

  // Tab キーでインデントを入力できるようにする
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
      markDirty();
    }
  });

  const save = async () => {
    saveBtn.disabled = true;
    saveState.textContent = '保存中…';
    try {
      const { updatedAt } = await api(`api/pages/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: textarea.value, status: statusSel.value }),
      });
      state.curriculum.progress[id] = { status: statusSel.value, updatedAt };
      state.dirty = false;
      saveState.textContent = `保存しました（${formatDate(updatedAt)}）`;
      renderSidebar(id);
    } catch (err) {
      saveState.textContent = `保存に失敗しました: ${err.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  };
  saveBtn.addEventListener('click', save);
  main().onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  };
  renderSidebar(id);
  textarea.focus();
}

// ---------- ルーティング ----------

let currentHash = location.hash;

async function route() {
  if (state.dirty && !confirm('保存していない変更があります。移動しますか？')) {
    history.replaceState(null, '', currentHash || '#/');
    return;
  }
  state.dirty = false;
  currentHash = location.hash;
  main().onkeydown = null;
  $('#sidebar').classList.remove('open');

  const [, view, id] = (location.hash.replace(/^#/, '') || '/').split('/');
  try {
    if (view === 'page' && id) await viewPage(id);
    else if (view === 'edit' && id && state.readOnly) location.replace(`#/page/${id}`);
    else if (view === 'edit' && id) await viewEdit(id);
    else viewDashboard();
  } catch (err) {
    main().innerHTML = `<div class="empty">読み込みに失敗しました: ${escapeHtml(err.message)}<br><br><a href="#/">トップへ</a></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

document.addEventListener('DOMContentLoaded', async () => {
  $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#search').addEventListener('input', () => {
    const m = location.hash.match(/^#\/(?:page|edit)\/([a-z0-9-]+)/);
    renderSidebar(m ? m[1] : null);
  });
  try {
    await loadCurriculum();
  } catch (err) {
    main().innerHTML = `<div class="empty">サーバーに接続できません: ${escapeHtml(err.message)}</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  route();
});
