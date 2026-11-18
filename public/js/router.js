// History API router for the single page app.
let routes = [];
let renderer = null;
let activeCleanup = null;
let activeMatch = null;
let started = false;

function compile(pattern) {
  if (pattern === '/') return { regex: /^\/$/, keys: [] };
  const keys = [];
  const source = pattern
    .replace(/\/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return '/([^/]+)';
    })
    .replace(/\/+$/, '');
  return { regex: new RegExp(`^${source}/?$`), keys };
}

export function defineRoutes(list) {
  routes = list.map((route) => ({ ...route, ...compile(route.path) }));
}

export function setRenderer(fn) {
  renderer = fn;
}

export function matchPath(pathname) {
  for (const route of routes) {
    const result = route.regex.exec(pathname);
    if (!result) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(result[index + 1] || '');
    });
    return { route, params };
  }
  return null;
}

export function parseLocation(pathname = window.location.pathname + window.location.search) {
  const url = new URL(pathname, window.location.origin);
  const query = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return { pathname: url.pathname, query };
}

export function currentMatch() {
  return activeMatch;
}

async function handle() {
  const { pathname, query } = parseLocation();
  const matched = matchPath(pathname);

  if (activeCleanup) {
    try {
      activeCleanup();
    } catch (err) {
      console.error('cleanup failed', err);
    }
    activeCleanup = null;
  }

  activeMatch = matched
    ? { ...matched, query, pathname }
    : { route: { path: pathname, notFound: true }, params: {}, query, pathname };

  if (renderer) {
    try {
      const result = await renderer(activeMatch);
      if (result && typeof result === 'object' && result.cleanup) activeCleanup = result.cleanup;
    } catch (err) {
      console.error('render failed', err);
    }
  }
  window.dispatchEvent(new CustomEvent('uni:navigated', { detail: activeMatch }));
}

export function navigate(path, options = {}) {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (options.replace) window.history.replaceState({}, '', target);
  else window.history.pushState({}, '', target);
  handle();
}

export function reload() {
  handle();
}

function onLinkClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) return;
  if (link.target && link.target !== '_self') return;
  if (link.hasAttribute('download')) return;
  event.preventDefault();
  if (href === window.location.pathname + window.location.search) return;
  navigate(href);
}

export function startRouter() {
  if (started) return;
  started = true;
  window.addEventListener('popstate', handle);
  document.addEventListener('click', onLinkClick);
  handle();
}
