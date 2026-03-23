// =====================================================
// NEW MAGAZINE - settings.js
// =====================================================

const ICONS = {'건축':'🏛️','디자인':'✏️','SNS':'💬','커뮤니티':'👥','핫딜':'🛒','국내뉴스':'📰','해외뉴스':'🌐','기타':'📄'};

let sources  = [];
let keywords = {}; // { sourceId: { include:[], exclude:[] } }

async function init() {
  const data = await chrome.storage.local.get(['sources','keywords','adTop','adBottom','adCoupang','adAmazon','openInNewTab']);
  sources  = data.sources  || [];
  keywords = data.keywords || {};
  renderSources();
  renderBulkEdit();
  loadAds(data);
  setupTabs();
  setupButtons();
}

// ── 탭 ──────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab,.pane').forEach(el => el.classList.remove('on'));
      t.classList.add('on');
      document.getElementById('pane-' + t.dataset.t).classList.add('on');
    });
  });
}

// ── 공통 버튼 ───────────────────────────
function setupButtons() {
  document.getElementById('btnAdd').addEventListener('click', addSource);
  document.getElementById('btnReset').addEventListener('click', resetSources);
  document.getElementById('btnClear').addEventListener('click', clearData);
  document.getElementById('btnExport').addEventListener('click', exportSources);
  document.getElementById('importFile').addEventListener('change', importSources);
  document.getElementById('btnSaveAds').addEventListener('click', saveAds);

  // 링크 열기 방식 토글
  const toggle = document.getElementById('openInNewTab');
  const thumb  = toggle?.parentElement?.querySelector('.tog-thumb');
  const track  = toggle?.parentElement?.querySelector('.tog-track');
  if (toggle) {
    // 저장된 값 로드
    toggle.checked = data.openInNewTab || false;
    updateToggleStyle();

    toggle.addEventListener('change', async () => {
      await chrome.storage.local.set({ openInNewTab: toggle.checked });
      updateToggleStyle();
      showToast(toggle.checked ? '새 탭에서 열기로 변경됨' : '현재 탭에서 열기로 변경됨');
    });

    function updateToggleStyle() {
      if (track) track.style.background = toggle.checked ? 'var(--text)' : 'var(--border2)';
      if (thumb) thumb.style.transform  = toggle.checked ? 'translateX(15px)' : 'translateX(0)';
    }
  }
  document.getElementById('btnBulkSave').addEventListener('click', saveBulkEdit);
  document.getElementById('btnBulkClearAll').addEventListener('click', clearAllKeywords);
}

// ══════════════════════════════════════════
// 소스 렌더링
// ══════════════════════════════════════════
function renderSources() {
  const container = document.getElementById('srcByCat');
  const cats = [...new Set(sources.map(s => s.category))];

  container.innerHTML = cats.map(cat => {
    const list = sources.filter(s => s.category === cat);
    const icon = ICONS[cat] || ICONS['기타'];
    const activeN = list.filter(s => s.enabled).length;
    const allOn  = activeN === list.length;
    return `
      <div class="sec">
        <div class="sec-hd">
          <span>${icon} ${esc(cat)} <span style="font-weight:400;color:var(--text3)">(${activeN}/${list.length})</span></span>
          <div style="display:flex;gap:4px">
            <button class="btn-cat-toggle" data-cat="${esc(cat)}" data-enable="true"
              style="font-size:10px;padding:2px 8px;border-radius:4px;background:none;border:.5px solid var(--border2);color:var(--text2);cursor:pointer">
              모두켜기
            </button>
            <button class="btn-cat-toggle" data-cat="${esc(cat)}" data-enable="false"
              style="font-size:10px;padding:2px 8px;border-radius:4px;background:none;border:.5px solid var(--border2);color:var(--text2);cursor:pointer">
              모두끄기
            </button>
          </div>
        </div>
        ${list.map(s => srcCardHTML(s)).join('')}
      </div>`;
  }).join('');

  // 이벤트
  container.addEventListener('change', onToggle);
  container.addEventListener('click', onAction);
  // 카테고리 모두켜기/끄기
  container.addEventListener('click', e => {
    const btn = e.target.closest('.btn-cat-toggle');
    if (!btn) return;
    const cat    = btn.dataset.cat;
    const enable = btn.dataset.enable === 'true';
    sources.forEach(s => { if (s.category === cat) s.enabled = enable; });
    saveSources(); renderSources(); renderBulkEdit();
    showToast(`${cat} ${enable ? '전체 활성화' : '전체 비활성화'}`);
  });
  // 엔터 키 지원 (CSP 준수 — 이벤트 위임)
  container.addEventListener('keydown', e => {
    const inp = e.target;
    if (e.key !== 'Enter' || !inp.dataset.kwInput) return;
    e.preventDefault();
    const type = inp.dataset.kwInput; // 'inc' or 'exc'
    const id   = inp.dataset.id;
    const btn  = container.querySelector(`[data-kw="add-${type}"][data-id="${id}"]`);
    btn?.click();
  });
}

function srcCardHTML(src) {
  const icon  = ICONS[src.category] || ICONS['기타'];
  const short = src.url.replace(/^https?:\/\//,'').slice(0,50);
  const kw    = keywords[src.id] || { include:[], exclude:[] };
  const hasKw = kw.include.length > 0 || kw.exclude.length > 0;
  return `
    <div class="src-card" data-id="${src.id}">
      <div class="src-row">
        <div class="src-icon">${icon}</div>
        <div class="src-info">
          <div class="src-name">${esc(src.name)}</div>
          <div class="src-url">${esc(short)}</div>
        </div>
        ${hasKw ? `<span style="font-size:10px;color:var(--text3)">🔍</span>` : ''}
        <div class="src-actions">
          <label class="tog">
            <input type="checkbox" ${src.enabled?'checked':''} data-action="toggle" data-id="${src.id}">
            <div class="tog-track"></div>
            <div class="tog-thumb"></div>
          </label>
          <button class="btn-edit" data-action="edit" data-id="${src.id}">편집</button>
          <button class="btn-del" data-action="delete" data-id="${src.id}" title="삭제">×</button>
        </div>
      </div>
      ${editPanelHTML(src, kw)}
    </div>`;
}

function editPanelHTML(src, kw) {
  const incTags = (kw.include||[]).map((w,i) =>
    `<span class="kw-tag inc">${esc(w)}<button data-kw="del-inc" data-id="${src.id}" data-i="${i}">×</button></span>`).join('');
  const excTags = (kw.exclude||[]).map((w,i) =>
    `<span class="kw-tag exc">${esc(w)}<button data-kw="del-exc" data-id="${src.id}" data-i="${i}">×</button></span>`).join('');
  return `
    <div class="edit-panel" id="ep-${src.id}">
      <div class="ep-grid">
        <div><div class="ep-label">이름</div><input type="text" value="${esc(src.name)}" data-field="name" data-id="${src.id}"></div>
        <div><div class="ep-label">카테고리</div><input type="text" value="${esc(src.category)}" data-field="category" data-id="${src.id}"></div>
      </div>
      <div class="ep-full"><div class="ep-label">URL</div><input type="text" value="${esc(src.url)}" data-field="url" data-id="${src.id}"></div>
      <div class="ep-full">
        <div class="ep-label">타입</div>
        <select data-field="type" data-id="${src.id}">
          <option value="rss"    ${src.type==='rss'   ?'selected':''}>RSS 피드</option>
          <option value="visit"  ${src.type==='visit' ?'selected':''}>👁 방문 시 자동 수집</option>
          <option value="scrape" ${src.type==='scrape'?'selected':''}>HTML 스크래핑</option>
        </select>
      </div>

      <div class="ep-kw-section">
        <div class="ep-kw-hd">✅ 포함 키워드 <span style="font-weight:400;color:var(--text3)">(없으면 전체 표시)</span></div>
        <div class="kw-tags">${incTags || '<span style="font-size:11px;color:var(--text3)">없음</span>'}</div>
        <div class="kw-input-row">
          <input type="text" placeholder="키워드, 쉼표로 구분" id="inc-inp-${src.id}" data-kw-input="inc" data-id="${src.id}">
          <button data-kw="add-inc" data-id="${src.id}">+ 추가</button>
        </div>
        <div class="kw-hint">쉼표로 여러 개 입력 &nbsp;·&nbsp; 엔터로 추가</div>
      </div>

      <div class="ep-kw-section" style="margin-top:10px">
        <div class="ep-kw-hd">🚫 제외 키워드 <span style="font-weight:400;color:var(--text3)">(포함 시 숨김)</span></div>
        <div class="kw-tags">${excTags || '<span style="font-size:11px;color:var(--text3)">없음</span>'}</div>
        <div class="kw-input-row">
          <input type="text" placeholder="키워드, 쉼표로 구분" id="exc-inp-${src.id}" data-kw-input="exc" data-id="${src.id}">
          <button data-kw="add-exc" data-id="${src.id}">+ 추가</button>
        </div>
        <div class="kw-hint">쉼표로 여러 개 입력 &nbsp;·&nbsp; 엔터로 추가</div>
      </div>

      <div class="ep-save">
        <button class="btn-save" data-action="save" data-id="${src.id}">저장</button>
        <button class="btn-cancel" data-action="close" data-id="${src.id}">취소</button>
      </div>
    </div>`;
}

// ── 이벤트 처리 ─────────────────────────
function onToggle(e) {
  if (e.target.dataset.action !== 'toggle') return;
  const src = sources.find(s => s.id === e.target.dataset.id);
  if (!src) return;
  src.enabled = e.target.checked;
  saveSources();
  showToast(`${src.name} ${src.enabled ? '활성화':'비활성화'}`);
  renderSources();
}

function onAction(e) {
  // 편집 패널 열기
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    const id = editBtn.dataset.id;
    const ep = document.getElementById('ep-' + id);
    ep.classList.toggle('open');
    editBtn.textContent = ep.classList.contains('open') ? '닫기' : '편집';
    return;
  }

  // 닫기
  const closeBtn = e.target.closest('[data-action="close"]');
  if (closeBtn) {
    const id = closeBtn.dataset.id;
    document.getElementById('ep-' + id).classList.remove('open');
    document.querySelector(`[data-action="edit"][data-id="${id}"]`).textContent = '편집';
    return;
  }

  // 저장
  const saveBtn = e.target.closest('[data-action="save"]');
  if (saveBtn) {
    const id  = saveBtn.dataset.id;
    const src = sources.find(s => s.id === id);
    if (!src) return;
    const panel = document.getElementById('ep-' + id);
    src.name     = panel.querySelector('[data-field="name"]').value.trim()     || src.name;
    src.category = panel.querySelector('[data-field="category"]').value.trim() || src.category;
    src.url      = panel.querySelector('[data-field="url"]').value.trim()      || src.url;
    src.type     = panel.querySelector('[data-field="type"]').value;
    saveSources();
    showToast(`${src.name} 저장됨`);
    panel.classList.remove('open');
    document.querySelector(`[data-action="edit"][data-id="${id}"]`).textContent = '편집';
    renderSources();
    return;
  }

  // 삭제
  const delBtn = e.target.closest('[data-action="delete"]');
  if (delBtn) {
    const src = sources.find(s => s.id === delBtn.dataset.id);
    if (!src || !confirm(`"${src.name}"을 삭제할까요?`)) return;
    sources = sources.filter(s => s.id !== delBtn.dataset.id);
    delete keywords[delBtn.dataset.id];
    saveSources(); saveKeywords();
    renderSources();
    showToast(`${src.name} 삭제됨`);
    return;
  }

  // 키워드 액션
  const kwBtn = e.target.closest('[data-kw]');
  if (kwBtn) onKw(kwBtn);
}

function addKwTokens(arr, raw) {
  // 쉼표로 구분, 중복 제거
  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  tokens.forEach(t => { if (!arr.includes(t)) arr.push(t); });
}

function onKw(btn) {
  const action = btn.dataset.kw;
  const id     = btn.dataset.id;
  const i      = parseInt(btn.dataset.i);
  if (!keywords[id]) keywords[id] = { include:[], exclude:[] };
  const kw = keywords[id];

  if (action === 'del-inc') kw.include.splice(i, 1);
  else if (action === 'del-exc') kw.exclude.splice(i, 1);
  else if (action === 'add-inc') {
    const inp = document.getElementById(`inc-inp-${id}`);
    addKwTokens(kw.include, inp.value);
    inp.value = '';
  }
  else if (action === 'add-exc') {
    const inp = document.getElementById(`exc-inp-${id}`);
    addKwTokens(kw.exclude, inp.value);
    inp.value = '';
  }

  saveKeywords();
  // 해당 카드의 edit-panel만 리렌더
  const src = sources.find(s => s.id === id);
  if (!src) return;
  const ep = document.getElementById('ep-' + id);
  if (!ep) return;
  ep.outerHTML; // 리렌더 대신 kw-tags만 업데이트
  renderSources();
  // 패널 다시 열기
  setTimeout(() => {
    const newEp = document.getElementById('ep-' + id);
    if (newEp) newEp.classList.add('open');
    const editBtnEl = document.querySelector(`[data-action="edit"][data-id="${id}"]`);
    if (editBtnEl) editBtnEl.textContent = '닫기';
  }, 0);
}

// ── 소스 추가 ───────────────────────────
async function addSource() {
  const name = document.getElementById('nName').value.trim();
  const url  = document.getElementById('nUrl').value.trim();
  const cat  = document.getElementById('nCat').value.trim() || '기타';
  let type   = document.getElementById('nType').value;

  if (!url || !url.startsWith('http')) { showToast('올바른 URL을 입력하세요'); return; }
  if (sources.some(s => s.url === url)) { showToast('이미 등록된 URL이에요'); return; }

  const btn = document.getElementById('btnAdd');
  btn.disabled = true; btn.textContent = '분석 중...';

  try {
    // ① RSS 자동 감지 시도
    if (type === 'rss' || type === 'auto') {
      const rssUrl = await autoDetectRSS(url);
      if (rssUrl) {
        const finalName = name || new URL(url).hostname.replace('www.','');
        sources.push({ id: `c_${Date.now()}`, name: finalName, type: 'rss', url: rssUrl, category: cat, enabled: true });
        saveSources(); renderSources(); renderBulkEdit();
        document.getElementById('nUrl').value = '';
        document.getElementById('nName').value = '';
        showToast(`✓ RSS 자동 감지됨: ${finalName}`);
        return;
      }
    }

    // ② RSS 없으면 Claude API로 구조 분석
    if (!name) { showToast('이름을 입력하세요'); return; }
    showToast('Claude가 페이지 구조를 분석 중...');
    const config = await analyzeWithClaude(url);

    const newSrc = {
      id: `c_${Date.now()}`, name, type: 'scrape', url, category: cat, enabled: true,
      autoConfig: config  // Claude가 분석한 셀렉터 저장
    };
    sources.push(newSrc);

    if (config) {
      // 스크래핑 구성 저장
      const { scrapeConfigs = {} } = await chrome.storage.local.get('scrapeConfigs');
      scrapeConfigs[newSrc.id] = config;
      await chrome.storage.local.set({ scrapeConfigs });
      showToast(`✓ 구조 자동 분석 완료: ${name}`);
    } else {
      showToast(`추가됨 (수동 설정 필요): ${name}`);
    }

    saveSources(); renderSources(); renderBulkEdit();
    ['nName','nUrl','nCat'].forEach(id => document.getElementById(id).value = '');

  } finally {
    btn.disabled = false; btn.textContent = '추가';
  }
}

// ─────────────────────────────────────────
// RSS 자동 감지
// ─────────────────────────────────────────
async function autoDetectRSS(pageUrl) {
  // 일반적인 RSS 경로들 시도
  const candidates = [
    pageUrl, // 직접 URL이 RSS일 수도
    pageUrl.replace(/\/?$/, '/feed'),
    pageUrl.replace(/\/?$/, '/feed/'),
    pageUrl.replace(/\/?$/, '/rss'),
    pageUrl.replace(/\/?$/, '/rss.xml'),
    pageUrl.replace(/\/?$/, '/atom.xml'),
    pageUrl.replace(/\/?$/, '/index.xml'),
    new URL('/feed', pageUrl).href,
    new URL('/rss', pageUrl).href,
    new URL('/rss.xml', pageUrl).href,
    new URL('/atom.xml', pageUrl).href,
    new URL('/feed.xml', pageUrl).href,
  ];

  // Content Script로 페이지 <link rel="alternate"> 탐색
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_RSS' });
      if (result?.feeds?.length > 0) return result.feeds[0].url;
    }
  } catch(e) {}

  // 직접 fetch로 확인
  for (const url of candidates.slice(1, 6)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000), method: 'HEAD' });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && (ct.includes('xml') || ct.includes('rss') || ct.includes('atom'))) {
        return url;
      }
    } catch(e) {}
  }
  return null;
}

// ─────────────────────────────────────────
// Claude API로 페이지 구조 자동 분석
// ─────────────────────────────────────────
async function analyzeWithClaude(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    // HTML 축약 (Claude API 토큰 절약)
    const shortened = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').slice(0, 8000);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `다음 HTML에서 기사/게시글 목록의 CSS 셀렉터를 찾아주세요.
JSON으로만 답하세요: {"itemSelector":"...","titleSelector":"...","linkSelector":"...","imageSelector":"..."}
없으면 null.

HTML:
${shortened}`
        }]
      })
    });

    const data = await apiRes.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch(e) {
    console.warn('Claude API 분석 실패:', e);
  }
  return null;
}

async function resetSources() {
  if (!confirm('모든 소스를 기본값으로 초기화할까요?')) return;
  const { sources: def } = await chrome.runtime.sendMessage({ type: 'GET_DEFAULTS' });
  sources = def;
  saveSources(); renderSources(); renderBulkEdit();
  showToast('기본 소스로 초기화됨');
}

// ══════════════════════════════════════════
// 일괄 키워드 편집
// ══════════════════════════════════════════
function renderBulkEdit() {
  const container = document.getElementById('bulkRows');
  if (!container) return;

  // 전역(*) 규칙 + 각 소스별 행
  const rows = [
    { id: '*', name: '전체 소스 (공통 규칙)', icon: '🌐' },
    ...sources.map(s => ({ id: s.id, name: s.name, icon: ICONS[s.category] || ICONS['기타'] }))
  ];

  container.innerHTML = rows.map(row => {
    const kw = keywords[row.id] || { include: [], exclude: [] };
    return `
      <div class="bulk-row" data-id="${row.id}">
        <div class="bulk-icon">${row.icon}</div>
        <div class="bulk-name">${esc(row.name)}</div>
        <div class="bulk-inputs">
          <div>
            <div class="bulk-lbl">✅ 포함</div>
            <input type="text" class="bulk-inc" data-id="${row.id}"
              placeholder="키워드, 쉼표 구분"
              value="${esc((kw.include||[]).join(', '))}">
          </div>
          <div>
            <div class="bulk-lbl">🚫 제외</div>
            <input type="text" class="bulk-exc" data-id="${row.id}"
              placeholder="키워드, 쉼표 구분"
              value="${esc((kw.exclude||[]).join(', '))}">
          </div>
        </div>
      </div>`;
  }).join('');
}

function saveBulkEdit() {
  const rows = document.querySelectorAll('.bulk-row');
  rows.forEach(row => {
    const id  = row.dataset.id;
    const inc = row.querySelector('.bulk-inc').value;
    const exc = row.querySelector('.bulk-exc').value;
    const include = inc.split(',').map(s => s.trim()).filter(Boolean);
    const exclude = exc.split(',').map(s => s.trim()).filter(Boolean);
    if (include.length === 0 && exclude.length === 0) {
      delete keywords[id];
    } else {
      keywords[id] = { include, exclude };
    }
  });
  saveKeywords();
  showToast('키워드 일괄 저장됨');
}

function clearAllKeywords() {
  if (!confirm('모든 키워드 규칙을 삭제할까요?')) return;
  keywords = {};
  saveKeywords();
  renderBulkEdit();
  renderSources();
  showToast('키워드 전체 초기화됨');
}

async function saveSources() {
  await chrome.storage.local.set({ sources });
  chrome.runtime.sendMessage({ type: 'SAVE_SOURCES', sources });
}

async function saveKeywords() {
  await chrome.storage.local.set({ keywords });
  // 키워드 변경 후 background에 재fetch 요청 (필터 즉시 반영)
  chrome.runtime.sendMessage({ type: 'FETCH_NOW' }).catch(() => {});
}

// ── 광고 ────────────────────────────────
function loadAds(data) {
  ['adTop','adBottom','adCoupang','adAmazon'].forEach(k => {
    const el = document.getElementById(k);
    if (el && data[k]) el.value = data[k];
  });
}

async function saveAds() {
  const adTop     = document.getElementById('adTop').value.trim();
  const adBottom  = document.getElementById('adBottom').value.trim();
  const adCoupang = document.getElementById('adCoupang').value.trim();
  const adAmazon  = document.getElementById('adAmazon').value.trim();
  await chrome.storage.local.set({ adTop, adBottom, adCoupang, adAmazon });
  showToast('광고 코드 저장됨');
}

// ── Export / Import ────────────────────────
function exportSources() {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    sources: sources.map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      url: s.url,
      category: s.category,
      enabled: s.enabled
    })),
    keywords: keywords
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `custom-magazine-sources-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${sources.length}개 소스 내보내기 완료`);
}

async function importSources(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // 유효성 검사
    if (!data.sources || !Array.isArray(data.sources)) {
      showToast('올바른 파일 형식이 아니에요');
      return;
    }

    // 기존 소스와 합산 (URL 기준 중복 제거)
    const existingUrls = new Set(sources.map(s => s.url));
    let addedCount = 0;

    data.sources.forEach(s => {
      if (!s.url || !s.name) return;
      if (existingUrls.has(s.url)) return; // 중복 스킵
      sources.push({
        id: s.id || `import_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: s.name,
        type: s.type || 'rss',
        url: s.url,
        category: s.category || '기타',
        enabled: s.enabled !== undefined ? s.enabled : true
      });
      existingUrls.add(s.url);
      addedCount++;
    });

    // 키워드도 병합
    if (data.keywords && typeof data.keywords === 'object') {
      Object.assign(keywords, data.keywords);
      await chrome.storage.local.set({ keywords });
    }

    saveSources();
    renderSources();
    renderBulkEdit();
    showToast(`${addedCount}개 소스 가져오기 완료 (중복 ${data.sources.length - addedCount}개 제외)`);

  } catch(err) {
    showToast('파일을 읽는 중 오류가 발생했어요');
    console.error(err);
  }

  // input 초기화 (같은 파일 재선택 가능하도록)
  e.target.value = '';
}

// ── 데이터 초기화 ────────────────────────
async function clearData() {
  if (!confirm('저장된 기사와 읽음 기록을 모두 삭제할까요?')) return;
  await chrome.storage.local.remove(['articles','readUrls','newCount','fetchErrors','lastFetchAt']);
  chrome.action.setBadgeText({ text: '' });
  showToast('데이터 초기화 완료');
}

// ── 유틸 ────────────────────────────────
function esc(s) {
  return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 2200);
}

init();
