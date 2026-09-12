// ═══════════════════════════════════════════════════════════════
// SITE MASTHEAD — Phronesis Research
// Wires up the shared header used on every page: the "random piece
// of content" dice, the pronunciation button, the search overlay
// with live grouped/fuzzy suggestions, and the hamburger menu
// (including click-away-to-close). Everything is wrapped in an IIFE
// so nothing here leaks into the global scope and collides with a
// page's own inline script (several pages declare their own
// TYPE_LABELS / CONTENT_FILES already).
// ═══════════════════════════════════════════════════════════════
(function () {

  var CONTENT_SOURCES = [
    { file: 'research.json', page: 'research.html' },
    { file: 'policy.json',   page: 'policy.html'   },
    { file: 'legal.json',    page: 'legal.html'    },
    { file: 'essays.json',   page: 'essays.html'   },
    { file: 'articles.json', page: 'articles.html' },
    { file: 'reports.json',  page: 'reports.html'  }
  ];

  var TYPE_LABELS = {
    research: 'Research paper', policy: 'Policy artifact', legal: 'Legal analysis',
    essay: 'Essay', article: 'Article', report: 'Report', canon: 'Canon'
  };
  var CATEGORY_LABELS_PLURAL = {
    research: 'Research Papers', policy: 'Policy Artifacts', legal: 'Legal Analyses',
    essay: 'Essays', article: 'Articles', report: 'Reports', canon: 'Canons'
  };
  var CATEGORY_RENDER_ORDER = ['research', 'policy', 'legal', 'essay', 'article', 'report', 'canon'];

  // ── shared link resolution (mirrors each archive page's own resolveLink) ──
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

  // ── random piece of content (the dice) ──
  function goToRandomContent(e) {
    e.preventDefault();
    var link = e.currentTarget;
    if (link.dataset.loading === '1') return;
    link.dataset.loading = '1';

    Promise.all(CONTENT_SOURCES.map(function (src) {
      return fetch('/content/' + src.file)
        .then(function (res) { return res.json(); })
        .then(function (json) {
          return (json.entries || [])
            .filter(function (entry) { return !entry.placeholder; })
            .map(function (entry) { return destinationFor(entry, src.page); })
            .filter(Boolean);
        })
        .catch(function () { return []; });
    })).then(function (lists) {
      var pool = [].concat.apply([], lists);
      if (!pool.length) return;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick.external) window.open(pick.url, '_blank', 'noopener');
      else window.location.href = pick.url;
    }).catch(function (err) {
      console.error('Could not load random content:', err);
    }).finally(function () {
      link.dataset.loading = '0';
    });
  }

  // ── search: fuzzy, multi-field, grouped by type ──
  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    var prev = [];
    for (var j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      var cur = [i];
      for (var j2 = 1; j2 <= bl; j2++) {
        var cost = a.charAt(i - 1) === b.charAt(j2 - 1) ? 0 : 1;
        cur[j2] = Math.min(prev[j2] + 1, cur[j2 - 1] + 1, prev[j2 - 1] + cost);
      }
      prev = cur;
    }
    return prev[bl];
  }
  function fuzzyThreshold(len) { return len <= 7 ? 1 : 2; }
  function wordFuzzyMatch(word, targetText) {
    if (targetText.indexOf(word) !== -1) return true;
    var thresh = fuzzyThreshold(word.length);
    var tokens = targetText.split(/[^a-z0-9]+/);
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!t || Math.abs(t.length - word.length) > thresh) continue;
      if (levenshtein(word, t) <= thresh) return true;
    }
    return false;
  }
  function makeSnippet(content, words) {
    var lower = content.toLowerCase();
    var idx = -1;
    for (var i = 0; i < words.length; i++) {
      var p = lower.indexOf(words[i]);
      if (p !== -1) { idx = p; break; }
    }
    if (idx === -1) idx = 0;
    var start = Math.max(0, idx - 40);
    var end = Math.min(content.length, idx + 100);
    var snippet = content.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < content.length) snippet = snippet + '…';
    return snippet;
  }

  var searchIndexPromise = null;
  function getSearchIndex() {
    if (!searchIndexPromise) {
      var entriesPromise = Promise.all(CONTENT_SOURCES.map(function (src) {
        return fetch('/content/' + src.file)
          .then(function (res) { return res.json(); })
          .then(function (json) {
            return (json.entries || [])
              .filter(function (entry) { return !entry.placeholder; })
              .map(function (entry) {
                var dest = destinationFor(entry, src.page);
                var typeLabel = TYPE_LABELS[entry.type] || entry.type || '';
                var content = entry.abstract || entry.preview || entry.subtitle || '';
                var tags = (entry.tags || []).join(' ');
                var fields = (entry.fields || []).join(' ');
                var searchable = [entry.title, entry.publisher, tags, fields, typeLabel, content].join(' ').toLowerCase();
                return {
                  title: entry.title || '', publisher: entry.publisher || '', type: entry.type,
                  content: content, searchable: searchable, dest: dest
                };
              });
          })
          .catch(function () { return []; });
      })).then(function (lists) { return [].concat.apply([], lists); });

      var topicsPromise = fetch('/content/topics.json')
        .then(function (res) { return res.json(); })
        .then(function (json) {
          return (json.topics || []).map(function (t) {
            var searchable = [t.name, t.description, 'canon'].join(' ').toLowerCase();
            return {
              title: t.name, publisher: '', type: 'canon', content: t.description || '',
              searchable: searchable, dest: { url: 'canon.html?t=' + t.id, external: false }
            };
          });
        })
        .catch(function () { return []; });

      searchIndexPromise = Promise.all([entriesPromise, topicsPromise]).then(function (r) { return r[0].concat(r[1]); });
    }
    return searchIndexPromise;
  }

  function resultRowHTML(item) {
    var snippet = item.snippet ? '<span class="search-result-snippet">' + item.snippet + '</span>' : '';
    return '<div class="search-result-item" data-url="' + (item.dest ? item.dest.url : '') + '" data-external="' + (item.dest && item.dest.external ? '1' : '0') + '">' +
      '<span class="search-result-title">' + item.title + '</span>' +
      snippet +
      (item.publisher ? '<span class="search-result-meta"><span class="srm-pub">' + item.publisher + '</span></span>' : '') +
      '</div>';
  }

  function renderSearchResults(items, query) {
    var container = document.getElementById('searchResults');
    var hint = document.getElementById('searchHint');
    if (!container || !hint) return;
    if (!query) {
      container.style.display = 'none';
      container.innerHTML = '';
      hint.style.display = '';
      return;
    }
    hint.style.display = 'none';
    container.style.display = 'block';
    if (!items.length) {
      container.innerHTML = '<div class="search-no-results">No matches for “' + query + '”</div>';
      return;
    }

    var groups = {};
    items.forEach(function (item) { (groups[item.type] = groups[item.type] || []).push(item); });

    var html = '';
    CATEGORY_RENDER_ORDER.forEach(function (type) {
      var list = groups[type];
      if (!list || !list.length) return;
      list.sort(function (a, b) { return (a.snippet ? 1 : 0) - (b.snippet ? 1 : 0); });
      html += '<div class="search-group-header"><span>' + (CATEGORY_LABELS_PLURAL[type] || type) + '</span><span>' + list.length + '</span></div>';
      list.slice(0, 4).forEach(function (item) { html += resultRowHTML(item); });
      if (list.length > 4) {
        html += '<div class="search-more-note">+' + (list.length - 4) + ' more ' + (CATEGORY_LABELS_PLURAL[type] || type).toLowerCase() + '</div>';
      }
    });
    container.innerHTML = html;

    Array.prototype.forEach.call(container.querySelectorAll('.search-result-item'), function (row) {
      row.addEventListener('click', function () {
        var url = row.getAttribute('data-url');
        if (!url) return;
        if (row.getAttribute('data-external') === '1') window.open(url, '_blank', 'noopener');
        else window.location.href = url;
      });
    });
  }

  function openSearch() {
    var overlay = document.getElementById('searchOverlay');
    var input = document.getElementById('searchInput');
    if (overlay) overlay.classList.add('open');
    if (input) input.focus();
  }
  function closeSearch() {
    var overlay = document.getElementById('searchOverlay');
    var input = document.getElementById('searchInput');
    if (overlay) overlay.classList.remove('open');
    if (input) input.value = '';
    renderSearchResults([], '');
  }

  var MIN_QUERY_LENGTH = 2;
  var searchDebounceTimer;
  function wireSearch() {
    var input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', function (e) {
      var query = e.target.value.trim();
      clearTimeout(searchDebounceTimer);
      if (query.length < MIN_QUERY_LENGTH) { renderSearchResults([], ''); return; }
      searchDebounceTimer = setTimeout(function () {
        getSearchIndex().then(function (all) {
          var words = query.toLowerCase().split(/\s+/).filter(Boolean);
          var matches = [];
          all.forEach(function (item) {
            if (!item.dest) return;
            if (!words.every(function (w) { return wordFuzzyMatch(w, item.searchable); })) return;
            var titleLower = item.title.toLowerCase();
            var titleHit = words.some(function (w) { return wordFuzzyMatch(w, titleLower); });
            var out = { title: item.title, publisher: item.publisher, type: item.type, dest: item.dest, snippet: null };
            if (!titleHit && item.content) out.snippet = makeSnippet(item.content, words);
            matches.push(out);
          });
          renderSearchResults(matches, query);
        });
      }, 150);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = document.querySelector('.search-result-item');
        if (first) first.click();
      }
    });
  }

  // ── wire everything up once the header markup is in the DOM ──
  function init() {
    var diceLink = document.getElementById('randomArticleLink');
    if (diceLink) diceLink.addEventListener('click', goToRandomContent);

    var pronBtn = document.getElementById('pronBtn');
    if (pronBtn) {
      pronBtn.addEventListener('click', function () {
        var audio = document.getElementById('pronAudio');
        if (audio) { audio.currentTime = 0; audio.play(); }
      });
    }

    var searchIconBtn = document.getElementById('searchIconBtn');
    if (searchIconBtn) searchIconBtn.addEventListener('click', openSearch);

    var escBtn = document.querySelector('.search-panel .esc');
    if (escBtn) escBtn.addEventListener('click', closeSearch);

    var overlay = document.getElementById('searchOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeSearch();
      });
    }

    wireSearch();

    var hamburgerBtn = document.getElementById('hamburgerBtn');
    var menuPanel = document.getElementById('menuPanel');
    if (hamburgerBtn && menuPanel) {
      hamburgerBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        menuPanel.classList.toggle('open');
      });
      menuPanel.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    document.addEventListener('click', function () {
      if (menuPanel) menuPanel.classList.remove('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeSearch();
        if (menuPanel) menuPanel.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
