(function () {
  try {
    var savedTheme = localStorage.getItem('wg_theme');
    if (savedTheme !== 'light' && savedTheme !== 'dark') {
      savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.style.colorScheme = savedTheme;
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', savedTheme === 'dark' ? '#111418' : '#FD267A');
  } catch (err) {
    // localStorage can be unavailable in private mode.
  }
})();
