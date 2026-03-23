// =====================================================
// CUSTOM MAGAZINE - content.js
// 사용자가 등록된 사이트를 방문하면 자동으로 기사 수집
// 임시 탭 생성 없음 - 방문 시에만 동작
// =====================================================

(async function() {
  const { sources = [] } = await chrome.storage.local.get('sources');
  const currentOrigin = location.origin;

  // 등록된 소스 중 현재 사이트와 일치하는 것 찾기
  const matchedSource = sources.find(src => {
    if (!src.enabled) return false;
    try { return new URL(src.url).origin === currentOrigin; }
    catch(e) { return false; }
  });

  if (!matchedSource) return;

  // ① RSS 피드 링크 감지 → background 전달
  const rssFeeds = detectRSSFeeds();
  if (rssFeeds.length > 0) {
    chrome.runtime.sendMessage({ type: 'RSS_DETECTED', sourceId: matchedSource.id, feeds: rssFeeds });
  }

  // JS 렌더링 완료 대기
  await new Promise(resolve => {
    if (document.readyState === 'complete') setTimeout(resolve, 1000);
    else window.addEventListener('load', () => setTimeout(resolve, 1000));
  });

  // ② 기사 추출
  const { scrapeConfigs = {} } = await chrome.storage.local.get('scrapeConfigs');
  const config = scrapeConfigs[matchedSource.id] || null;
  const articles = extractArticles(matchedSource, config);
  if (articles.length === 0) return;

  // ③ background에 전송
  chrome.runtime.sendMessage({ type: 'ARTICLES_FROM_PAGE', sourceId: matchedSource.id, articles });
})();

// ─────────────────────────────────────────
// RSS 피드 자동 감지
// ─────────────────────────────────────────
function detectRSSFeeds() {
  const feeds = [];
  document.querySelectorAll('link[rel="alternate"]').forEach(link => {
    const type = link.getAttribute('type') || '';
    const href = link.getAttribute('href') || '';
    if (type.includes('rss') || type.includes('atom') || type.includes('xml')) {
      try {
        feeds.push({ url: new URL(href, location.href).href, type });
      } catch(e) {}
    }
  });
  return feeds;
}

// ─────────────────────────────────────────
// 기사 추출 메인
// ─────────────────────────────────────────
function extractArticles(source, config) {
  const host = location.hostname;

  // 사이트별 전용 추출기
  if (host.includes('fmkorea.com'))   return extractFMKorea(source);
  if (host.includes('quasarzone.com')) return extractQuasarzone(source);
  if (host.includes('x.com') || host.includes('twitter.com')) return extractTwitter(source);
  if (host.includes('dcinside.com'))  return extractDCInside(source);
  if (host.includes('vmspace.com'))   return extractVMSPACE(source);
  if (host.includes('clien.net'))     return extractClien(source);
  if (host.includes('ruliweb.com'))   return extractRuliweb(source);
  if (host.includes('instiz.net'))    return extractInstiz(source);
  if (host.includes('theqoo.net'))    return extractTheqoo(source);

  // config 기반 추출
  if (config?.itemSelector) return extractByConfig(source, config);

  // 범용 자동 감지
  return extractAuto(source);
}

// ─────────────────────────────────────────
// FM코리아 전용 추출기 (베스트 + 핫딜 공통)
// ─────────────────────────────────────────
function extractFMKorea(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('span.ellipsis-target').forEach((span, i) => {
    if (i >= 20) return;
    const a = span.closest('a');
    if (!a) return;
    let articleUrl;
    try {
      const url = new URL(a.href);
      const srl = url.searchParams.get('document_srl');
      articleUrl = srl ? `https://www.fmkorea.com/${srl}` : a.href;
    } catch(e) { return; }
    if (seen.has(articleUrl)) return;
    seen.add(articleUrl);
    const title = span.textContent.trim();
    if (!title || title.length < 2) return;
    const li = span.closest('li');
    const img = li?.querySelector('img');
    let thumb = img?.getAttribute('src') || img?.getAttribute('data-original');
    if (thumb?.startsWith('//')) thumb = 'https:' + thumb;
    articles.push({ url: articleUrl, title, thumbnail: thumb || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 퀘이사존 전용 추출기 (정확한 셀렉터 기반)
// 구조: table tbody tr > a.subject-link, .ellipsis-with-reply-cnt, img.maxImg
// ─────────────────────────────────────────
function extractQuasarzone(source) {
  const articles = [];
  const seen = new Set();

  document.querySelectorAll('table tbody tr').forEach((row, i) => {
    if (i >= 20) return;

    const linkEl   = row.querySelector('a.subject-link');
    if (!linkEl) return;
    const href = linkEl.getAttribute('href');
    if (!href || href === '#') return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);

    // 제목
    const titleEl = row.querySelector('.ellipsis-with-reply-cnt');
    const title   = titleEl ? titleEl.textContent.trim() : linkEl.textContent.trim();
    if (!title || title.length < 2) return;

    // 가격 + 상태 → 요약
    const price  = row.querySelector('.text-orange')?.textContent.trim() || '';
    const status = row.querySelector('.label')?.textContent.trim() || '';
    const date   = row.querySelector('.date')?.textContent.trim() || '';
    const summary = [price, status, date].filter(Boolean).join(' · ');

    // 썸네일 (lazy load 대응)
    const img   = row.querySelector('img.maxImg');
    const thumb = img ? (img.dataset.src || img.src || null) : null;

    const finalTitle = (status && status !== '진행중') ? `[${status}] ${title}` : title;
    articles.push({ url, title: finalTitle, thumbnail: thumb, summary });
  });

  // 베스트 게시판 폴백
  if (articles.length === 0) {
    document.querySelectorAll('a.subject-link').forEach((a, i) => {
      if (i >= 20) return;
      const href = a.getAttribute('href');
      if (!href) return;
      const url = href.startsWith('http') ? href : new URL(href, location.href).href;
      if (seen.has(url)) return;
      seen.add(url);
      const title = a.querySelector('.ellipsis-with-reply-cnt')?.textContent.trim() || a.textContent.trim();
      if (!title) return;
      articles.push({ url, title, thumbnail: null, summary: '' });
    });
  }

  return articles;
}

// ─────────────────────────────────────────
// X (Twitter) 전용 추출기
// ─────────────────────────────────────────
function extractTwitter(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('article[data-testid="tweet"]').forEach((tweet, i) => {
    if (i >= 20) return;
    // 트윗 URL
    const timeLink = tweet.querySelector('a[href*="/status/"]');
    if (!timeLink) return;
    const url = new URL(timeLink.href).pathname.includes('/status/')
      ? timeLink.href
      : null;
    if (!url || seen.has(url)) return;
    seen.add(url);
    // 트윗 텍스트
    const textEl = tweet.querySelector('[data-testid="tweetText"]');
    const title = textEl?.textContent?.trim();
    if (!title || title.length < 3) return;
    // 이미지
    const img = tweet.querySelector('img[src*="pbs.twimg.com/media"]');
    articles.push({ url, title, thumbnail: img?.src || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// DC인사이드 전용 추출기
// ─────────────────────────────────────────
function extractDCInside(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('td.gall_tit').forEach((td, i) => {
    if (i >= 20) return;
    const a = td.querySelector('a:first-child');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#') return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = a.textContent.trim();
    if (!title || title.length < 2) return;
    articles.push({ url, title, thumbnail: null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// VMSPACE 전용 추출기
// ─────────────────────────────────────────
function extractVMSPACE(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('h4').forEach((h4, i) => {
    if (i >= 20) return;
    const title = h4.textContent.trim();
    if (!title || title.length < 5) return;
    if (/^(exhibition|news|project|report|material|archive)$/i.test(title)) return;
    const a = h4.closest('a') || h4.parentElement?.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#') return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const img = a.querySelector('img');
    const thumb = img?.getAttribute('src');
    articles.push({ url, title, thumbnail: thumb || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 클리앙 전용 추출기
// ─────────────────────────────────────────
function extractClien(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('a.list_subject, .list_title a, .subject a').forEach((a, i) => {
    if (i >= 20) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = a.textContent.trim();
    if (!title || title.length < 2) return;
    articles.push({ url, title, thumbnail: null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 루리웹 전용 추출기
// ─────────────────────────────────────────
function extractRuliweb(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('a.subject_link, td.subject a').forEach((a, i) => {
    if (i >= 20) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = a.textContent.trim();
    if (!title || title.length < 2) return;
    const img = a.closest('tr')?.querySelector('img');
    articles.push({ url, title, thumbnail: img?.src || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 인스티즈 전용 추출기
// ─────────────────────────────────────────
function extractInstiz(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('.board_list_title a, .title a').forEach((a, i) => {
    if (i >= 20) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = a.textContent.trim();
    if (!title || title.length < 2) return;
    articles.push({ url, title, thumbnail: null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 더쿠 전용 추출기
// ─────────────────────────────────────────
function extractTheqoo(source) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll('.ub-content a.subject_link, .subject a').forEach((a, i) => {
    if (i >= 20) return;
    const href = a.getAttribute('href');
    if (!href) return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = a.textContent.trim();
    if (!title || title.length < 2) return;
    articles.push({ url, title, thumbnail: null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// config 기반 추출
// ─────────────────────────────────────────
function extractByConfig(source, config) {
  const articles = [];
  const seen = new Set();
  document.querySelectorAll(config.itemSelector).forEach((el, i) => {
    if (i >= 20) return;
    const linkEl  = config.linkSelector  ? el.querySelector(config.linkSelector)  : el.querySelector('a[href]');
    const titleEl = config.titleSelector ? el.querySelector(config.titleSelector) : null;
    const imgEl   = config.imageSelector ? el.querySelector(config.imageSelector) : el.querySelector('img');
    const href = linkEl?.getAttribute('href');
    if (!href || href === '#') return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = (titleEl?.textContent || linkEl?.textContent || '').trim();
    if (!title || title.length < 3) return;
    const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
    articles.push({ url, title, thumbnail: imgSrc || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 범용 자동 감지 추출
// ─────────────────────────────────────────
function extractAuto(source) {
  const articles = [];
  const seen = new Set();

  // 반복 구조에서 링크+제목 패턴 찾기
  const candidates = [
    'li', 'article', '[class*="item"]', '[class*="card"]',
    '[class*="post"]', '[class*="article"]', '[class*="news"]', '[class*="entry"]'
  ];

  let bestItems = [];
  for (const sel of candidates) {
    const items = Array.from(document.querySelectorAll(sel));
    if (items.length < 3 || items.length > 300) continue;
    const valid = items.filter(el => {
      const a = el.querySelector('a[href]');
      const heading = el.querySelector('h1,h2,h3,h4,h5,[class*="title"],[class*="tit"]');
      return a && heading && el.textContent.trim().length > 10;
    });
    if (valid.length > bestItems.length) bestItems = valid;
  }

  bestItems.slice(0, 20).forEach(el => {
    const a = el.querySelector('a[href]');
    const heading = el.querySelector('h1,h2,h3,h4,h5,[class*="title"],[class*="tit"]');
    const href = a?.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript')) return;
    const url = href.startsWith('http') ? href : new URL(href, location.href).href;
    if (seen.has(url)) return;
    seen.add(url);
    const title = (heading?.textContent || a.textContent || '').trim();
    if (!title || title.length < 3 || title.length > 200) return;
    const img = el.querySelector('img');
    articles.push({ url, title, thumbnail: img?.src || null, summary: '' });
  });
  return articles;
}

// ─────────────────────────────────────────
// 메시지 리스너 (background / settings 요청)
// ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DETECT_RSS') {
    sendResponse({ feeds: detectRSSFeeds() });
  }
  if (msg.type === 'SCRAPE_PAGE') {
    // background가 직접 요청할 때 (임시탭 없이 현재 탭에서)
    const source = msg.source || { id: 'temp', name: 'temp', category: '기타' };
    const articles = extractArticles(source, msg.config || null);
    sendResponse({ articles });
  }
});

// =====================================================
// 비주얼 피커 모드
// 사이드패널에서 "+" 버튼 → 웹페이지에서 요소 선택
// =====================================================

let pickerMode = false;
let pickerOverlay = null;
let highlightEl = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACTIVATE_PICKER') {
    activatePicker(msg.mode || 'multi');
    sendResponse({ ok: true });
  }
  if (msg.type === 'DEACTIVATE_PICKER') {
    deactivatePicker();
    sendResponse({ ok: true });
  }
});

const PICKER_MAX_SAMPLES = 3;
let pickerSelectedEls = []; // 선택된 샘플 요소들

function activatePicker(mode) {
  if (pickerMode) return;
  pickerMode = true;
  pickerSelectedEls = [];

  pickerOverlay = document.createElement('div');
  pickerOverlay.id = '__cm_picker_overlay__';
  pickerOverlay.style.cssText = `
    position:fixed; top:12px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.85); color:#fff; font-family:-apple-system,sans-serif;
    font-size:13px; padding:9px 18px; border-radius:24px; z-index:2147483647;
    pointer-events:none; white-space:nowrap; box-shadow:0 2px 12px rgba(0,0,0,0.4);
  `;
  updateOverlayText();
  document.body.appendChild(pickerOverlay);

  document.addEventListener('mouseover', onPickerHover, true);
  document.addEventListener('click',     onPickerClick, true);
  document.addEventListener('keydown',   onPickerKey,   true);
  document.body.style.cursor = 'crosshair';
}

function updateOverlayText() {
  if (!pickerOverlay) return;
  const n = pickerSelectedEls.length;
  if (n < PICKER_MAX_SAMPLES) {
    pickerOverlay.textContent = `🎯 게시글을 클릭하세요 (${n+1}/${PICKER_MAX_SAMPLES})  ·  ESC 취소`;
  } else {
    pickerOverlay.textContent = '⏳ 분석 중...';
  }
}

function deactivatePicker() {
  if (!pickerMode) return;
  pickerMode = false;

  pickerOverlay?.remove(); pickerOverlay = null;
  clearHighlight();

  document.removeEventListener('mouseover', onPickerHover, true);
  document.removeEventListener('click',     onPickerClick, true);
  document.removeEventListener('keydown',   onPickerKey,   true);
  document.body.style.cursor = '';
}

function onPickerKey(e) {
  if (e.key === 'Escape') {
    deactivatePicker();
    chrome.runtime.sendMessage({ type: 'PICKER_CANCELLED' });
  }
}

function onPickerHover(e) {
  if (!pickerMode) return;
  e.stopPropagation();
  if (e.target === highlightEl) return;
  clearHighlight();
  highlightEl = e.target;
  highlightEl._origOutline = highlightEl.style.outline;
  highlightEl._origBoxShadow = highlightEl.style.boxShadow;
  highlightEl.style.outline = '2px solid #E24B4A';
  highlightEl.style.boxShadow = '0 0 0 4px rgba(226,75,74,0.15)';
}

function clearHighlight() {
  if (highlightEl) {
    highlightEl.style.outline   = highlightEl._origOutline   || '';
    highlightEl.style.boxShadow = highlightEl._origBoxShadow || '';
    highlightEl = null;
  }
}

function onPickerClick(e) {
  if (!pickerMode) return;
  e.preventDefault();
  e.stopPropagation();

  const el = e.target;

  // 이미 선택된 요소 클릭 시 취소
  if (el._cmPicked) {
    const idx = pickerSelectedEls.indexOf(el);
    if (idx !== -1) {
      pickerSelectedEls.splice(idx, 1);
      el._cmPicked = false;
      el.style.outline = '';
      el.style.boxShadow = '';
      updateOverlayText();
      return;
    }
  }

  // 선택 표시
  el._cmPicked = true;
  el.style.outline = '2px solid #E24B4A';
  el.style.boxShadow = '0 0 0 4px rgba(226,75,74,0.2)';
  pickerSelectedEls.push(el);

  // 제목 추출해서 sidepanel에 샘플 전송
  const titleEl = el.querySelector('h1,h2,h3,h4,h5,[class*="title"],[class*="tit"],span.ellipsis-target')
                || el.closest('a') || el;
  const title = titleEl.textContent.trim().slice(0, 30) || `샘플 ${pickerSelectedEls.length}`;
  chrome.runtime.sendMessage({ type: 'PICKER_SAMPLE', title });

  updateOverlayText();

  // 3개 수집 완료 → 패턴 분석
  if (pickerSelectedEls.length >= PICKER_MAX_SAMPLES) {
    setTimeout(() => {
      deactivatePicker();
      const result = analyzePickedElements(pickerSelectedEls);
      chrome.runtime.sendMessage({
        type: 'PICKER_RESULT',
        url: location.href,
        selector: result.selector,
        config: result.config,
        articles: result.articles
      });
    }, 200);
  }
}

// ─────────────────────────────────────────
// 3개 예시 → 공통 패턴 분석 알고리즘
// ─────────────────────────────────────────
function analyzePickedElements(els) {
  if (!els || els.length === 0) return { selector: null, config: null, articles: [] };

  // 1단계: 각 요소의 CSS 셀렉터 경로(조상 포함) 생성
  const paths = els.map(el => getAncestorPath(el));

  // 2단계: 공통 조상 찾기 (3개 요소가 모두 공유하는 가장 구체적인 공통 조상)
  const commonAncestor = findCommonAncestor(els);

  // 3단계: 공통 조상 안에서 각 요소의 상대 셀렉터 추출
  const relPaths = els.map(el => getRelativePath(el, commonAncestor));

  // 4단계: 상대 경로들의 공통 패턴 추출 (가장 짧은 공통 prefix)
  const commonSel = findCommonSelector(relPaths, commonAncestor);

  // 5단계: 공통 셀렉터로 모든 매칭 요소 찾기
  let items = [];
  if (commonSel) {
    try {
      items = Array.from(document.querySelectorAll(commonSel));
    } catch(e) {}
  }

  // 매칭이 너무 적으면 더 넓은 패턴으로 재시도
  if (items.length < 3) {
    const broadSel = findBroadSelector(els, commonAncestor);
    if (broadSel) {
      try {
        const broadItems = Array.from(document.querySelectorAll(broadSel));
        if (broadItems.length > items.length) {
          items = broadItems;
        }
      } catch(e) {}
    }
  }

  // 6단계: 매칭된 요소들에서 기사 추출
  const articles = extractArticlesFromItems(items);
  const finalSelector = commonSel || null;

  return {
    selector: finalSelector,
    config: finalSelector ? {
      itemSelector: finalSelector,
      linkSelector: 'a',
      titleSelector: 'h1,h2,h3,h4,h5,[class*="title"],[class*="tit"],span.ellipsis-target,[class*="subject"]',
      imageSelector: 'img'
    } : null,
    articles
  };
}

// 요소 → 루트까지 조상 경로 배열
function getAncestorPath(el) {
  const path = [];
  let cur = el;
  while (cur && cur !== document.body) {
    path.unshift(cur);
    cur = cur.parentElement;
  }
  return path;
}

// 여러 요소의 공통 조상 DOM 요소 찾기
function findCommonAncestor(els) {
  if (els.length === 1) return els[0].parentElement;
  let ancestor = els[0];
  for (let i = 1; i < els.length; i++) {
    while (ancestor && !ancestor.contains(els[i])) {
      ancestor = ancestor.parentElement;
    }
  }
  return ancestor || document.body;
}

// 요소 → 특정 조상 기준 상대 셀렉터 생성
function getRelativePath(el, ancestor) {
  const parts = [];
  let cur = el;
  while (cur && cur !== ancestor) {
    parts.unshift(getElementSelector(cur));
    cur = cur.parentElement;
  }
  return parts;
}

// 단일 요소의 셀렉터 (태그 + 주요 클래스)
function getElementSelector(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id && el.id.length < 30 && !/^\d/.test(el.id)) {
    return tag + '#' + CSS.escape(el.id);
  }
  const classes = Array.from(el.classList)
    .filter(c => c.length > 1 && c.length < 40 && !/^\d/.test(c) && !c.includes(':') && !c.match(/^[a-z]{1,2}$/))
    .slice(0, 3);
  return tag + (classes.length ? '.' + classes.join('.') : '');
}

// 3개 상대 경로에서 공통 셀렉터 추론
function findCommonSelector(relPaths, ancestor) {
  if (!relPaths || relPaths.length === 0) return null;

  // 가장 짧은 경로 기준으로 공통 prefix 찾기
  const minLen = Math.min(...relPaths.map(p => p.length));

  // 루트에서 단계별로 일치 여부 확인
  for (let depth = 0; depth < minLen; depth++) {
    const segs = relPaths.map(p => p[depth]);
    // 태그가 같으면 후보
    const tags = new Set(segs.map(s => s.split(/[.#]/)[0]));
    if (tags.size !== 1) continue; // 태그 불일치

    // 클래스 교집합 찾기
    const classLists = segs.map(s => {
      const classes = s.match(/\.[a-zA-Z][^.#]*/g) || [];
      return new Set(classes.map(c => c.slice(1)));
    });
    const commonClasses = [...classLists[0]].filter(c =>
      classLists.every(cl => cl.has(c))
    );

    const tag = [...tags][0];
    const sel = tag + (commonClasses.length ? '.' + commonClasses.slice(0,2).join('.') : '');

    // 이 셀렉터로 검색했을 때 3개 이상 나오는지 확인
    try {
      const matches = ancestor.querySelectorAll(sel);
      if (matches.length >= 3) {
        return sel; // 유효한 셀렉터 발견
      }
    } catch(e) {}
  }

  // 공통 조상의 직계 자식 태그 중 가장 많은 것
  const childTags = {};
  Array.from(ancestor.children).forEach(c => {
    const t = c.tagName.toLowerCase();
    childTags[t] = (childTags[t] || 0) + 1;
  });
  const mostCommon = Object.entries(childTags).sort((a,b) => b[1]-a[1])[0];
  if (mostCommon && mostCommon[1] >= 3) {
    return getElementSelector(ancestor) + ' > ' + mostCommon[0];
  }

  return null;
}

// 더 넓은 셀렉터 (태그만 기반)
function findBroadSelector(els, ancestor) {
  const tag = els[0].tagName.toLowerCase();
  if (els.every(el => el.tagName.toLowerCase() === tag)) {
    return getElementSelector(ancestor) + ' ' + tag;
  }
  return null;
}

// 아이템 목록에서 기사 추출
function extractArticlesFromItems(items) {
  const articles = [];
  const seen = new Set();
  items.slice(0, 30).forEach(item => {
    const a = item.tagName === 'A' ? item : item.querySelector('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript')) return;
    let url;
    try { url = new URL(href, location.href).href; } catch(e) { return; }
    if (seen.has(url)) return;
    seen.add(url);
    const ellipsis = item.querySelector('span.ellipsis-target');
    const heading  = item.querySelector('h1,h2,h3,h4,h5,[class*="title"],[class*="tit"],[class*="subject"]');
    const title = (ellipsis?.textContent || heading?.textContent || a.textContent || '').trim();
    if (!title || title.length < 2 || title.length > 300) return;
    const img = item.querySelector('img');
    let thumb = img?.getAttribute('src') || img?.getAttribute('data-src') || img?.getAttribute('data-original');
    if (thumb?.startsWith('//')) thumb = 'https:' + thumb;
    else if (thumb && !thumb.startsWith('http')) { try { thumb = new URL(thumb, location.href).href; } catch(e) { thumb = null; } }
    articles.push({ url, title, thumbnail: thumb || null, summary: '' });
  });
  return articles;
}

function getCssSelector(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  const parts = [];
  let current = el;
  for (let i = 0; i < 4 && current && current !== document.body; i++) {
    let part = current.tagName.toLowerCase();
    if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/)
        .filter(c => c.length > 1 && !/^\d/.test(c) && !c.includes(':'))
        .slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
