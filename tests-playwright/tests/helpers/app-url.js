// tests/helpers/app-url.js
//
// Derives the path+query to use with page.goto() from TEST_APP_URL.
//
// WHY THIS EXISTS:
// Playwright's baseURL strips the query string when page.goto('/') is called —
// so if TEST_APP_URL is "http://localhost:8000/?env=test", page.goto('/')
// actually loads "http://localhost:8000/" WITHOUT the env switch. That causes
// the app to default to PRODUCTION Supabase, which is disastrous for tests.
//
// The fix: baseURL in playwright.config.js is set to just the origin
// (http://localhost:8000). Specs call page.goto(APP_PATH) instead of '/',
// and APP_PATH is "/?env=test" when the test URL includes that query.
//
// APP_PATH includes ?noemail=1 so test runs do not fire real Edge Function
// calls and generate noise in the Resend dashboard log.
// APP_PATH_EMAIL omits that flag — used only by SE-12 which intercepts the
// call via page.route() to assert the email wiring without reaching Resend.
//
// If TEST_APP_URL is unset (CI or pre-config), APP_PATH defaults to '/' and
// the spec should be skipping anyway.

const url = process.env.TEST_APP_URL;

let APP_PATH = '/';
let APP_PATH_EMAIL = '/';
if (url) {
  const parsed = new URL(url);
  const base = (parsed.pathname || '/') + (parsed.search || '');
  // All specs use APP_PATH — noemail=1 suppresses the email Edge Function call
  // so test runs don't generate noise in the Resend dashboard log.
  APP_PATH = base + (base.includes('?') ? '&' : '?') + 'noemail=1';
  // SE-12 uses APP_PATH_EMAIL — no suppression flag, so the intercept can fire.
  APP_PATH_EMAIL = base;
}

module.exports = { APP_PATH, APP_PATH_EMAIL };
