// ═══════════════════════════════════════════════════════════════
// NAV MENU TOGGLE - Phronesis Research
// Single source of truth for the menu button.
// ═══════════════════════════════════════════════════════════════

(function () {
  function initNavToggle() {
    var navToggle = document.getElementById('nav-toggle');
    var navMenu = document.getElementById('nav-menu');

    if (!navToggle || !navMenu) {
      console.warn('[chat.js] Nav elements not found (nav-toggle:', !!navToggle, 'nav-menu:', !!navMenu, ')');
      return;
    }

    // Guard against double-binding in case this script runs more than once
    if (navToggle.dataset.navBound === '1') return;
    navToggle.dataset.navBound = '1';

    // Toggle menu when button clicked
    navToggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      navToggle.classList.toggle('is-open');
      navMenu.classList.toggle('is-open');
    });

    // Prevent clicks inside the menu from closing it
    navMenu.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // Close menu when clicking anywhere else on the page
    document.addEventListener('click', function () {
      navToggle.classList.remove('is-open');
      navMenu.classList.remove('is-open');
    });

    // Close menu on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        navToggle.classList.remove('is-open');
        navMenu.classList.remove('is-open');
      }
    });

    console.log('[chat.js] Nav toggle initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavToggle);
  } else {
    initNavToggle();
  }
})();
