export function isMobileBrowser(browser = globalThis.navigator) {
  const userAgent = browser?.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && browser?.maxTouchPoints > 1);
}
