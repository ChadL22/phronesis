// ═══════════════════════════════════════════════════════════════
// ARCHIVE LAYOUT — Phronesis Research
// Shared three-column layout for the content category pages
// (research, policy, legal, essays, articles, reports), modeled on
// Google's 2012 results page:
//   left   → the other content types, current one highlighted
//   center → a search bar scoped to this category, a tools row with
//            filter dropdowns + card/list toggle, then the results
//   right  → the most recent items in this category
//
// A page opts in with a single mount point:
//   <div id="archiveApp" data-category="policy"
//        data-description="..."></div>
// Title and description come from the page itself so no copy lives
// here. Search, filters, sort, and view are mirrored into the URL
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
  var PAGE_SIZE = 20;
  var RECENT_COUNT = 5;
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
    var subtype = e.document_type || (e.type && e.type !== cat.type ? e.type : '');
    var item = {
      id: e.id,
      title: e.title || 'Untitled',
      subtitle: e.subtitle || '',
      text: e.abstract || e.preview || e.subtitle || '',
      date: e.date || '',
      time: e.date ? (Date.parse(e.date + 'T00:00:00') || 0) : 0,
      year: e.date ? String(e.date).slice(0, 4) : '',
      subtype: subtype,
      level: e.level || e.audience || '',
      fields: e.fields || [],
      tags: e.tags || [],
      origin: e.origin || '',
      publisher: e.publisher || '',
      dest: destinationFor(e, cat.page)
    };
    item._title = item.title.toLowerCase();
    item._meta = [item.tags.join(' '), item.fields.join(' '), item.publisher, item.subtype, item.level].join(' ').toLowerCase();
    item._body = [item.subtitle, item.text].join(' ').toLowerCase();
    return item;
  }

  // ── facets: only those with 2+ distinct values in a category are shown ──
  var FACETS = [
    { key: 'year',      label: 'Year',      any: 'Any year',      order: 'desc', values: function (i) { return i.year ? [i.year] : []; } },
    { key: 'type',      label: 'Type',      any: 'Any type',      display: titleCase, values: function (i) { return i.subtype ? [i.subtype] : []; } },
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
    var state = { q: '', view: 'list', sort: '', filters: {}, shown: PAGE_SIZE };

    // restore from URL
    var params = new URLSearchParams(window.location.search);
    state.q = params.get('q') || '';
    if (params.get('view') === 'cards') state.view = 'cards';
    if (SORTS[params.get('sort')]) state.sort = params.get('sort');
    FACETS.forEach(function (f) { if (params.get(f.key)) state.filters[f.key] = params.get(f.key); });

    // ── skeleton ──
    var railHTML = CATEGORIES.map(function (c) {
      return '<li><a href="' + c.href + '"' + (c.key === cat.key ? ' class="active" aria-current="page"' : '') + '>' + esc(c.label) + '</a></li>';
    }).join('');

    app.className = 'arc';
    app.innerHTML =
      '<h1 class="arc-title">' + esc(cat.label) + '</h1>' +
      '<div class="arc-search-area">' +
        '<form class="arc-search" role="search" id="arcSearchForm">' +
          '<input type="search" id="arcQuery" autocomplete="off" placeholder="Search ' + esc(cat.label.toLowerCase()) + '" aria-label="Search ' + esc(cat.label) + '">' +
          '<button type="submit" class="arc-search-btn" aria-label="Search">' + ICON_SEARCH + '</button>' +
        '</form>' +
        (description ? '<p class="arc-desc">' + esc(description) + '</p>' : '') +
      '</div>' +
      // a div rather than <nav>: shared.css styles bare nav elements as the old top bar
      '<div class="arc-rail" role="navigation" aria-label="Content types">' +
        '<ul>' + railHTML + '</ul>' +
        '<div class="arc-rail-divider"></div>' +
        '<ul><li><a href="/canon">Canons</a></li></ul>' +
      '</div>' +
      '<div class="arc-tools">' +
        '<div class="arc-count" id="arcCount" aria-live="polite"></div>' +
        '<div class="arc-controls">' +
          '<div class="arc-facets" id="arcFacets"></div>' +
          '<div class="arc-view-toggle" role="group" aria-label="View">' +
            '<button type="button" data-view="list" title="List view" aria-label="List view">' + ICON_LIST + '</button>' +
            '<button type="button" data-view="cards" title="Card view" aria-label="Card view">' + ICON_CARDS + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="arc-results" id="arcResults"><p class="arc-empty">Loading…</p></div>' +
      '<aside class="arc-panel" id="arcPanel" aria-label="Most recent"></aside>';

    var input = document.getElementById('arcQuery');
    var resultsEl = document.getElementById('arcResults');
    var countEl = document.getElementById('arcCount');
    var facetsEl = document.getElementById('arcFacets');
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
          '<button type="button" class="arc-dd-btn" aria-haspopup="true" aria-expanded="false" title="' + esc(f.label) + '">' + esc(btnLabel) + ICON_CHEVRON + '</button>' +
          '<div class="arc-dd-menu" role="menu">' + opts + '</div></div>';
      }).join('');

      var s = effectiveSort();
      var sortOpts = Object.keys(SORTS).filter(function (k) { return k !== 'relevance' || state.q; }).map(function (k) {
        return '<button type="button" class="arc-dd-opt' + (s === k ? ' selected' : '') + '" data-sort="' + k + '">' + SORTS[k] + '</button>';
      }).join('');
      html += '<div class="arc-dd">' +
        '<button type="button" class="arc-dd-btn" aria-haspopup="true" aria-expanded="false">Sort: ' + SORTS[s] + ICON_CHEVRON + '</button>' +
        '<div class="arc-dd-menu" role="menu">' + sortOpts + '</div></div>';

      var anySet = Object.keys(state.filters).some(function (k) { return state.filters[k]; });
      if (anySet) html += '<button type="button" class="arc-clear" data-clear="1">Clear</button>';
      facetsEl.innerHTML = html;
    }

    // ── results ──
    function metaLine(it) {
      var bits = [];
      if (it.publisher) bits.push('<span class="arc-pub">' + esc(it.origin === 'original' ? 'Phronesis' : it.publisher) + '</span>');
      if (it.date) bits.push(esc(fmtMonth(it.date)));
      if (it.subtype) bits.push(esc(titleCase(it.subtype)));
      if (it.level) bits.push(esc(titleCase(it.level)));
      return bits.join('<span class="arc-sep">·</span>');
    }
    function titleLink(it, toks, cls) {
      var inner = highlight(it.title, toks);
      if (!it.dest) return '<span class="' + cls + '">' + inner + '</span>';
      return '<a class="' + cls + '" href="' + esc(it.dest.url) + '"' + (it.dest.external ? ' target="_blank" rel="noopener"' : '') + '>' + inner + '</a>';
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
        (it.text ? '<p class="arc-snippet">' + highlight(snippetFor(it.text, toks, 240), toks) + '</p>' : '') +
        tagLinks(it, 4) +
      '</article>';
    }
    function cardHTML(it, toks) {
      var chips = [];
      if (it.subtype) chips.push('<span class="arc-chip arc-chip--accent">' + esc(titleCase(it.subtype)) + '</span>');
      if (it.level) chips.push('<span class="arc-chip">' + esc(titleCase(it.level)) + '</span>');
      if (it.origin === 'original') chips.push('<span class="arc-chip arc-chip--accent">Original</span>');
      var source = it.origin === 'original' ? 'Phronesis' : (it.publisher ? 'Via ' + it.publisher : '');
      return '<article class="arc-card">' +
        (chips.length ? '<div class="arc-card-chips">' + chips.join('') + '</div>' : '') +
        titleLink(it, toks, 'arc-card-title') +
        (it.text ? '<p class="arc-card-text">' + highlight(snippetFor(it.text, toks, 200), toks) + '</p>' : '') +
        '<div class="arc-card-foot"><span>' + esc(fmtMonth(it.date)) + '</span>' +
          (source ? '<span class="arc-card-src">' + esc(source) + '</span>' : '') + '</div>' +
      '</article>';
    }

    function render() {
      var toks = tokenize(state.q);
      var matched = queryMatches(toks);
      var list = sorted(matched.filter(function (it) { return passesFilters(it); }));

      renderFacets(matched);

      var noun = list.length === 1 ? 'result' : 'results';
      countEl.textContent = list.length + ' ' + noun + (state.q ? ' for \u201C' + state.q + '\u201D' : '');

      Array.prototype.forEach.call(document.querySelectorAll('.arc-view-toggle button'), function (b) {
        var on = b.getAttribute('data-view') === state.view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (!list.length) {
        resultsEl.innerHTML = '<div class="arc-empty"><p>No ' + esc(cat.label.toLowerCase()) +
          (state.q ? ' match \u201C' + esc(state.q) + '\u201D' : ' match these filters') + '.</p>' +
          '<button type="button" class="arc-clear" data-clear="all">Clear search and filters</button></div>';
        return;
      }

      var page = list.slice(0, state.shown);
      var body = state.view === 'cards'
        ? '<div class="arc-cards">' + page.map(function (it) { return cardHTML(it, toks); }).join('') + '</div>'
        : '<div class="arc-list">' + page.map(function (it) { return resultHTML(it, toks); }).join('') + '</div>';
      if (list.length > state.shown) {
        body += '<button type="button" class="arc-more" data-more="1">More results (' + (list.length - state.shown) + ')</button>';
      }
      resultsEl.innerHTML = body;
    }

    // ── right panel: most recent in this category (not affected by search) ──
    function renderPanel() {
      var recent = items.slice().sort(function (a, b) { return b.time - a.time; }).slice(0, RECENT_COUNT);
      if (!recent.length) { panelEl.innerHTML = ''; return; }
      var lead = recent[0];
      var html = '<div class="arc-panel-label">Most recent</div>' +
        '<div class="arc-panel-lead">' +
          titleLink(lead, [], 'arc-panel-title') +
          '<div class="arc-meta">' + metaLine(lead) + '</div>' +
          (lead.text ? '<p class="arc-panel-text">' + esc(snippetFor(lead.text, [], 320)) + '</p>' : '') +
          tagLinks(lead, 6) +
        '</div>';
      if (recent.length > 1) {
        html += '<div class="arc-panel-label arc-panel-label--sub">Also recent</div><ul class="arc-panel-list">' +
          recent.slice(1).map(function (it) {
            return '<li>' + titleLink(it, [], 'arc-panel-item') +
              '<span class="arc-panel-date">' + esc(fmtMonth(it.date)) + (it.publisher && it.origin !== 'original' ? ' · ' + esc(it.publisher) : '') + '</span></li>';
          }).join('') + '</ul>';
      }
      panelEl.innerHTML = html;
    }

    function update(resetPaging) {
      if (resetPaging) state.shown = PAGE_SIZE;
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
        update(false);
        return;
      }
      if (t.hasAttribute('data-more')) {
        state.shown += PAGE_SIZE;
        render();
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
      if (e.key === 'Escape') closeMenus();
    });

    // ── load ──
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
        renderPanel();
        update(true);
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
