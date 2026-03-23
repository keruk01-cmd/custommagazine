// =====================================================
// CUSTOM MAGAZINE - sidepanel.js
// =====================================================

const PAGE_SIZE   = 12;
const AD_INTERVAL = 15;
const AD_KEYWORDS = ['광고','sponsored','[ad]','홍보','협찬','promoted','advertisement'];

// 탭 순서 정의 (스와이프 시 이 순서로 이동)
const TAB_ORDER = ['feed', 'scrap'];

let allArticles    = [];
let cachedSources  = [];
let cachedKeywords = {};
let categoryOrder  = []; // 카테고리 순서 (드래그로 변경)
let scrapUrls      = new Set();
let readUrls       = new Set();
let activeCategory = '전체';
let activeTab      = 'feed';
let lastFetchAt    = null;
let visibleNew     = 0;
let visibleRead    = 0;
let readSectionOpen = false;
let pickerActive   = false;
let openInNewTab   = false; // 설정에서 변경 가능
let pickerData     = null; // { url, selector, articles[] }

// ─────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────
async function init() {
  chrome.runtime.sendMessage({ type: 'MARK_SEEN' });

  const data = await chrome.storage.local.get(['articles','readUrls','scrapUrls','lastFetchAt','sources','keywords','categoryOrder','openInNewTab']);
  allArticles    = data.articles      || [];
  cachedSources  = data.sources       || [];
  cachedKeywords = data.keywords      || {};
  categoryOrder  = data.categoryOrder || [];
  openInNewTab   = data.openInNewTab  || false;
  readUrls      = new Set(data.readUrls  || []);
  scrapUrls     = new Set(data.scrapUrls || []);
  lastFetchAt   = data.lastFetchAt || null;

  if (allArticles.length === 0) {
    document.getElementById('feed').innerHTML =
      '<div class="loading"><div class="spinner"></div><span style="font-size:12px;color:var(--text3)">처음 실행 중...<br>잠시만요</span></div>';
    try {
      await chrome.runtime.sendMessage({ type: 'FETCH_NOW' });
      await new Promise(r => setTimeout(r, 2500));
      const d2 = await chrome.storage.local.get(['articles','lastFetchAt']);
      allArticles = d2.articles || [];
      lastFetchAt = d2.lastFetchAt || null;
    } catch(e) { console.warn(e); }
  }

  buildFilter();
  render();
  renderAds();
  updateFooter();
  setupEvents();
}

function setupEvents() {
  document.getElementById('btnSettings').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') }));
  document.getElementById('btnPicker').addEventListener('click', togglePicker);
  document.getElementById('pickerCancel').addEventListener('click', stopPicker);
  document.getElementById('pickerSave').addEventListener('click', savePickerSource);
  document.getElementById('btnRefresh').addEventListener('click', onRefresh);

  // 필터 바 마우스 드래그 스크롤 (1회만 등록)
  const filterBar = document.getElementById('filterBar');
  let isDraggingBar = false, barStartX = 0, barScrollLeft = 0, barDragMoved = false;
  filterBar.addEventListener('mousedown', e => {
    isDraggingBar = true; barDragMoved = false;
    barStartX = e.pageX - filterBar.offsetLeft;
    barScrollLeft = filterBar.scrollLeft;
    filterBar.style.cursor = 'grabbing';
    filterBar.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (!isDraggingBar) return;
    const x = e.pageX - filterBar.offsetLeft;
    const dx = x - barStartX;
    if (Math.abs(dx) > 3) barDragMoved = true;
    filterBar.scrollLeft = barScrollLeft - dx;
  });
  window.addEventListener('mouseup', () => {
    if (!isDraggingBar) return;
    isDraggingBar = false;
    filterBar.style.cursor = 'grab';
    filterBar.style.userSelect = '';
  });

  // 탭 클릭
  document.getElementById('tabBar').querySelectorAll('.feed-tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  // 피드 영역 좌우 스와이프 → 탭 전환
  initFeedTabSwipe();
}

function initFeedTabSwipe() {
  const feed = document.getElementById('feed');
  let sx = 0, sy = 0, sw = false;
  const MIN_X = 50, MAX_ANGLE = 35;

  feed.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    sw = true;
  }, { passive: true });

  feed.addEventListener('touchend', e => {
    if (!sw) return;
    sw = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = Math.abs(e.changedTouches[0].clientY - sy);
    const angle = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    if (Math.abs(dx) < MIN_X || angle > MAX_ANGLE) return;

    const tabs = TAB_ORDER;
    const idx  = tabs.indexOf(activeTab);
    if (dx < 0 && idx < tabs.length - 1) switchTab(tabs[idx + 1]); // 왼쪽 스와이프 → 다음 탭
    if (dx > 0 && idx > 0)              switchTab(tabs[idx - 1]); // 오른쪽 스와이프 → 이전 탭
  }, { passive: true });

  // 마우스 드래그도 지원 (데스크탑)
  let msx = 0, msy = 0, mdragging = false;
  feed.addEventListener('mousedown', e => {
    // 카드 위에서는 카드 스와이프와 충돌하므로 여백(feed 직접 클릭)만 처리
    if (e.target !== feed) return;
    msx = e.clientX; msy = e.clientY; mdragging = true;
  });
  window.addEventListener('mouseup', e => {
    if (!mdragging) return;
    mdragging = false;
    const dx = e.clientX - msx;
    const dy = Math.abs(e.clientY - msy);
    const angle = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    if (Math.abs(dx) < MIN_X || angle > MAX_ANGLE) return;
    const tabs = TAB_ORDER;
    const idx  = tabs.indexOf(activeTab);
    if (dx < 0 && idx < tabs.length - 1) switchTab(tabs[idx + 1]);
    if (dx > 0 && idx > 0)              switchTab(tabs[idx - 1]);
  });
}

// ─────────────────────────────────────────
// 탭 전환
// ─────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.feed-tab').forEach(t =>
    t.classList.toggle('on', t.dataset.tab === tab));
  const isScrap = tab === 'scrap';
  document.getElementById('filterBar').style.display = isScrap ? 'none' : 'flex';
  visibleNew = visibleRead = 0;
  readSectionOpen = false;

  // 활성 탭이 탭 바에서 보이도록 스크롤
  const activeBtn = document.querySelector(`.feed-tab[data-tab="${tab}"]`);
  activeBtn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  render();
}

// ─────────────────────────────────────────
// 필터 바
// ─────────────────────────────────────────
function buildFilter() {
  const bar = document.getElementById('filterBar');
  // 활성화된 소스의 카테고리 + 기사에 있는 카테고리 모두 합산
  // → 피드가 없어도 활성 소스가 있으면 탭 표시
  const fromSources  = cachedSources.filter(s => s.enabled).map(s => s.category).filter(Boolean);
  const fromArticles = allArticles.map(a => a.category).filter(Boolean);
  const rawCats = [...new Set([...fromSources, ...fromArticles])];
  // 저장된 순서 적용, 새 카테고리는 뒤에 추가
  const orderedCats = [
    ...categoryOrder.filter(c => rawCats.includes(c)),
    ...rawCats.filter(c => !categoryOrder.includes(c))
  ];
  const cats = ['전체', ...orderedCats];

  // 현재 카테고리가 목록에 없으면 전체로 리셋
  if (!cats.includes(activeCategory)) activeCategory = '전체';

  bar.innerHTML = cats.map(cat =>
    `<button class="chip ${cat===activeCategory?'on':''}" data-cat="${cat}"
      draggable="${cat!=='전체'?'true':'false'}">${cat}</button>`
  ).join('');

  // 활성 칩이 보이도록 스크롤
  requestAnimationFrame(() => {
    const activeChip = bar.querySelector('.chip.on');
    if (activeChip) activeChip.scrollIntoView({ behavior:'instant', block:'nearest', inline:'nearest' });
  });

  // 클릭 (짧은 클릭만)
  bar.querySelectorAll('.chip').forEach(b => {
    let downX = 0;
    b.addEventListener('mousedown', e => { downX = e.clientX; });
    b.addEventListener('click', e => {
      if (Math.abs(e.clientX - downX) > 5) return; // 드래그 후 클릭 무시
      activeCategory = b.dataset.cat;
      bar.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      visibleNew = visibleRead = 0;
      readSectionOpen = false;
      render();
    });
  });

  // 드래그로 카테고리 순서 변경
  let dragChip = null;
  bar.querySelectorAll('.chip[draggable="true"]').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      dragChip = chip;
      chip.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      chip.style.opacity = '';
      dragChip = null;
      // 새 순서 저장 (전체 제외)
      categoryOrder = [...bar.querySelectorAll('.chip[draggable="true"]')].map(c => c.dataset.cat);
      chrome.storage.local.set({ categoryOrder });
    });
    chip.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragChip || dragChip === chip) return;
      const rect = chip.getBoundingClientRect();
      const mid  = rect.left + rect.width / 2;
      if (e.clientX < mid) bar.insertBefore(dragChip, chip);
      else bar.insertBefore(dragChip, chip.nextSibling);
    });
  });

  // 마우스 드래그 스크롤 (칩 드래그 중 아닐 때)
  let isDraggingBar = false, barStartX = 0, barScrollLeft = 0;
  bar.addEventListener('mousedown', e => {
    if (e.target.closest('.chip')) return;
    isDraggingBar = true;
    barStartX = e.pageX - bar.offsetLeft;
    barScrollLeft = bar.scrollLeft;
    bar.style.cursor = 'grabbing';
    bar.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (!isDraggingBar) return;
    e.preventDefault();
    const x = e.pageX - bar.offsetLeft;
    bar.scrollLeft = barScrollLeft - (x - barStartX);
  });
  window.addEventListener('mouseup', () => {
  if (!isDraggingBar) return;
  isDraggingBar = false;
  bar.style.cursor = '';
  bar.style.userSelect = '';
  });
}

// ─────────────────────────────────────────
// 메인 렌더
// ─────────────────────────────────────────
function render() {
  if (activeTab === 'scrap') { renderScrap(); return; }

  const feed = document.getElementById('feed');

  // cachedSources 사용 (동기 처리 - 비동기 타이밍 오류 방지)
  const srcList    = cachedSources;
  const enabledIds = new Set(srcList.filter(s => s.enabled).map(s => s.id));
  const filtered0  = srcList.length === 0
    ? allArticles
    : allArticles.filter(a => !a.sourceId || enabledIds.has(a.sourceId));

  renderWithList(filtered0, feed);
}

function applyKeywordFilter(articles, keywords) {
  if (!keywords || Object.keys(keywords).length === 0) return articles;
  return articles.filter(article => {
    const text = ((article.title||'') + ' ' + (article.summary||'')).toLowerCase();
    const globalRule = keywords['*'];
    const sourceRule = keywords[article.sourceId];
    // 이 글에 적용할 규칙이 없으면 통과
    if (!globalRule && !sourceRule) return true;
    for (const rule of [globalRule, sourceRule].filter(Boolean)) {
      if (rule.exclude?.length > 0) {
        if (rule.exclude.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
      if (rule.include?.length > 0) {
        if (!rule.include.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
    }
    return true;
  });
}

function renderWithList(filtered0, feed) {
  // 키워드 필터를 sidepanel에서도 적용 (이미 저장된 글 포함)
  const keywords = cachedKeywords || {};
  const filtered1 = applyKeywordFilter(filtered0, keywords);

  let list = activeCategory === '전체'
    ? filtered1
    : filtered1.filter(a => a.category === activeCategory);

  list = list.map(a => ({ ...a, _isAd: isAdContent(a) }));

  if (list.length === 0) {
    feed.innerHTML = emptyHTML('새 글이 없어요', '새로고침을 눌러보세요');
    updateBadge(0); return;
  }

  const newItems  = list.filter(a => !readUrls.has(a.url));
  const readItems = list.filter(a =>  readUrls.has(a.url));
  updateBadge(newItems.length);

  if (!visibleNew)  visibleNew  = Math.min(PAGE_SIZE, newItems.length);

  const showNew = newItems.slice(0, visibleNew);

  chrome.storage.local.get(['adCoupang','adAmazon'], ({ adCoupang='', adAmazon='' }) => {
    const inlineAds = [adCoupang, adAmazon].filter(Boolean);
    let html = '';

    // 새 글 카드
    showNew.forEach((a, i) => {
      html += cardWrapHTML(a, true);
      if (inlineAds.length && (i + 1) % AD_INTERVAL === 0) {
        const ad = inlineAds[Math.floor(i / AD_INTERVAL) % inlineAds.length];
        html += `<div class="ad-inline"><div class="ad-inline-label">AD · 광고</div>${ad}</div>`;
      }
    });

    if (newItems.length > visibleNew) {
      html += `<button class="load-more" id="lmNew">↓ 새 글 ${newItems.length - visibleNew}개 더보기</button>`;
    }

    // 읽은 글 — 하단 접기/펼치기
    if (readItems.length > 0) {
      if (!visibleRead) visibleRead = Math.min(PAGE_SIZE, readItems.length);
      const showReadItems = readItems.slice(0, visibleRead);

      html += `
        <div class="read-section">
          <button class="read-toggle-btn ${readSectionOpen?'open':''}" id="readToggleBtn">
            <span>읽은 글 ${readItems.length}개</span>
            <span class="arrow">▼</span>
          </button>
          <div class="read-list ${readSectionOpen?'open':''}">
            ${showReadItems.map(a => cardWrapHTML(a, false)).join('')}
            ${readItems.length > visibleRead
              ? `<button class="load-more" id="lmRead">↓ 읽은 글 ${readItems.length - visibleRead}개 더보기</button>`
              : ''}
          </div>
        </div>`;
    }

    feed.innerHTML = html;
    bindCards(feed);

    // 더보기
    document.getElementById('lmNew')?.addEventListener('click', () => {
      visibleNew = Math.min(visibleNew + PAGE_SIZE, newItems.length); render();
    });
    document.getElementById('lmRead')?.addEventListener('click', () => {
      visibleRead = Math.min(visibleRead + PAGE_SIZE, readItems.length); render();
    });

    // 읽은 글 토글
    document.getElementById('readToggleBtn')?.addEventListener('click', () => {
      readSectionOpen = !readSectionOpen;
      render();
      if (readSectionOpen) {
        setTimeout(() => {
          document.querySelector('.read-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    });
  });
}

// ─────────────────────────────────────────
// 스크랩 탭
// ─────────────────────────────────────────
function renderScrap() {
  const feed = document.getElementById('feed');
  const list = allArticles.filter(a => scrapUrls.has(a.url));
  updateScrapCount();

  if (list.length === 0) {
    feed.innerHTML = emptyHTML('스크랩한 글이 없어요', '카드 우측 ☆ 버튼으로 저장하세요');
    return;
  }
  feed.innerHTML = list.map(a => cardWrapHTML(a, !readUrls.has(a.url))).join('');
  bindCards(feed);
}

// ─────────────────────────────────────────
// 카드 HTML
// ─────────────────────────────────────────
function cardWrapHTML(article, isNew) {
  const isRead    = readUrls.has(article.url);
  const isScrapped = scrapUrls.has(article.url);
  const isAd      = article._isAd;
  const timeStr   = relTime(article.pubDate);

  // onerror 인라인 핸들러 제거 (CSP 위반) → data-img 속성으로 이벤트 위임
  const thumbContent = article.thumbnail
    ? `<img class="card-thumb" data-img="${esc(article.thumbnail)}" alt="" loading="lazy">
       <div class="thumb-ph" style="display:none">${thumbIcon()}</div>`
    : `<div class="thumb-ph">${thumbIcon()}</div>`;

  const newBadge = (isNew && !isRead)
    ? `<div class="thumb-new" id="tn-${uid(article.url)}">NEW</div>`
    : '';

  return `
  <div class="card-wrap" data-url="${esc(article.url)}">
    <div class="sw-bg left">${trashSVG()}</div>
    <div class="sw-bg right">${trashSVG()}</div>
    <div class="card ${isNew&&!isRead?'is-new':''} ${isRead?'read':''} ${isAd?'is-ad':''}" data-url="${esc(article.url)}">
      <div class="thumb-wrap" data-url="${esc(article.url)}">
        ${thumbContent}
        ${newBadge}
      </div>
      <div class="card-body">
        <div>
          <div class="card-meta">
            <span class="card-source ${isRead?'read':''}">${esc(article.sourceName)}</span>
            <span class="card-dot">·</span>
            <span class="card-time">${timeStr}</span>
            ${isAd ? '<span class="ad-badge">광고</span>' : ''}
          </div>
          <div class="card-title">${esc(article.title)}</div>
        </div>
        ${article.summary ? `<div class="card-summary">${esc(article.summary)}</div>` : ''}
      </div>
      <button class="scrap-btn ${isScrapped?'on':''}" data-url="${esc(article.url)}">${starSVG(isScrapped)}</button>
    </div>
  </div>`;
}

// ─────────────────────────────────────────
// 카드 이벤트 바인딩
// ─────────────────────────────────────────
function bindCards(container) {
  container.querySelectorAll('.card-wrap').forEach(wrap => {
    const card = wrap.querySelector('.card');
    const url  = wrap.dataset.url;

    // 이미지 로드 (onerror 인라인 대신 JS 처리 - CSP 준수)
    const img = card.querySelector('img.card-thumb[data-img]');
    if (img) {
      img.src = img.dataset.img;
      img.addEventListener('error', () => {
        img.style.display = 'none';
        const ph = img.nextElementSibling;
        if (ph) { ph.style.display = 'flex'; ph.style.width = '82px'; ph.style.height = '82px'; }
      });
    }

    // 스크랩 버튼
    card.querySelector('.scrap-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      toggleScrap(url, card.querySelector('.scrap-btn'));
    });

    // (썸네일 hover 읽음 처리 제거됨)

    // 카드 클릭 (스와이프 중이면 무시)
    card.addEventListener('click', e => {
      if (e.target.closest('.scrap-btn')) return;
      if (card._wasSwiping) return; // 스와이프 후 클릭 방지
      markRead(url);
      card.classList.remove('is-new'); card.classList.add('read');
      card.querySelector('.card-source')?.classList.add('read');
      card.querySelector('.thumb-new')?.remove();
      openUrl(url);
    });

    // 스와이프 초기화
    initSwipe(wrap, card, url);
  });
}

// ─────────────────────────────────────────
// 스와이프 삭제
// ─────────────────────────────────────────
function initSwipe(wrap, card, url) {
  let startX = 0, startY = 0, dx = 0, dragging = false, moved = false;
  const THRESHOLD = 75;
  const ANGLE_LIMIT = 35; // 도 — 수직 스크롤과 구분

  const bgL = wrap.querySelector('.sw-bg.left');
  const bgR = wrap.querySelector('.sw-bg.right');

  function onStart(x, y) {
    startX = x; startY = y; dx = 0;
    dragging = true; moved = false;
    card._wasSwiping = false;
    card.style.transition = 'none';
  }

  function onMove(x, y) {
    if (!dragging) return;
    dx = x - startX;
    const dy = Math.abs(y - startY);
    const angle = Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI;
    if (Math.abs(dx) < 5) return;

    // 수직 스크롤 중이면 스와이프 무시
    if (angle > ANGLE_LIMIT) { dragging = false; return; }

    moved = true;
    card.style.transform = `translateX(${dx}px)`;
    const ratio = Math.min(1, Math.abs(dx) / THRESHOLD);
    bgL.style.opacity = dx < 0 ? ratio : 0;
    bgR.style.opacity = dx > 0 ? ratio : 0;
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;

    if (moved && Math.abs(dx) >= THRESHOLD) {
      // 날아가기
      card._wasSwiping = true;
      card.style.transition = 'transform .22s ease';
      card.style.transform = `translateX(${dx > 0 ? '110%' : '-110%'})`;
      removeCard(wrap, url);
    } else {
      // 복귀
      card.style.transition = 'transform .18s ease';
      card.style.transform = 'translateX(0)';
      bgL.style.opacity = 0;
      bgR.style.opacity = 0;
      // 짧게 움직인 건 클릭으로 처리 (moved=false면 클릭 허용)
      if (moved) card._wasSwiping = true;
      setTimeout(() => { card._wasSwiping = false; }, 50);
    }
  }

  // 마우스
  card.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    onStart(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e => { if (dragging) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   () => { if (dragging) onEnd(); });

  // 터치
  card.addEventListener('touchstart', e => {
    onStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  card.addEventListener('touchend', onEnd);
}

function removeCard(wrap, url) {
  const h = wrap.offsetHeight;
  wrap.style.height = h + 'px';
  wrap.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    wrap.style.transition = 'height .22s ease, margin-bottom .22s ease, opacity .22s ease';
    wrap.style.height = '0';
    wrap.style.marginBottom = '0';
    wrap.style.opacity = '0';
  });
  setTimeout(() => {
    wrap.remove();
    allArticles = allArticles.filter(a => a.url !== url);
    chrome.storage.local.set({ articles: allArticles });
    updateBadge(allArticles.filter(a => !readUrls.has(a.url)).length);
    updateFooter();
  }, 250);
}

// ─────────────────────────────────────────
// 스크랩
// ─────────────────────────────────────────
async function toggleScrap(url, btn) {
  if (scrapUrls.has(url)) {
    scrapUrls.delete(url);
    btn.classList.remove('on');
    btn.innerHTML = starSVG(false);
    showToast('스크랩 해제됨');
  } else {
    scrapUrls.add(url);
    btn.classList.add('on');
    btn.innerHTML = starSVG(true);
    showToast('★ 스크랩 저장됨');
  }
  await chrome.storage.local.set({ scrapUrls: [...scrapUrls] });
  updateScrapCount();
}

function updateScrapCount() {
  const el = document.getElementById('scrapCount');
  if (el) el.textContent = scrapUrls.size > 0 ? `(${scrapUrls.size})` : '';
}

// ─────────────────────────────────────────
// 읽음 처리
// ─────────────────────────────────────────
async function markRead(url) {
  if (readUrls.has(url)) return;
  readUrls.add(url);
  await chrome.storage.local.set({ readUrls: [...readUrls].slice(-500) });
}

function updateBadge(n) {
  const el = document.getElementById('badge');
  el.textContent = n > 99 ? '99+' : n;
  el.style.display = n > 0 ? 'inline-block' : 'none';
}

// ─────────────────────────────────────────
// 광고
// ─────────────────────────────────────────
function isAdContent(a) {
  const t = (a.title + ' ' + (a.summary||'')).toLowerCase();
  return AD_KEYWORDS.some(k => t.includes(k));
}

async function renderAds() {
  const { adTop='', adBottom='' } = await chrome.storage.local.get(['adTop','adBottom']);
  if (adTop) {
    document.getElementById('adTop').classList.add('on');
    const c = document.getElementById('adTopContent');
    c.innerHTML = adTop; injectScripts(c);
  }
  if (adBottom) {
    document.getElementById('adBottom').classList.add('on');
    const c = document.getElementById('adBottomContent');
    c.innerHTML = adBottom; injectScripts(c);
  }
}

function injectScripts(el) {
  el.querySelectorAll('script').forEach(s => {
    const ns = document.createElement('script');
    if (s.src) ns.src = s.src; else ns.textContent = s.textContent;
    s.replaceWith(ns);
  });
}

// ─────────────────────────────────────────
// 새로고침
// ─────────────────────────────────────────
async function onRefresh() {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true; btn.textContent = '가져오는 중...';
  visibleNew = visibleRead = 0; readSectionOpen = false;
  try {
    await chrome.runtime.sendMessage({ type: 'FETCH_NOW' });
    await new Promise(r => setTimeout(r, 1800));
    const d = await chrome.storage.local.get(['articles','lastFetchAt']);
    allArticles = d.articles || []; lastFetchAt = d.lastFetchAt || null;
    buildFilter(); render(); updateFooter();
    showToast('새 글을 확인했습니다');
  } catch(e) { showToast('일부 소스 오류가 있어요'); }
  finally { btn.disabled = false; btn.textContent = '새로고침'; }
}

// ─────────────────────────────────────────
// 비주얼 피커
// ─────────────────────────────────────────
async function togglePicker() {
  if (pickerActive) { stopPicker(); return; }
  pickerActive  = true;
  pickerSamples = [];

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.url.startsWith('chrome://')) {
    showToast('일반 웹페이지에서만 사용 가능해요');
    pickerActive = false;
    return;
  }

  document.getElementById('btnPicker').classList.add('picking');
  document.getElementById('pickerPanel').style.display = 'block';
  document.getElementById('pickerPreview').style.display = 'none';
  document.getElementById('pickerStatusText').textContent = '게시글 1개를 클릭하세요 (1/3)';
  // 샘플 초기화
  [0,1,2].forEach(i => {
    const el = document.getElementById('sample'+i);
    el.className = 'picker-sample empty';
    el.textContent = ['①','②','③'][i];
  });

  chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_PICKER', mode: 'multi' }, (res) => {
    if (chrome.runtime.lastError) {
      showToast('페이지를 새로고침 후 다시 시도해주세요');
      stopPicker();
    }
  });
}

function stopPicker() {
  pickerActive = false;
  pickerData = null;
  document.getElementById('btnPicker').classList.remove('picking');
  document.getElementById('pickerPanel').style.display = 'none';

  // content.js에 피커 종료 요청
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'DEACTIVATE_PICKER' }, () => {});
  });
}

async function savePickerSource() {
  if (!pickerData || !pickerData.articles?.length) {
    showToast('먼저 게시글 목록을 선택해주세요');
    return;
  }
  const name = document.getElementById('pickerName').value.trim();
  const cat  = document.getElementById('pickerCat').value;
  if (!name) { showToast('소스 이름을 입력하세요'); return; }

  const { sources = [] } = await chrome.storage.local.get('sources');
  const newId = `custom_${Date.now()}`;

  const newSource = {
    id: newId,
    name,
    type: 'visit',
    url: pickerData.url,
    category: cat,
    enabled: true
  };

  // 셀렉터 설정 저장
  if (pickerData.selector) {
    const { scrapeConfigs = {} } = await chrome.storage.local.get('scrapeConfigs');
    scrapeConfigs[newId] = pickerData.config;
    await chrome.storage.local.set({ scrapeConfigs });
  }

  sources.push(newSource);
  await chrome.storage.local.set({ sources });
  cachedSources = sources;
  chrome.runtime.sendMessage({ type: 'SAVE_SOURCES', sources });

  // 감지된 기사 즉시 피드에 추가
  if (pickerData.articles?.length > 0) {
    chrome.runtime.sendMessage({
      type: 'ARTICLES_FROM_PAGE',
      sourceId: newId,
      articles: pickerData.articles
    });
  }

  showToast(`✓ "${name}" 피드에 추가됐어요`);
  stopPicker();
  setTimeout(() => { buildFilter(); render(); }, 500);
}

// content.js에서 피커 메시지 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // 샘플 1개 선택될 때마다
  if (msg.type === 'PICKER_SAMPLE') {
    pickerSamples.push(msg);
    const n = pickerSamples.length;
    // 샘플 칩 업데이트
    const chip = document.getElementById('sample' + (n-1));
    if (chip) {
      chip.className = 'picker-sample filled';
      chip.textContent = msg.title?.slice(0, 12) || ('샘플 ' + n);
    }
    if (n < 3) {
      document.getElementById('pickerStatusText').textContent =
        `게시글 ${n+1}개를 클릭하세요 (${n+1}/3)`;
    } else {
      document.getElementById('pickerStatusText').textContent = '분석 중...';
    }
  }

  // 3개 완료 후 최종 결과
  if (msg.type === 'PICKER_RESULT') {
    pickerData = msg;
    const count = msg.articles.length;
    document.getElementById('pickerStatusText').textContent =
      count > 0 ? `✓ ${count}개 항목 감지됨` : '항목을 찾지 못했어요';
    document.getElementById('pickerMatchCount').textContent =
      `감지된 항목 ${count}개`;
    document.getElementById('pickerPreview').style.display = count > 0 ? 'block' : 'none';
    document.getElementById('pickerPulse').style.animationPlayState = 'paused';

    const itemsEl = document.getElementById('pickerItems');
    itemsEl.innerHTML = msg.articles.slice(0, 5).map(a =>
      `<div class="picker-item">${esc(a.title)}</div>`
    ).join('') + (count > 5
      ? `<div class="picker-item" style="color:var(--text3)">...외 ${count-5}개</div>` : '');

    try {
      const hostname = new URL(msg.url).hostname.replace('www.','');
      document.getElementById('pickerName').placeholder = hostname;
    } catch(e) {}
  }
});

// ─────────────────────────────────────────
// URL 열기 (현재 탭 / 새 탭)
// ─────────────────────────────────────────
function openUrl(url) {
  if (openInNewTab) {
    chrome.tabs.create({ url });
  } else {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
      if (tab) {
        chrome.tabs.update(tab.id, { url });
      } else {
        chrome.tabs.create({ url });
      }
    });
  }
}

// ─────────────────────────────────────────
// 푸터
// ─────────────────────────────────────────
async function updateFooter() {
  const el = document.getElementById('footerText');
  const { fetchErrors=[] } = await chrome.storage.local.get('fetchErrors');
  if (!lastFetchAt && allArticles.length === 0) { el.textContent = '아직 가져오지 않았습니다'; return; }
  if (fetchErrors.length > 0) {
    el.style.color = 'var(--red)'; el.title = fetchErrors.join('\n');
    el.textContent = `⚠ ${fetchErrors.length}개 오류 · ${allArticles.length}개`;
  } else {
    el.style.color = ''; el.title = '';
    el.textContent = `${relTime(lastFetchAt)} 업데이트 · ${allArticles.length}개`;
  }
}

// 스토리지 변경 감지
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.sources) {
    cachedSources = changes.sources.newValue || [];
  }
  if (changes.keywords) {
    cachedKeywords = changes.keywords.newValue || {};
    buildFilter(); render(); // 키워드 변경 즉시 피드 갱신
  }
  if (changes.articles) {
    allArticles = changes.articles.newValue || [];
    buildFilter(); render(); updateFooter();
  }
});

// ─────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────
function relTime(ts) {
  if (!ts) return '';
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(d/3600000), day=Math.floor(d/86400000);
  if (m<1) return '방금 전'; if (m<60) return `${m}분 전`;
  if (h<24) return `${h}시간 전`; if (day<7) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR',{month:'short',day:'numeric'});
}
function esc(s) {
  // 작은따옴표(')는 인코딩하지 않음 — &#39; 로 표시되는 문제 방지
  return s ? s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}
function uid(s) {
  let h=0; for(let i=0;i<(s||'').length;i++) h=(h*31+s.charCodeAt(i))&0xffffffff;
  return Math.abs(h).toString(36);
}
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.display='block';
  clearTimeout(t._t); t._t=setTimeout(()=>t.style.display='none', 2200);
}
function emptyHTML(title, sub) {
  return `<div class="empty">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="3" width="28" height="26" rx="3" stroke="currentColor" stroke-width="1.2"/>
      <line x1="6" y1="10" x2="26" y2="10" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="6" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
      <line x1="6" y1="22" x2="23" y2="22" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    </svg>
    <p>${title}</p><small>${sub}</small></div>`;
}
function thumbIcon() {
  return `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <rect x="1" y="2" width="20" height="18" rx="2" stroke="currentColor" stroke-width="1"/>
    <line x1="4" y1="7" x2="18" y2="7" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    <line x1="4" y1="11" x2="14" y2="11" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
    <line x1="4" y1="15" x2="16" y2="15" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  </svg>`;
}
function starSVG(filled) {
  return filled
    ? `<svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7z" fill="currentColor"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 1l1.8 3.6L14 5.3l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
}
function trashSVG() {
  return `<svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M5 6h10l-1 10H6L5 6z" stroke="var(--text2)" stroke-width="1.3"/>
    <line x1="8" y1="9" x2="8" y2="13" stroke="var(--text2)" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="12" y1="9" x2="12" y2="13" stroke="var(--text2)" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="3" y1="6" x2="17" y2="6" stroke="var(--text2)" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M7 6V4h6v2" stroke="var(--text2)" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;
}

init();
