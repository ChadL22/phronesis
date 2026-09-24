// ═══════════════════════════════════════════════════════════════
// ARCHIVE LAYOUT — Phronesis Research
// Shared three-column layout for the content category pages
// (research, policy, legal, essays, articles, reports), modeled on
// Google's 2012 results page:
//   left   → the other content types, current one highlighted
//   center → a search bar scoped to this category, a tools row with
//            filter dropdowns + card/list toggle, then the results
//   right  → the newest item spotlit, then up to four more as cards
//   Policy page only: an auto-scrolling tech policy tracker under the
//   content types on the left.
//   Results show four per page in list view and six in card view
//   ("5–8 of 45" with arrows), under a Google-style load time; the filter
//   dropdowns sit behind an "Advanced search" toggle.
//
// A page opts in with a single mount point:
//   <div id="archiveApp" data-category="policy"
//        data-description="..."></div>
// Title and description come from the page itself so no copy lives
// here. On the essays page, Phronesis originals with a full body open
// in an in-page reader (essays.html#<id> links from elsewhere on the
// site open it directly). Search, filters, sort, and view are mirrored into the URL
// (?q=&year=&view=) so a filtered view can be shared or bookmarked.
// Everything is wrapped in an IIFE so nothing leaks into the page's
// own inline scripts.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var CATEGORIES = [
    { key: 'research', type: 'research', label: 'Research Papers',  file: 'research.json', href: '/research', page: 'research.html' },
    { key: 'policy',   type: 'policy',   label: 'Policy Artifacts', file: 'policy.json',   href: '/policy',   page: 'policy.html'   },
    { key: 'legal',    type: 'legal',    label: 'Legal Analyses',   file: 'legal.json',    href: '/legal',    page: 'legal.html'    },
    { key: 'essays',   type: 'essay',    label: 'Essays',           file: 'essays.json',   href: '/essays',   page: 'essays.html'   },
    { key: 'articles', type: 'article',  label: 'Articles',         file: 'articles.json', href: '/articles', page: 'articles.html' },
    { key: 'reports',  type: 'report',   label: 'Reports',          file: 'reports.json',  href: '/reports',  page: 'reports.html'  }
  ];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PAGE_SIZE = { list: 4, cards: 6 };   // results per page in each view
  var BILLS_URL = '/bills-data.json';
  var RECENT_COUNT = 5;    // one spotlit + four cards
  var SOURCE_LABELS = { original: 'Original', via: 'Via' };

  // ── helpers ──
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function titleCase(s) {
    return String(s).replace(/(^|[\s\-\/])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }
  function fmtMonth(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function regexEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // "ai-policy" → "AI Policy", "ip" → "IP", "first-amendment" → "First Amendment"
  function prettify(raw) {
    return String(raw).replace(/[-_]+/g, ' ').split(' ').map(function (w) {
      if (!w) return w;
      return w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // mirrors masthead.js / the archive pages' own link resolution
  function destinationFor(entry, page) {
    if (page === 'essays.html' && entry.origin === 'original' && entry.body) {
      return { url: page + '#' + entry.id, external: false };
    }
    if (entry.origin === 'via' && entry.original_url) {
      return { url: entry.original_url, external: true };
    }
    if (entry.origin === 'original' && entry.document_url) {
      return { url: entry.document_url, external: false };
    }
    return null;
  }

  function normalize(e, cat) {
    // each content file names its sub-type differently
    var subtype = e.document_type || e.analysis_type || e.report_type ||
      (e.type && e.type !== cat.type ? e.type : '');
    var topicRaw = e.primary_topic || e.topic || e.category || '';
    var topic = e.topic_label || (topicRaw ? prettify(topicRaw) : '');
    var reader = cat.key === 'essays' && e.origin === 'original' && !!e.body;
    var item = {
      id: e.id,
      title: e.title || 'Untitled',
      subtitle: e.subtitle || '',
      text: e.abstract || e.preview || e.excerpt || e.subtitle || '',
      date: e.date || '',
      time: e.date ? (Date.parse(e.date + 'T00:00:00') || 0) : 0,
      year: e.date ? String(e.date).slice(0, 4) : '',
      subtype: subtype,
      topic: topic,
      level: e.level || e.audience || '',
      fields: e.fields || [],
      tags: e.tags || [],
      origin: e.origin || '',
      publisher: e.publisher || '',
      dest: reader ? { url: '#' + e.id, external: false, reader: true } : destinationFor(e, cat.page),
      body: reader ? e.body : null,
      body_html: reader ? (e.body_html || null) : null
    };
    item._title = item.title.toLowerCase();
    item._meta = [item.tags.join(' '), item.fields.join(' '), item.publisher, item.subtype, item.topic, item.level].join(' ').toLowerCase();
    item._body = [item.subtitle, item.text].join(' ').toLowerCase();
    return item;
  }

  // ── facets: only those with 2+ distinct values in a category are shown ──
  var FACETS = [
    { key: 'year',      label: 'Year',      any: 'Any year',      order: 'desc', values: function (i) { return i.year ? [i.year] : []; } },
    { key: 'type',      label: 'Type',      any: 'Any type',      display: titleCase, values: function (i) { return i.subtype ? [i.subtype] : []; } },
    { key: 'topic',     label: 'Topic',     any: 'Any topic',     values: function (i) { return i.topic ? [i.topic] : []; } },
    { key: 'level',     label: 'Level',     any: 'Any level',     display: titleCase, values: function (i) { return i.level ? [i.level] : []; } },
    { key: 'field',     label: 'Field',     any: 'Any field',     values: function (i) { return i.fields; } },
    { key: 'source',    label: 'Source',    any: 'Any source',    display: function (v) { return SOURCE_LABELS[v] || titleCase(v); }, values: function (i) { return i.origin ? [i.origin] : []; } },
    { key: 'publisher', label: 'Publisher', any: 'Any publisher', values: function (i) { return i.publisher ? [i.publisher] : []; } }
  ];
  var FACET_BY_KEY = {};
  FACETS.forEach(function (f) { FACET_BY_KEY[f.key] = f; });
  function facetDisplay(f, v) { return f.display ? f.display(v) : v; }

  var SORTS = { relevance: 'Relevance', newest: 'Newest', oldest: 'Oldest' };

  // ── search matching: every word must hit somewhere; small typos tolerated ──
  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    var prev = [], j;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      var cur = [i];
      for (j = 1; j <= bl; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[bl];
  }
  function tokenize(q) {
    return q.toLowerCase().split(/\s+/)
      .map(function (t) { return t.replace(/^["'(]+|["'),.]+$/g, ''); })
      .filter(Boolean);
  }
  function tokenIn(tok, text) {
    if (text.indexOf(tok) !== -1) return true;
    if (tok.length < 5) return false;
    var words = text.split(/[^a-z0-9]+/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w && Math.abs(w.length - tok.length) <= 1 && levenshtein(tok, w) <= 1) return true;
    }
    return false;
  }
  function scoreItem(item, toks) {
    var s = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], hit = false;
      if (tokenIn(t, item._title)) { s += 3; hit = true; }
      if (tokenIn(t, item._meta))  { s += 2; hit = true; }
      if (tokenIn(t, item._body))  { s += 1; hit = true; }
      if (!hit) return 0;
    }
    return s;
  }

  // bold the query words, Google-style, escaping everything else
  function highlight(text, toks) {
    if (!toks.length || !text) return esc(text);
    var re = new RegExp('(' + toks.map(regexEscape).join('|') + ')', 'ig');
    return String(text).split(re).map(function (part, idx) {
      return idx % 2 ? '<b>' + esc(part) + '</b>' : esc(part);
    }).join('');
  }
  function snippetFor(text, toks, maxLen) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    var lower = text.toLowerCase(), idx = -1;
    for (var i = 0; i < toks.length; i++) {
      var p = lower.indexOf(toks[i]);
      if (p !== -1) { idx = p; break; }
    }
    var start = idx > 60 ? idx - 60 : 0;
    var end = Math.min(text.length, start + maxLen);
    var out = text.slice(start, end);
    if (end < text.length) out = out.replace(/\s+\S*$/, '') + ' …';
    if (start > 0) out = '… ' + out.replace(/^\S*\s+/, '');
    return out;
  }

  // ── icons ──
  var ICON_SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  var ICON_CARDS = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>';
  var ICON_LIST = '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
  var ICON_CHEVRON = '<svg class="arc-dd-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';

  // ═══════════════════════════════════════════════════════════════
  function init() {
    var app = document.getElementById('archiveApp');
    if (!app) return;
    var cat = null;
    CATEGORIES.forEach(function (c) { if (c.key === app.getAttribute('data-category')) cat = c; });
    if (!cat) return;

    var description = app.getAttribute('data-description') || '';
    var items = [];
    var activeFacets = [];
    var state = { q: '', view: 'list', sort: '', filters: {}, page: 1, advanced: false };

    // restore from URL
    var params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    if (params.get('view') === 'cards') state.view = 'cards';
    if (SORTS[params.get('sort')]) state.sort = params.get('sort');
    FACETS.forEach(function (f) { if (params.get(f.key)) state.filters[f.key] = params.get(f.key); });
    state.page = Math.max(1, parseInt(params.get('page'), 10) || 1);
    // a shared link with filters in it opens with the advanced row showing
    state.advanced = Object.keys(state.filters).length > 0;

    // ── skeleton ──
    var railHTML = CATEGORIES.map(function (c) {
      return '<li><a href="' + c.href + '"' + (c.key === cat.key ? ' class="active" aria-current="page"' : '') + '>' + esc(c.label) + '</a></li>';
    }).join('');

    app.className = 'arc';
    app.innerHTML =
      // one row: filters on the left, search in the middle, view toggle on the right
      '<div class="arc-tools">' +
        '<div class="arc-controls">' +
          '<button type="button" class="arc-adv-toggle" id="arcAdvToggle" aria-expanded="false" aria-controls="arcAdvanced">Advanced search' + ICON_CHEVRON + '</button>' +
          '<div class="arc-sort" id="arcSort"></div>' +
        '</div>' +
        '<form class="arc-search" role="search" id="arcSearchForm">' +
          '<input type="search" id="arcQuery" autocomplete="off" placeholder="Search ' + esc(cat.label.toLowerCase()) + '" aria-label="Search ' + esc(cat.label) + '">' +
          '<button type="submit" class="arc-search-btn" aria-label="Search">' + ICON_SEARCH + '</button>' +
        '</form>' +
        '<div class="arc-view-toggle" role="group" aria-label="View">' +
          '<button type="button" data-view="list" title="List view" aria-label="List view">' + ICON_LIST + '</button>' +
          '<button type="button" data-view="cards" title="Card view" aria-label="Card view">' + ICON_CARDS + '</button>' +
        '</div>' +
      '</div>' +
      // advanced filters open just below the toolbar row
      '<div class="arc-advanced" id="arcAdvanced" hidden><div class="arc-facets" id="arcFacets"></div></div>' +
      // left column: page title and description, the categories list, then
      // (policy page only) the bills tracker. The rail is a div rather than
      // <nav>: shared.css styles bare nav elements as the old top bar
      '<div class="arc-side" id="arcSide">' +
        '<header class="arc-head">' +
          '<h1 class="arc-title">' + esc(cat.label) + '</h1>' +
          (description ? '<p class="arc-desc">' + esc(description) + '</p>' : '') +
        '</header>' +
        // categories (and, on the policy page, the bills tracker) stay in view while scrolling
        '<div class="arc-sticky" id="arcSticky">' +
        '<div class="arc-rail" role="navigation" aria-label="Categories">' +
          '<div class="arc-panel-label arc-rail-label">Categories</div>' +
          '<div class="arc-rail-divider arc-rail-divider--top"></div>' +
          '<ul>' + railHTML + '<li><a href="/canon">Canons</a></li></ul>' +
          '<div class="arc-rail-divider"></div>' +
        '</div>' +
        '</div>' +
      '</div>' +
      '<div class="arc-results" id="arcResults"><p class="arc-empty">Loading…</p></div>' +
      '<aside class="arc-panel" id="arcPanel" aria-label="Recent developments"></aside>';

    var input = document.getElementById('arcQuery');
    var resultsEl = document.getElementById('arcResults');
    var facetsEl = document.getElementById('arcFacets');
    var sortEl = document.getElementById('arcSort');
    var advEl = document.getElementById('arcAdvanced');
    var advBtn = document.getElementById('arcAdvToggle');
    var panelEl = document.getElementById('arcPanel');
    input.value = state.q;

    // on phones the rail is a horizontal strip; bring the current type into view
    var railEl = app.querySelector('.arc-rail');
    var activeLink = app.querySelector('.arc-rail a.active');
    if (railEl && activeLink && railEl.scrollWidth > railEl.clientWidth) {
      railEl.scrollLeft = Math.max(0, activeLink.offsetLeft - railEl.offsetLeft - 16);
    }

    // ── state → URL ──
    function syncURL() {
      var p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      FACETS.forEach(function (f) { if (state.filters[f.key]) p.set(f.key, state.filters[f.key]); });
      if (state.sort) p.set('sort', state.sort);
      if (state.view === 'cards') p.set('view', 'cards');
      if (state.page > 1) p.set('page', String(state.page));
      var qs = p.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }

    function effectiveSort() {
      if (state.sort === 'relevance' && !state.q) return 'newest';
      return state.sort || (state.q ? 'relevance' : 'newest');
    }

    function passesFilters(item, exceptKey) {
      for (var key in state.filters) {
        if (key === exceptKey || !state.filters[key]) continue;
        if (FACET_BY_KEY[key].values(item).indexOf(state.filters[key]) === -1) return false;
      }
      return true;
    }

    function queryMatches(toks) {
      return items.filter(function (it) {
        it._score = toks.length ? scoreItem(it, toks) : 1;
        return it._score > 0;
      });
    }

    function sorted(list) {
      var s = effectiveSort();
      return list.slice().sort(function (a, b) {
        if (s === 'relevance' && b._score !== a._score) return b._score - a._score;
        if (s === 'oldest') return a.time - b.time;
        return b.time - a.time;
      });
    }

    // ── tools row: one dropdown per facet plus sort ──
    function renderFacets(matched) {
      var html = activeFacets.map(function (f) {
        var base = matched.filter(function (it) { return passesFilters(it, f.key); });
        var counts = {};
        base.forEach(function (it) {
          f.values(it).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
        });
        var selected = state.filters[f.key];
        if (selected && !counts[selected]) counts[selected] = 0;
        var values = Object.keys(counts).sort(function (a, b) {
          if (f.order === 'desc') return b < a ? -1 : b > a ? 1 : 0;
          return facetDisplay(f, a).localeCompare(facetDisplay(f, b));
        });
        var btnLabel = selected ? facetDisplay(f, selected) : f.label;
        var opts = '<button type="button" class="arc-dd-opt' + (!selected ? ' selected' : '') + '" data-facet="' + f.key + '" data-value="">' + esc(f.any) + '</button>' +
          values.map(function (v) {
            return '<button type="button" class="arc-dd-opt' + (selected === v ? ' selected' : '') + '" data-facet="' + f.key + '" data-value="' + esc(v) + '">' +
              '<span>' + esc(facetDisplay(f, v)) + '</span><span class="arc-dd-n">' + counts[v] + '</span></button>';
          }).join('');
        return '<div class="arc-dd' + (selected ? ' is-set' : '') + '">' +
          '<button type="button" class="arc-dd-btn" aria-haspopup="true" aria-expanded="false" title="' + esc(f.label) + '"><span class="arc-dd-label">' + esc(btnLabel) + '</span>' + ICON_CHEVRON + '</button>' +
          '<div class="arc-dd-menu" role="menu">' + opts + '</div></div>';
      }).join('');

      var s = effectiveSort();
      var sortOpts = Object.keys(SORTS).filter(function (k) { return k !== 'relevance' || state.q; }).map(function (k) {
        return '<button type="button" class="arc-dd-opt' + (s === k ? ' selected' : '') + '" data-sort="' + k + '">' + SORTS[k] + '</button>';
      }).join('');
      sortEl.innerHTML = '<div class="arc-dd">' +
        '<button type="button" class="arc-dd-btn" aria-haspopup="true" aria-expanded="false">Sort: ' + SORTS[s] + ICON_CHEVRON + '</button>' +
        '<div class="arc-dd-menu" role="menu">' + sortOpts + '</div></div>';

      var anySet = Object.keys(state.filters).some(function (k) { return state.filters[k]; });
      if (anySet) html += '<button type="button" class="arc-clear" data-clear="1">Clear filters</button>';
      facetsEl.innerHTML = html;
      advEl.hidden = !state.advanced;
      advBtn.setAttribute('aria-expanded', state.advanced ? 'true' : 'false');
      advBtn.classList.toggle('open', state.advanced);
      advBtn.classList.toggle('is-set', anySet);
    }

    // ── results ──
    function metaLine(it) {
      var bits = [];
      if (it.publisher) bits.push('<span class="arc-pub">' + esc(it.origin === 'original' ? 'Phronesis' : it.publisher) + '</span>');
      if (it.date) bits.push(esc(fmtMonth(it.date)));
      if (it.subtype) bits.push(esc(titleCase(it.subtype)));
      if (it.topic) bits.push(esc(it.topic));
      if (it.level) bits.push(esc(titleCase(it.level)));
      return bits.join('<span class="arc-sep">·</span>');
    }
    function titleLink(it, toks, cls) {
      var inner = highlight(it.title, toks);
      if (!it.dest) return '<span class="' + cls + '">' + inner + '</span>';
      if (it.dest.reader) return '<a class="' + cls + '" href="' + esc(it.dest.url) + '" data-reader="' + esc(it.id) + '">' + inner + '</a>';
      return '<a class="' + cls + '" href="' + esc(it.dest.url) + '"' + (it.dest.external ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>';
    }
    // the summary under a title opens the same item as the title; it is
    // skipped in keyboard order since the title link already leads there
    function bodyLink(it, cls, html) {
      if (!it.dest) return '<p class="' + cls + '">' + html + '</p>';
      return '<a class="' + cls + ' arc-body-link" href="' + esc(it.dest.url) + '" tabindex="-1"' +
        (it.dest.reader ? ' data-reader="' + esc(it.id) + '"' : '') +
        (it.dest.external ? ' target="_blank" rel="noopener"' : '') + '>' + html + '</a>';
    }
    function tagLinks(it, max) {
      if (!it.tags.length) return '';
      return '<div class="arc-tags">' + it.tags.slice(0, max).map(function (t) {
        return '<button type="button" class="arc-tag" data-tag="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('') + '</div>';
    }

    function resultHTML(it, toks) {
      return '<article class="arc-result">' +
        titleLink(it, toks, 'arc-result-title') +
        '<div class="arc-meta">' + metaLine(it) + (it.origin === 'original' ? '<span class="arc-badge">Original</span>' : '') + '</div>' +
        (it.text ? bodyLink(it, 'arc-snippet', highlight(snippetFor(it.text, toks, 240), toks)) : '') +
        tagLinks(it, 4) +
      '</article>';
    }
    function cardHTML(it, toks) {
      var chips = [];
      if (it.subtype) chips.push('<span class="arc-chip arc-chip--accent">' + esc(titleCase(it.subtype)) + '</span>');
      if (it.topic) chips.push('<span class="arc-chip">' + esc(it.topic) + '</span>');
      if (it.level) chips.push('<span class="arc-chip">' + esc(titleCase(it.level)) + '</span>');
      if (it.origin === 'original') chips.push('<span class="arc-chip arc-chip--accent">Original</span>');
      var source = it.origin === 'original' ? 'Phronesis' : (it.publisher ? 'Via ' + it.publisher : '');
      return '<article class="arc-card">' +
        (chips.length ? '<div class="arc-card-chips">' + chips.join('') + '</div>' : '') +
        titleLink(it, toks, 'arc-card-title') +
        (it.text ? bodyLink(it, 'arc-card-text', highlight(snippetFor(it.text, toks, 200), toks)) : '') +
        '<div class="arc-card-foot"><span>' + esc(fmtMonth(it.date)) + '</span>' +
          (source ? '<span class="arc-card-src">' + esc(source) + '</span>' : '') + '</div>' +
      '</article>';
    }

    // Google Careers-style paging: "5–8 of 45" with previous / next arrows
    var ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
    var ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>';
    function pagerHTML(total, pages) {
      if (pages <= 1) return '';
      var size = PAGE_SIZE[state.view];
      var first = (state.page - 1) * size + 1;
      var last = Math.min(total, state.page * size);
      // a div rather than <nav>: shared.css gives bare nav elements the old
      // top-bar styling (sticky, fixed height, bottom border)
      return '<div class="arc-pager" role="navigation" aria-label="Result pages">' +
        '<span class="arc-pager-range">' + first + '\u2013' + last + ' of ' + total + '</span>' +
        '<button type="button" class="arc-pager-btn" data-page="' + (state.page - 1) + '" aria-label="Previous page"' + (state.page <= 1 ? ' disabled' : '') + '>' + ICON_PREV + '</button>' +
        '<button type="button" class="arc-pager-btn" data-page="' + (state.page + 1) + '" aria-label="Next page"' + (state.page >= pages ? ' disabled' : '') + '>' + ICON_NEXT + '</button>' +
      '</div>';
    }

    // Google-style timing line. It sits in the same row as the "Recently
    // added" heading so the first result lines up with the spotlit box.
    function statsHTML(ms) {
      var secs = ms / 1000;
      // report the real time; anything under 10 ms reads "under 0.01" rather than 0.00
      return '<p class="arc-stats">Loaded in ' + (secs < 0.01 ? 'under 0.01' : secs.toFixed(2)) + ' seconds</p>';
    }

    function render() {
      var t0 = performance.now();
      var toks = tokenize(state.q);
      var matched = queryMatches(toks);
      var list = sorted(matched.filter(function (it) { return passesFilters(it); }));

      renderFacets(matched);

      Array.prototype.forEach.call(document.querySelectorAll('.arc-view-toggle button'), function (b) {
        var on = b.getAttribute('data-view') === state.view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      // the first render also counts the time spent fetching the content file
      var ms = performance.now() - t0 + pendingLoadMs;
      pendingLoadMs = 0;

      if (!list.length) {
        resultsEl.innerHTML = statsHTML(ms) + '<div class="arc-empty"><p>No ' + esc(cat.label.toLowerCase()) +
          (state.q ? ' match \u201C' + esc(state.q) + '\u201D' : ' match these filters') + '.</p>' +
          '<button type="button" class="arc-clear" data-clear="all">Clear search and filters</button></div>' +
          expandHTML();
        return;
      }

      var size = PAGE_SIZE[state.view];
      var pages = Math.ceil(list.length / size);
      if (state.page > pages) state.page = pages;
      var start = (state.page - 1) * size;
      var page = list.slice(start, start + size);
      var body = statsHTML(ms) + (state.view === 'cards'
        ? '<div class="arc-cards">' + page.map(function (it) { return cardHTML(it, toks); }).join('') + '</div>'
        : '<div class="arc-list">' + page.map(function (it) { return resultHTML(it, toks); }).join('') + '</div>');
      body += pagerHTML(list.length, pages) + expandHTML();
      resultsEl.innerHTML = body;
    }

    // after a search, offer to run the same words across every category
    function expandHTML() {
      if (!state.q) return '';
      return '<div class="arc-expand">' +
        '<button type="button" class="arc-expand-btn" data-expand="1">Search all of Phronesis for \u201C' + esc(state.q) + '\u201D \u2192</button>' +
      '</div>';
    }
    // hands the query to the site-wide search in the header (masthead.js)
    function expandSearch(q) {
      var openBtn = document.getElementById('searchIconBtn');
      var siteInput = document.getElementById('searchInput');
      if (!openBtn || !siteInput) return;
      setTimeout(function () {
        openBtn.click();
        siteInput.value = q;
        siteInput.dispatchEvent(new Event('input', { bubbles: true }));
        siteInput.focus();
      }, 0);
    }

    // ── right panel: newest item spotlit, then up to ten more as cards.
    //    Always the category's newest work; search and filters don't change it.
    function miniCard(it) {
      var kicker = it.subtype ? titleCase(it.subtype) : (it.topic || '');
      var source = it.origin === 'original' ? 'Phronesis' : it.publisher;
      return '<article class="arc-mini">' +
        (kicker ? '<span class="arc-mini-kicker">' + esc(kicker) + '</span>' : '') +
        titleLink(it, [], 'arc-mini-title') +
        '<span class="arc-mini-meta">' + esc(fmtMonth(it.date)) + '</span>' +
        (source ? '<span class="arc-mini-src">' + esc(source) + '</span>' : '') +
      '</article>';
    }
    // ordered by each document's own date (not when it was added to the
    // site): the most recently dated work is spotlit, older work follows
    function renderPanel() {
      var recent = items.slice().sort(function (a, b) { return b.time - a.time; }).slice(0, RECENT_COUNT);
      if (!recent.length) { panelEl.innerHTML = ''; return; }
      var lead = recent[0];
      var html = '<div class="arc-panel-label">Recent developments</div>' +
        '<div class="arc-spot">' +
          titleLink(lead, [], 'arc-spot-title') +
          '<div class="arc-meta">' + metaLine(lead) + '</div>' +
          (lead.text ? bodyLink(lead, 'arc-spot-text', esc(snippetFor(lead.text, [], 320))) : '') +
          tagLinks(lead, 6) +
        '</div>';
      if (recent.length > 1) {
        html += '<div class="arc-mini-grid">' + recent.slice(1).map(miniCard).join('') + '</div>';
      }
      panelEl.innerHTML = html;
    }

    // ── essay reader (essays page only) ──
    var readerEl = null;
    function bodyToHTML(raw, bodyHtml) {
      if (bodyHtml) return sanitizeHtml(bodyHtml);
      if (!raw) return '';
      return sanitizeHtml(plainToHTML(raw));
    }
    function plainToHTML(raw) {
      raw = raw.replace(/\[IMAGE: ([^\]]*)\]\(([^)]+)\)/g, '<figure><img src="$2" alt="$1" /><figcaption>$1</figcaption></figure>');
      return raw.split(/\n\n+/).map(function (p) {
        p = p.trim();
        if (!p) return '';
        if (p.indexOf('<figure>') === 0 || p.indexOf('<img') === 0) return p;
        if (/^Works Cited$/i.test(p) || /^References$/i.test(p)) return '<h2>' + p + '</h2>';
        if (/^By:/.test(p)) return '<p class="arc-reader-byline">' + p + '</p>';
        if (p.indexOf('### ') === 0) return '<h3>' + p.slice(4) + '</h3>';
        if (p.indexOf('## ') === 0) return '<h2>' + p.slice(3) + '</h2>';
        if (p.indexOf('# ') === 0) return '<h1>' + p.slice(2) + '</h1>';
        return '<p>' + p + '</p>';
      }).join('');
    }
    function sanitizeHtml(html) {
      var div = document.createElement('div');
      div.innerHTML = html;
      Array.prototype.forEach.call(div.querySelectorAll('script, style, iframe, object, embed'), function (n) { n.remove(); });
      Array.prototype.forEach.call(div.querySelectorAll('*'), function (el) {
        Array.prototype.slice.call(el.attributes).forEach(function (attr) {
          if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
          if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
        });
        if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      });
      return div.innerHTML;
    }
    function openReader(id) {
      var it = null;
      items.forEach(function (x) { if (x.id === id && x.dest && x.dest.reader) it = x; });
      if (!it) return false;
      if (!readerEl) {
        readerEl = document.createElement('div');
        readerEl.className = 'arc-reader';
        readerEl.innerHTML =
          '<div class="arc-reader-panel" role="dialog" aria-modal="true" aria-label="Essay">' +
            '<div class="arc-reader-bar"><span class="arc-reader-label"></span>' +
            '<button type="button" class="arc-reader-close">Close</button></div>' +
            '<div class="arc-reader-scroll"><article class="arc-reader-body"></article></div>' +
          '</div>';
        document.body.appendChild(readerEl);
        readerEl.addEventListener('click', function (e) {
          if (e.target === readerEl || e.target.closest('.arc-reader-close')) closeReader();
        });
      }
      readerEl.querySelector('.arc-reader-label').textContent = 'Essay' + (it.topic ? ' \u00B7 ' + it.topic : '');
      readerEl.querySelector('.arc-reader-body').innerHTML = bodyToHTML(it.body, it.body_html);
      readerEl.querySelector('.arc-reader-scroll').scrollTop = 0;
      readerEl.classList.add('open');
      document.body.style.overflow = 'hidden';
      history.replaceState(null, '', window.location.pathname + window.location.search + '#' + it.id);
      readerEl.querySelector('.arc-reader-close').focus();
      return true;
    }
    function closeReader() {
      if (!readerEl || !readerEl.classList.contains('open')) return;
      readerEl.classList.remove('open');
      document.body.style.overflow = '';
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    function openReaderFromHash() {
      var id = decodeURIComponent(window.location.hash.slice(1));
      if (id) openReader(id);
    }

    // ── tech policy tracker (policy page only): three bills visible at a time,
    // scrolling slowly. Data: /bills-data.json, written by scripts/refresh_bills.py
    // from the Integrity Institute Tech Policy Tracker (the same source as the
    // Tech Policy Hub's ticker), refreshed daily by .github/workflows/refresh-bills.yml.
    function loadBills() {
      fetch(BILLS_URL)
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .then(function (json) {
          var bills = (json.items || []).filter(function (b) { return b && b.title; });
          if (!bills.length) return;
          var rows = bills.map(function (b) {
            var meta = [b.code, fmtMonth(b.date)].filter(Boolean).join(' \u00B7 ');
            var inner =
              '<span class="arc-bill-top"><span class="arc-bill-badge" title="' + esc(b.jurisdiction_name || b.jurisdiction) + '">' + esc(b.jurisdiction) + '</span>' +
              (meta ? '<span class="arc-bill-status">' + esc(meta) + '</span>' : '') + '</span>' +
              '<span class="arc-bill-title">' + esc(b.title) + '</span>';
            return b.link
              ? '<li><a class="arc-bill" href="' + esc(b.link) + '" target="_blank" rel="noopener" title="' + esc(b.title) + '">' + inner + '</a></li>'
              : '<li><span class="arc-bill" title="' + esc(b.title) + '">' + inner + '</span></li>';
          }).join('');
          var box = document.createElement('section');
          box.className = 'arc-bills';
          box.setAttribute('aria-label', 'Technology and AI bills');
          // the list is rendered twice so the scroll can loop seamlessly;
          // the copy is hidden from screen readers and keyboard focus
          var copy = rows.replace(/<li>/g, '<li aria-hidden="true">').replace(/<a class="arc-bill"/g, '<a tabindex="-1" class="arc-bill"');
          box.innerHTML = '<div class="arc-bills-head">Tech Policy Tracker</div>' +
            '<div class="arc-bills-window"><ul class="arc-bills-track">' + rows + (bills.length > 3 ? copy : '') + '</ul></div>' +
            '<div class="arc-bills-src">Source: Integrity Institute ' +
              '<a href="https://us-federal.techpolicytracker.com/" target="_blank" rel="noopener">federal</a> and ' +
              '<a href="https://us-state.techpolicytracker.com/" target="_blank" rel="noopener">state</a> trackers</div>';
          document.getElementById('arcSticky').appendChild(box);
          var track = box.querySelector('.arc-bills-track');
          if (bills.length > 3) {
            // pace the loop so each bill takes about five seconds to pass
            track.style.animationDuration = (bills.length * 5) + 's';
          } else {
            track.style.animation = 'none';
          }
        })
        .catch(function (err) { console.warn('Bills list unavailable:', err); });
    }

    function update(resetPaging) {
      if (resetPaging) state.page = 1;
      syncURL();
      render();
    }

    function closeMenus(except) {
      Array.prototype.forEach.call(app.querySelectorAll('.arc-dd.open'), function (dd) {
        if (dd === except) return;
        dd.classList.remove('open');
        var b = dd.querySelector('.arc-dd-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }

    // ── events (delegated so re-renders don't need rewiring) ──
    var debounce;
    input.addEventListener('input', function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.q = input.value.trim(); update(true); }, 120);
    });
    document.getElementById('arcSearchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(debounce);
      state.q = input.value.trim();
      update(true);
    });

    app.addEventListener('click', function (e) {
      var r = e.target.closest('a[data-reader]');
      if (r) { e.preventDefault(); openReader(r.getAttribute('data-reader')); return; }
      var t = e.target.closest('button');
      if (!t || !app.contains(t)) return;

      if (t.classList.contains('arc-dd-btn')) {
        var dd = t.parentNode;
        var willOpen = !dd.classList.contains('open');
        closeMenus(dd);
        dd.classList.toggle('open', willOpen);
        t.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        return;
      }
      if (t.hasAttribute('data-facet')) {
        var key = t.getAttribute('data-facet'), val = t.getAttribute('data-value');
        if (val) state.filters[key] = val; else delete state.filters[key];
        closeMenus();
        update(true);
        return;
      }
      if (t.hasAttribute('data-sort')) {
        state.sort = t.getAttribute('data-sort');
        closeMenus();
        update(true);
        return;
      }
      if (t.hasAttribute('data-clear')) {
        state.filters = {};
        if (t.getAttribute('data-clear') === 'all') { state.q = ''; input.value = ''; }
        update(true);
        return;
      }
      if (t.hasAttribute('data-view')) {
        state.view = t.getAttribute('data-view');
        update(true);   // page sizes differ between views, so start from page 1
        return;
      }
      if (t.hasAttribute('data-page')) {
        state.page = parseInt(t.getAttribute('data-page'), 10) || 1;
        update(false);
        window.scrollTo({ top: resultsEl.getBoundingClientRect().top + window.pageYOffset - 120, behavior: 'smooth' });
        return;
      }
      if (t.id === 'arcAdvToggle') {
        state.advanced = !state.advanced;
        advEl.hidden = !state.advanced;
        t.setAttribute('aria-expanded', state.advanced ? 'true' : 'false');
        t.classList.toggle('open', state.advanced);
        return;
      }
      if (t.hasAttribute('data-expand')) {
        expandSearch(state.q);
        return;
      }
      if (t.hasAttribute('data-tag')) {
        state.q = t.getAttribute('data-tag');
        input.value = state.q;
        update(true);
        window.scrollTo({ top: app.getBoundingClientRect().top + window.pageYOffset - 20, behavior: 'smooth' });
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.arc-dd')) closeMenus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeMenus(); closeReader(); }
    });

    // ── load ──
    var loadStart = performance.now();
    var pendingLoadMs = 0;
    fetch('/content/' + cat.file)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (json) {
        items = (json.entries || [])
          .filter(function (e) { return !e.placeholder; })
          .map(function (e) { return normalize(e, cat); });
        activeFacets = FACETS.filter(function (f) {
          var seen = {};
          items.forEach(function (it) { f.values(it).forEach(function (v) { seen[v] = true; }); });
          return Object.keys(seen).length > 1;
        });
        // drop URL filters for facets this category doesn't offer
        Object.keys(state.filters).forEach(function (k) {
          if (activeFacets.indexOf(FACET_BY_KEY[k]) === -1) delete state.filters[k];
        });
        pendingLoadMs = performance.now() - loadStart;
        renderPanel();
        update(false);
        if (cat.key === 'policy') loadBills();   // the tracker lives on the policy page only
        if (cat.key === 'essays') {
          openReaderFromHash();
          window.addEventListener('hashchange', openReaderFromHash);
        }
      })
      .catch(function (err) {
        console.error('Could not load ' + cat.file + ':', err);
        resultsEl.innerHTML = '<p class="arc-empty">Could not load content.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
