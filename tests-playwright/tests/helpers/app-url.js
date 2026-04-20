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
// If TEST_APP_URL is unset (CI or pre-config), APP_PATH defaults to '/' and
// the spec should be skipping anyway.

const url = process.env.TEST_APP_URL;

let APP_PATH = '/';
if (url) {
  const parsed = new URL(url);
  APP_PATH = (parsed.pathname || '/') + (parsed.search || '');
}

module.exports = { APP_PATH };
