// localStorage throws in third-party iframes and in private mode, so preference
// reads and writes must never break the page.
export function storageGet(key, fallback = null) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // Preferences simply stay in memory for this session.
  }
}
