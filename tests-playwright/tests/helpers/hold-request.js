// holdRequest — hold one Supabase REST query in the browser until the test
// releases it, to open a page "before the data has loaded" on purpose (#112).
//
// Matches GET /rest/v1/<table> whose select= starts with `selectPrefix`, so
// only that one query is held. If the app's select string changes, the first
// "still loading" assertion in the spec fails, rather than the hold silently
// matching nothing.

async function holdRequest(page, table, selectPrefix) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const matches = (url) =>
    url.pathname.endsWith(`/rest/v1/${table}`) &&
    (url.searchParams.get('select') || '').startsWith(selectPrefix);
  await page.route(matches, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

module.exports = { holdRequest };
