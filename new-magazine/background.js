// =====================================================
// NEW MAGAZINE - background.js (Service Worker)
// ※ Service Worker는 DOM API 사용 불가 → 전부 정규식
// =====================================================

const ALARM_NAME       = 'fetch-articles';
const FETCH_INTERVAL   = 30;
const SUMMARY_LENGTH   = 120;
const MAX_ARTICLES     = 500;
const ITEMS_PER_SOURCE = 15;

const DEFAULT_SOURCES = [
  // ── 건축/디자인 (기본 비활성) ──
  { id: 'archdaily',           name: 'ArchDaily',            type: 'rss',    url: 'https://www.archdaily.com/feed',                                                  category: '건축',     enabled: false },
  { id: 'dezeen',              name: 'Dezeen',               type: 'rss',    url: 'https://feeds.feedburner.com/dezeen',                                              category: '건축',     enabled: false },
  { id: 'designboom',          name: 'Designboom',           type: 'rss',    url: 'https://www.designboom.com/feed/',                                                 category: '디자인',   enabled: false },
  { id: 'vmspace',             name: 'VMSPACE',              type: 'scrape', url: 'https://vmspace.com/news/news.html',                                               category: '건축',     enabled: false },
  // ── SNS (방문 시 자동 수집) ──
  { id: 'x_archdaily',         name: 'X: @ArchDaily',        type: 'visit',  url: 'https://x.com/archdaily',                                                         category: 'SNS',      enabled: false },
  { id: 'x_dezeen',            name: 'X: @Dezeen',           type: 'visit',  url: 'https://x.com/dezeen',                                                            category: 'SNS',      enabled: false },
  { id: 'reddit_architecture', name: 'Reddit r/architecture',type: 'rss',    url: 'https://www.reddit.com/r/architecture/.rss',                                      category: 'SNS',      enabled: false },
  { id: 'reddit_design',       name: 'Reddit r/Design',      type: 'rss',    url: 'https://www.reddit.com/r/Design/.rss',                                            category: 'SNS',      enabled: false },
  // ── 국내 커뮤니티 (방문 시 자동 수집) ──
    { id: 'quasarzone_best',     name: '퀘이사존 베스트',       type: 'scrape', url: 'https://quasarzone.com/best/list/all',                                            category: '커뮤니티', enabled: false },
    { id: 'quasarzone_sale',     name: '퀘이사존 핫딜',         type: 'scrape', url: 'https://quasarzone.com/bbs/qb_saleinfo',                                          category: '핫딜',     enabled: false },
  { id: 'fmkorea_hotdeal',     name: 'FM코리아 핫딜',         type: 'visit',  url: 'https://www.fmkorea.com/?mid=hotdeal',                                             category: '핫딜',     enabled: false },
  { id: 'fmkorea',             name: 'FM코리아 베스트',       type: 'visit',  url: 'https://www.fmkorea.com/index.php?mid=best&sort_index=pop_score&order_type=desc', category: '커뮤니티', enabled: false },
  { id: 'dcinside_design',     name: 'DC인사이드 디자인',    type: 'scrape', url: 'https://gall.dcinside.com/board/lists/?id=design',                                category: '커뮤니티', enabled: false },
  { id: 'clien_park',          name: '클리앙 모두의 공원',   type: 'visit',  url: 'https://www.clien.net/service/board/park',                                        category: '커뮤니티', enabled: false },
  { id: 'ruliweb_best',        name: '루리웹 베스트',         type: 'visit',  url: 'https://bbs.ruliweb.com/best/selection',                                          category: '커뮤니티', enabled: false },
  { id: 'instiz_icategory',    name: '인스티즈 핫게',         type: 'visit',  url: 'https://www.instiz.net/pt',                                                       category: '커뮤니티', enabled: false },
  { id: 'theqoo_hot',          name: '더쿠 Hot',              type: 'visit',  url: 'https://theqoo.net/hot',                                                          category: '커뮤니티', enabled: false },
  // ── 국내 뉴스 (기본 비활성) ──
  { id: 'yonhap',              name: '연합뉴스',               type: 'rss',    url: 'https://www.yonhapnewstv.co.kr/feed/',                                            category: '국내뉴스', enabled: false },
  { id: 'hani',                name: '한겨레',                 type: 'rss',    url: 'https://www.hani.co.kr/rss/',                                                     category: '국내뉴스', enabled: false },
  { id: 'chosun',              name: '조선일보',               type: 'rss',    url: 'https://www.chosun.com/arc/outboundfeeds/rss/',                                   category: '국내뉴스', enabled: false },
  { id: 'joongang',            name: '중앙일보',               type: 'rss',    url: 'https://rss.joins.com/joins_news_list.xml',                                       category: '국내뉴스', enabled: false },
  { id: 'khan',                name: '경향신문',               type: 'rss',    url: 'https://www.khan.co.kr/rss/rssdata/total_news.xml',                               category: '국내뉴스', enabled: false },
  // ── 해외 뉴스 (기본 비활성) ──
  { id: 'bbc',                 name: 'BBC News',               type: 'rss',    url: 'https://feeds.bbci.co.uk/news/rss.xml',                                           category: '해외뉴스', enabled: false },
  { id: 'nytimes',             name: 'NY Times',               type: 'rss',    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',                      category: '해외뉴스', enabled: false },
  { id: 'guardian',            name: 'The Guardian',           type: 'rss',    url: 'https://www.theguardian.com/world/rss',                                           category: '해외뉴스', enabled: false },
  { id: 'wired',               name: 'Wired',                  type: 'rss',    url: 'https://www.wired.com/feed/rss',                                                  category: '해외뉴스', enabled: false },
];

chrome.runtime.onInstalled.addListener(async () => {
  const { sources } = await chrome.storage.local.get('sources');
  if (!sources) await chrome.storage.local.set({ sources: DEFAULT_SOURCES, articles: [], newCount: 0 });
  await chrome.action.setBadgeBackgroundColor({ color: '#E24B4A' });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: FETCH_INTERVAL });
  fetchAllSources();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(ALARM_NAME, (a) => {
    if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: FETCH_INTERVAL });
  });
  chrome.action.setBadgeBackgroundColor({ color: '#E24B4A' });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) fetchAllSources();
});

// ── 메시지 처리 ─────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_NOW') {
    fetchAllSources().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'MARK_SEEN') {
    chrome.storage.local.set({ newCount: 0 });
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ ok: true });
  }
  if (msg.type === 'SAVE_SOURCES') {
    chrome.storage.local.set({ sources: msg.sources }, async () => {
      // 비활성 소스의 기존 articles 즉시 제거
      const { articles: existing = [] } = await chrome.storage.local.get('articles');
      const enabledIds = new Set(msg.sources.filter(s => s.enabled).map(s => s.id));
      const filtered = existing.filter(a => enabledIds.has(a.sourceId));
      await chrome.storage.local.set({ articles: filtered });
      fetchAllSources();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'GET_DEFAULTS') sendResponse({ sources: DEFAULT_SOURCES });
  if (msg.type === 'PICKER_CANCELLED') {
    // 피커 취소 - sidepanel에 전달 (필요 시)
    sendResponse({ ok: true });
  }

  // Content Script에서 페이지 방문 시 자동 수집된 기사
  if (msg.type === 'ARTICLES_FROM_PAGE') {
    handleArticlesFromPage(msg.sourceId, msg.articles);
    sendResponse({ ok: true });
  }

  // Content Script에서 RSS 피드 감지
  if (msg.type === 'RSS_DETECTED') {
    handleRSSDetected(msg.sourceId, msg.feeds);
    sendResponse({ ok: true });
  }
});

// ── 페이지 방문 시 Content Script에서 수신 ─────────────────
async function handleArticlesFromPage(sourceId, newArticles) {
  if (!newArticles || newArticles.length === 0) return;

  const { sources = [] }        = await chrome.storage.local.get('sources');
  const { keywords = {} }       = await chrome.storage.local.get('keywords');
  const { articles: existing = [] } = await chrome.storage.local.get('articles');
  const existingIds = new Set(existing.map(a => a.id));

  const source = sources.find(s => s.id === sourceId);
  if (!source || !source.enabled) return;

  // 기사에 소스 정보 붙이기
  let tagged = newArticles.map((a, i) => ({
    id: a.url,
    sourceId: source.id,
    sourceName: source.name,
    category: source.category,
    title: a.title,
    url: a.url,
    summary: a.summary || '',
    thumbnail: a.thumbnail || null,
    pubDate: Date.now() - i * 60000,
    fetchedAt: Date.now()
  })).filter(a => a.url && a.title);

  // 키워드 필터 적용
  tagged = applyKeywords(tagged, keywords, sourceId);

  // 새 글만 추가
  const fresh = tagged.filter(a => !existingIds.has(a.id));
  if (fresh.length === 0) return;

  console.log(`[페이지 방문 수집] ${source.name}: ${fresh.length}개 새 글`);

  const merged = [...fresh, ...existing]
    .sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
    .slice(0, MAX_ARTICLES);

  await chrome.storage.local.set({ articles: merged, lastFetchAt: Date.now() });

  // 뱃지 업데이트
  const { newCount = 0 } = await chrome.storage.local.get('newCount');
  const total = newCount + fresh.length;
  await chrome.storage.local.set({ newCount: total });
  await chrome.action.setBadgeText({ text: total > 99 ? '99+' : String(total) });
}

// RSS 피드 자동 감지 수신 → 소스 RSS URL 자동 업데이트
async function handleRSSDetected(sourceId, feeds) {
  if (!feeds || feeds.length === 0) return;
  const { sources = [] } = await chrome.storage.local.get('sources');
  const src = sources.find(s => s.id === sourceId);
  if (!src || src.type === 'rss') return; // 이미 RSS면 스킵

  // scrape 타입인데 RSS가 감지되면 자동으로 RSS로 전환
  src.type = 'rss';
  src.url  = feeds[0].url;
  await chrome.storage.local.set({ sources });
  console.log(`[RSS 자동 감지] ${src.name}: ${feeds[0].url}`);
}

// ── 전체 fetch ──────────────────────────
async function fetchAllSources() {
  console.log('[NEW MAGAZINE] fetch 시작');
  const { sources = DEFAULT_SOURCES } = await chrome.storage.local.get('sources');
  const { articles: existing = [] }   = await chrome.storage.local.get('articles');
  const { keywords = {} }             = await chrome.storage.local.get('keywords');
  const existingIds = new Set(existing.map(a => a.id));
  const fresh = [], errors = [];

  for (const src of sources.filter(s => s.enabled)) {
    try {
      // type='visit' 소스는 사용자가 직접 방문할 때 content.js가 수집 (fetch 불필요)
      if (src.type === 'visit') continue;

      let list = src.type === 'rss' ? await fetchRSS(src) : await fetchScrape(src);

      // 키워드 필터 적용
      list = applyKeywords(list, keywords, src.id);

      const newOnes = list.filter(a => a.id && !existingIds.has(a.id));
      fresh.push(...newOnes);
      console.log(`[${src.name}] ${newOnes.length}개 새 글`);
    } catch (e) {
      errors.push(`${src.name}: ${e.message}`);
      console.warn(`[${src.name}] 오류:`, e.message);
    }
  }

  const merged = [...fresh, ...existing]
    .sort((a, b) => (b.pubDate || 0) - (a.pubDate || 0))
    .slice(0, MAX_ARTICLES);

  await chrome.storage.local.set({ articles: merged, fetchErrors: errors, lastFetchAt: Date.now() });

  if (fresh.length > 0) {
    const { newCount = 0 } = await chrome.storage.local.get('newCount');
    const total = newCount + fresh.length;
    await chrome.storage.local.set({ newCount: total });
    await chrome.action.setBadgeText({ text: total > 99 ? '99+' : String(total) });
  }
}

// ── 키워드 필터 ─────────────────────────
// keywords: { sourceId: { include:[], exclude:[] }, '*': { ... } }
// 규칙:
//   - 소스에 키워드 규칙이 설정되어 있으면, include 중 하나라도 매칭돼야 표시
//   - exclude 중 하나라도 매칭되면 제외
//   - 키워드 설정이 없는 소스는 전체 표시
function applyKeywords(articles, keywords, sourceId) {
  if (!keywords || Object.keys(keywords).length === 0) return articles;

  const globalRule = keywords['*'];
  const sourceRule = keywords[sourceId];

  // 이 소스에 적용할 규칙이 아예 없으면 전체 통과
  if (!globalRule && !sourceRule) return articles;

  return articles.filter(article => {
    const text = (article.title + ' ' + (article.summary||'')).toLowerCase();

    // 전역 규칙 먼저 적용
    if (globalRule) {
      if (globalRule.exclude?.length > 0) {
        if (globalRule.exclude.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
      if (globalRule.include?.length > 0) {
        if (!globalRule.include.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
    }

    // 소스별 규칙 적용
    if (sourceRule) {
      if (sourceRule.exclude?.length > 0) {
        if (sourceRule.exclude.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
      // 소스에 include가 설정되어 있으면 반드시 매칭돼야 함
      if (sourceRule.include?.length > 0) {
        if (!sourceRule.include.some(kw => kw && text.includes(kw.toLowerCase()))) return false;
      }
    }

    return true;
  });
}

// ── RSS 파싱 (정규식, DOMParser 없음) ───
// ── 인코딩 자동 감지 및 디코딩 ────────────
// EUC-KR, UTF-8 등 한국 사이트 인코딩 처리
async function decodeResponse(res) {
  const contentType = res.headers.get('content-type') || '';

  // Content-Type에서 charset 추출
  const charsetMatch = contentType.match(/charset=([\w-]+)/i);
  let charset = charsetMatch ? charsetMatch[1].toLowerCase() : null;

  const buffer = await res.arrayBuffer();

  // charset이 없으면 HTML meta 태그에서 추출 시도
  if (!charset) {
    const peek = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 2000));
    const metaMatch = peek.match(/charset=["']?([\w-]+)/i)
                   || peek.match(/encoding=["']([\w-]+)/i);
    if (metaMatch) charset = metaMatch[1].toLowerCase();
  }

  // EUC-KR / CP949 계열 처리
  if (charset && (charset.includes('euc-kr') || charset.includes('ks_c') || charset === 'cp949')) {
    try {
      return new TextDecoder('euc-kr').decode(buffer);
    } catch(e) {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }
  }

  // 기본 UTF-8
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

async function fetchRSS(src) {
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS-Reader/1.0)', 'Accept': 'application/rss+xml,application/atom+xml,text/xml,*/*' },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await decodeResponse(res);

  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  const tag    = isAtom ? 'entry' : 'item';
  const blocks = text.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'gi')) || [];

  return blocks.slice(0, ITEMS_PER_SOURCE).map((raw, i) => {
    const title     = xmlText(raw, 'title');
    const url       = pickLink(raw, isAtom);
    const descRaw   = xmlText(raw, 'content:encoded') || xmlText(raw, 'description') || xmlText(raw, 'content') || xmlText(raw, 'summary') || '';
    const dateStr   = isAtom ? (xmlText(raw,'updated') || xmlText(raw,'published')) : (xmlText(raw,'pubDate') || xmlText(raw,'dc:date'));
    const pubDate   = dateStr ? new Date(dateStr).getTime() : Date.now() - i * 60000;
    const plain     = stripTags(descRaw).replace(/\s+/g,' ').trim();
    const summary   = plain.length > SUMMARY_LENGTH ? plain.slice(0, SUMMARY_LENGTH) + '...' : plain;
    const thumbnail = pickThumb(raw, descRaw);
    return {
      id: url || `${src.id}-${i}-${Date.now()}`,
      sourceId: src.id, sourceName: src.name, category: src.category,
      title: title || '제목 없음', url, summary, thumbnail, pubDate, fetchedAt: Date.now()
    };
  }).filter(a => a.url);
}

function xmlText(xml, tag) {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cd  = xml.match(new RegExp(`<${esc}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'));
  if (cd) return decodeEntities(cd[1].trim());
  const tx  = xml.match(new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, 'i'));
  if (tx) return decodeEntities(tx[1].trim());
  return '';
}

// HTML 엔티티 디코드 (제목에 &amp; &#39; 등이 그대로 노출되는 문제 방지)
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function pickLink(raw, isAtom) {
  const a1 = raw.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i)
          || raw.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["']/i);
  if (a1) return a1[1];
  if (isAtom) {
    for (const m of raw.matchAll(/<link\s[^>]*href=["']([^"']+)["'][^>]*\/?>/gi)) {
      if (/rel=["'](self|enclosure|related)["']/i.test(m[0])) continue;
      if (/type=["']application\/(atom|rss)/i.test(m[0])) continue;
      if (m[1].startsWith('http')) return m[1];
    }
  }
  const r1 = raw.match(/(?:[\n\r\t ]|^)<link>(https?[^<\r\n]+)<\/link>/i);
  if (r1) return r1[1].trim();
  const g1 = raw.match(/<guid[^>]*isPermaLink=["']true["'][^>]*>\s*(https?[^<\s]+)/i);
  if (g1) return g1[1].trim();
  const g2 = raw.match(/<guid[^>]*>\s*(https?:\/\/[^<\s]+)/i);
  if (g2) return g2[1].trim();
  return '';
}

function pickThumb(raw, desc) {
  let url = null;
  const t1 = raw.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);          if (t1) url = t1[1];
  if (!url) { const t2 = raw.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*(?:type=["']image|medium=["']image)/i); if (t2) url = t2[1]; }
  if (!url) { const t3 = raw.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i)
                       || raw.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i); if (t3) url = t3[1]; }
  if (!url) { const t4 = desc.match(/<img[^>]+src=["']([^"']+)["']/i); if (t4) url = t4[1]; }
  // &amp; → & 디코딩 (Reddit 등에서 URL에 엔티티가 포함되는 문제 방지)
  return url ? url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : null;
}

function stripTags(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<table[\s\S]*?<\/table>/gi,' ')  // 테이블 전체 제거
    .replace(/<[^>]+>/g,' ')
    .replace(/https?:\/\/\S+/g,'')             // URL 제거
    .replace(/www\.\S+/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&#\d+;/g,'').replace(/&[a-z]+;/gi,' ')
    .replace(/\s{2,}/g,' ').trim();
}

// ── 스크래핑 (fetch + HTML 파싱) ──────────
// JS 렌더링 사이트(FM코리아 등)는 content.js가 방문 시 자동 수집
// 임시 탭 생성 없음
async function fetchScrape(src) {
  const res = await fetch(src.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await decodeResponse(res);
  if (src.id === 'dcinside_design')  return scrapeDCInside(html, src);
  if (src.id === 'vmspace')          return scrapeVMSPACE(html, src);
  if (src.id.startsWith('quasarzone')) return scrapeQuasarzone(html, src);
  return [];
}

function scrapeFMKorea(html, src) {
  // 실제 구조:
  // <li class="li li_best2_...">
  //   <h3 class="title">
  //     <a href="/best/9605446424">
  //       <span class="ellipsis-target">제목</span>
  //     </a>
  //   </h3>
  //   <img src="//image.fmkorea.com/...썸네일...">
  // </li>
  const articles = [];
  const seen = new Set();

  // li.li_best2 블록 단위로 추출
  const liRe = /<li[^>]*class="[^"]*li[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let lm;
  while ((lm = liRe.exec(html)) !== null && articles.length < ITEMS_PER_SOURCE) {
    const block = lm[1];

    // h3.title 안의 <a href> 추출
    const aM = block.match(/<h3[^>]*class="[^"]*title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>/i);
    if (!aM) continue;
    const href = aM[1].trim();

    // span.ellipsis-target 에서 제목 추출
    const spanM = block.match(/<span[^>]*class="[^"]*ellipsis-target[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (!spanM) continue;
    const title = stripTags(spanM[1]).trim();
    if (!title || title.length < 2) continue;

    const url = href.startsWith('http') ? href : 'https://www.fmkorea.com' + (href.startsWith('/') ? href : '/' + href);
    if (seen.has(url)) continue;
    seen.add(url);

    // 썸네일: //image.fmkorea.com/... → https://image.fmkorea.com/...
    const imgM = block.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*thumb[^"]*"/i)
              || block.match(/<img[^>]*class="[^"]*thumb[^"]*"[^>]*src="([^"]+)"/i);
    let thumb = imgM ? imgM[1] : null;
    if (thumb && thumb.startsWith('//')) thumb = 'https:' + thumb;

    articles.push({
      id: url, sourceId: src.id, sourceName: src.name, category: src.category,
      title, url, summary: '', thumbnail: thumb,
      pubDate: Date.now() - articles.length * 300000, fetchedAt: Date.now()
    });
  }

  console.log('[FM코리아] 추출된 글 수:', articles.length);
  return articles;
}

function scrapeVMSPACE(html, src) {
  // 실제 구조 (https://vmspace.com/news/news.html):
  // <a href="./news_view.html?base_seq=...">
  //   <article>...<img>...</article>
  //   <div class="switchable__text">
  //     <h4>제목</h4>
  //   </div>
  // </a>
  const articles = [];
  const seen = new Set();

  // news_view.html 또는 project_view.html 링크를 가진 a 태그 블록
  const blockRe = /<a[^>]+href="(\.\/(news_view|project_view)\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = blockRe.exec(html)) !== null && articles.length < ITEMS_PER_SOURCE) {
    const rawHref = m[1].trim();
    const block   = m[3];

    // div.switchable__text > h4 또는 그냥 h4 에서 제목
    const titleM = block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (!titleM) continue;
    const title = stripTags(titleM[1]).trim();
    if (!title || title.length < 2) continue;
    // 카테고리 텍스트(exhibition, news 등) 제외
    if (title.length < 5 || /^(exhibition|news|project|report|material|archive)$/i.test(title)) continue;

    // ./news_view.html?base_seq=... → https://vmspace.com/news/news_view.html?base_seq=...
    let url;
    if (rawHref.startsWith('http')) {
      url = rawHref;
    } else if (rawHref.startsWith('./')) {
      url = 'https://vmspace.com/news/' + rawHref.slice(2);
    } else if (rawHref.startsWith('../')) {
      url = 'https://vmspace.com/' + rawHref.slice(3);
    } else {
      url = 'https://vmspace.com/news/' + rawHref;
    }

    if (seen.has(url)) continue;
    seen.add(url);

    // img src 썸네일
    const imgM = block.match(/<img[^>]+src=["']([^"']+)["']/i);
    let thumb = imgM ? imgM[1] : null;
    if (thumb && thumb.startsWith('/')) thumb = 'https://vmspace.com' + thumb;
    else if (thumb && !thumb.startsWith('http')) thumb = 'https://vmspace.com/' + thumb;

    articles.push({
      id: url, sourceId: src.id, sourceName: src.name, category: src.category,
      title, url, summary: '', thumbnail: thumb,
      pubDate: Date.now() - articles.length * 300000, fetchedAt: Date.now()
    });
  }
  console.log('[VMSPACE] 추출된 글 수:', articles.length);
  return articles;
}

// ─────────────────────────────────────────
// 퀘이사존 스크래퍼 (SSR, fetch 가능)
// 구조: table tbody tr > a.subject-link, .ellipsis-with-reply-cnt, img.maxImg
// ─────────────────────────────────────────
function scrapeQuasarzone(html, src) {
  const articles = [];
  const seen = new Set();

  // tbody tr 블록 단위로 추출
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html)) !== null && articles.length < ITEMS_PER_SOURCE) {
    const block = m[1];

    // a.subject-link 에서 URL 추출
    const urlM = block.match(/<a[^>]+class="[^"]*subject-link[^"]*"[^>]+href="([^"]+)"/i)
              || block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*subject-link[^"]*"/i);
    if (!urlM) continue;
    const href = urlM[1].trim();
    const url  = href.startsWith('http') ? href : 'https://quasarzone.com' + href;
    if (seen.has(url)) continue;
    seen.add(url);

    // 제목: .ellipsis-with-reply-cnt
    const titleM = block.match(/<[^>]+class="[^"]*ellipsis-with-reply-cnt[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i);
    const title  = titleM ? stripTags(titleM[1]).trim() : '';
    if (!title || title.length < 2) continue;

    // 가격: .text-orange
    const priceM = block.match(/<[^>]+class="[^"]*text-orange[^"]*"[^>]*>([^<]+)<\/[^>]+>/i);
    const price  = priceM ? priceM[1].trim() : '';

    // 상태: .label (진행중/종료/품절)
    const statusM = block.match(/<[^>]+class="[^"]*label[^"]*"[^>]*>([^<]+)<\/[^>]+>/i);
    const status  = statusM ? statusM[1].trim() : '';

    // 날짜: .date
    const dateM = block.match(/<[^>]+class="[^"]*date[^"]*"[^>]*>([^<]+)<\/[^>]+>/i);
    const date  = dateM ? dateM[1].trim() : '';

    // 요약: 가격 + 상태
    const summary = [price, status, date].filter(Boolean).join(' · ');

    // 썸네일: img.maxImg (lazy load → data-src 또는 src)
    const imgM = block.match(/<img[^>]+class="[^"]*maxImg[^"]*"[^>]*>/i);
    let thumb = null;
    if (imgM) {
      const dataSrcM = imgM[0].match(/data-src="([^"]+)"/i);
      const srcM     = imgM[0].match(/src="([^"]+)"/i);
      thumb = dataSrcM ? dataSrcM[1] : (srcM ? srcM[1] : null);
      if (thumb && !thumb.startsWith('http')) {
        thumb = thumb.startsWith('//') ? 'https:' + thumb : 'https://quasarzone.com' + thumb;
      }
    }

    // 종료/품절 글은 opacity 처리를 위해 title에 표시
    const finalTitle = (status && status !== '진행중') ? `[${status}] ${title}` : title;

    articles.push({
      id: url, sourceId: src.id, sourceName: src.name, category: src.category,
      title: finalTitle, url, summary, thumbnail: thumb,
      pubDate: Date.now() - articles.length * 300000, fetchedAt: Date.now()
    });
  }

  console.log('[퀘이사존] 추출된 글 수:', articles.length);
  return articles;
}

function scrapeDCInside(html, src) {
  const articles = [];
  const blockRe = /<td[^>]*class="[^"]*gall_tit[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let bm;
  while ((bm = blockRe.exec(html)) !== null && articles.length < ITEMS_PER_SOURCE) {
    const block = bm[1];
    if (/class="[^"]*notice/i.test(block)) continue;
    const am = block.match(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!am) continue;
    const href  = am[1].trim();
    const title = stripTags(am[2]).trim();
    if (!title || title.length < 2) continue;
    const url = href.startsWith('http') ? href : 'https://gall.dcinside.com' + (href.startsWith('/') ? href : '/' + href);
    articles.push({ id: url, sourceId: src.id, sourceName: src.name, category: src.category, title, url, summary: '', thumbnail: null, pubDate: Date.now() - articles.length * 300000, fetchedAt: Date.now() });
  }
  return articles;
}
