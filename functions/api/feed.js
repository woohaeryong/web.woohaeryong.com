// Cloudflare Pages Function: /api/feed?src=youtube | naver
// 공개 RSS를 서버에서 읽어 최신 글 목록을 JSON으로 돌려줍니다. (30분 캐시)

const SOURCES = {
  youtube: {
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfD9jmbRx0ODfJQlbQYLLLQ',
    type: 'atom',
  },
  naver: {
    url: 'https://rss.blog.naver.com/woohaeryong2000.xml',
    type: 'rss',
  },
};

const CACHE_SECONDS = 1800;

export async function onRequestGet({ request }) {
  const src = new URL(request.url).searchParams.get('src');
  const conf = SOURCES[src]; // 허용된 주소만 조회 (임의 주소 조회 방지)
  if (!conf) return json({ items: [], error: 'unknown source' }, 400, 0);

  try {
    const res = await fetch(conf.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; woohaeryong-site/1.0)' },
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!res.ok) throw new Error('upstream ' + res.status);
    const xml = await res.text();
    const items = conf.type === 'atom' ? parseAtom(xml) : parseRss(xml);
    return json({ items: items.slice(0, 6) }, 200, CACHE_SECONDS);
  } catch (e) {
    // 실패해도 페이지가 깨지지 않도록 빈 목록 반환 (화면에서는 카드가 숨겨짐)
    return json({ items: [] }, 200, 60);
  }
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + maxAge + ', s-maxage=' + maxAge,
    },
  });
}

function parseAtom(xml) {
  const out = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const e of entries) {
    const id = pick(e, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!id) continue;
    const link = (e.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || [])[1]
      || 'https://www.youtube.com/watch?v=' + id;
    out.push({
      title: clean(pick(e, /<title>([\s\S]*?)<\/title>/)),
      link: link,
      thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      date: pick(e, /<published>([^<]+)<\/published>/),
      summary: '',
    });
  }
  return out;
}

function parseRss(xml) {
  const out = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const it of items) {
    const desc = unCdata(pick(it, /<description>([\s\S]*?)<\/description>/));
    const img = (desc.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    out.push({
      title: clean(pick(it, /<title>([\s\S]*?)<\/title>/)),
      link: https(clean(pick(it, /<link>([\s\S]*?)<\/link>/))),
      thumb: https(img),
      date: pick(it, /<pubDate>([^<]+)<\/pubDate>/),
      summary: stripHtml(desc).slice(0, 90),
    });
  }
  return out;
}

function pick(s, re) {
  const m = s.match(re);
  return m ? m[1].trim() : '';
}
function unCdata(s) {
  return s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
}
function decode(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
function clean(s) {
  return decode(unCdata(s)).trim();
}
function stripHtml(s) {
  return decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function https(u) {
  return u ? u.replace(/^http:\/\//i, 'https://') : '';
}
