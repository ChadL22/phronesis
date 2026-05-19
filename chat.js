// ═══════════════════════════════════════════════════════════════
// NAV MENU TOGGLE
// ═══════════════════════════════════════════════════════════════
(function() {
  const navT = document.getElementById('nav-toggle');
  const navM = document.getElementById('nav-menu');

  if (!navT || !navM) return;

  // Toggle menu when button clicked
  navT.addEventListener('click', (e) => {
    e.stopPropagation();
    navT.classList.toggle('is-open');
    navM.classList.toggle('is-open');
  });

  // Close menu when clicking outside
  document.addEventListener('click', () => {
    navT.classList.remove('is-open');
    navM.classList.remove('is-open');
  });

  // Close menu when any link is clicked
  navM.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navT.classList.remove('is-open');
      navM.classList.remove('is-open');
    });
  });
})();
