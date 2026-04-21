/**
 * Fixture lookup helper for Playwright tests.
 *
 * Maps semantic block "roles" (e.g. 'mon-current', 'fri-upcoming') to the
 * actual block rows in the test database. Block IDs are NOT stable across
 * reseeds (see migration 09) so specs must never hardcode them — use this
 * helper instead.
 *
 * Usage:
 *   const { getBlockByRole, getBlocksByRoles } = require('./helpers/fixture-lookup');
 *   const block = await getBlockByRole('mon-current');
 *   const many  = await getBlocksByRoles(['mon-current', 'fri-upcoming']);
 *
 * On fixture drift (missing/duplicate roles), a FixtureDriftError is thrown
 * with guidance to re-run `npm run seed`.
 */

const { sb } = require('./supabase');

// Valid role names — any other value passed to getBlockByRole() throws.
const VALID_ROLES = Object.freeze([
  'mon-past',
  'mon-current',
  'mon-upcoming',
  'mon-full',
  'wed-past',
  'wed-upcoming',
  'fri-old-past',
  'fri-recent-past',
  'fri-upcoming',
]);

// In-memory cache: populated on first call, reused for rest of test run.
let cache = null;

class FixtureDriftError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FixtureDriftError';
  }
}

/**
 * Fetches all blocks from the test DB and maps them to roles based on the
 * deterministic criteria agreed in the Session 10 mockup.
 *
 * One-class-at-a-time logic keeps the role assignment readable and makes
 * duplicate detection easy — if any class has an unexpected number of rows
 * in a given state, we throw rather than guess.
 */
async function loadFixture() {
  const { data, error } = await sb
    .from('blocks')
    .select('id, class_id, status, start_date, end_date, cap, booked')
    .order('class_id', { ascending: true })
    .order('start_date', { ascending: true });

  if (error) {
    throw new FixtureDriftError(
      `Failed to query blocks from test DB: ${error.message}. ` +
      `Check TEST_SUPABASE_URL and TEST_SUPABASE_ANON_KEY in .env.test.`
    );
  }

  if (!data || data.length === 0) {
    throw new FixtureDriftError(
      'Test DB has no blocks. Run `npm run seed` to rebuild the test fixture.'
    );
  }

  const roleMap = {};

  // --- Class 1: Mon Mixed ---
  // Expected: 1 completed (mon-past), 1 active (mon-current),
  //           1 upcoming with cap>2 (mon-upcoming), 1 upcoming with cap=2 (mon-full)
  const c1 = data.filter(b => b.class_id === 1);
  assignSingle(roleMap, 'mon-past',     c1.filter(b => b.status === 'completed'));
  assignSingle(roleMap, 'mon-current',  c1.filter(b => b.status === 'active'));
  assignSingle(roleMap, 'mon-upcoming', c1.filter(b => b.status === 'upcoming' && b.cap > 2));
  assignSingle(roleMap, 'mon-full',     c1.filter(b => b.status === 'upcoming' && b.cap === 2));

  // --- Class 2: Wed Beginner ---
  // Expected: 1 completed (wed-past), 1 upcoming (wed-upcoming)
  const c2 = data.filter(b => b.class_id === 2);
  assignSingle(roleMap, 'wed-past',     c2.filter(b => b.status === 'completed'));
  assignSingle(roleMap, 'wed-upcoming', c2.filter(b => b.status === 'upcoming'));

  // --- Class 3: Fri Intermediate ---
  // Expected: 2 completed (fri-old-past = earliest end, fri-recent-past = latest end),
  //           1 upcoming (fri-upcoming)
  const c3 = data.filter(b => b.class_id === 3);
  const c3Completed = c3.filter(b => b.status === 'completed')
    .sort((a, b) => a.end_date.localeCompare(b.end_date));
  if (c3Completed.length !== 2) {
    throw new FixtureDriftError(
      `Expected 2 completed blocks for class 3 (Fri), found ${c3Completed.length}. ` +
      `Run \`npm run seed\` to rebuild the test fixture.`
    );
  }
  roleMap['fri-old-past']    = c3Completed[0];
  roleMap['fri-recent-past'] = c3Completed[1];
  assignSingle(roleMap, 'fri-upcoming', c3.filter(b => b.status === 'upcoming'));

  // Final sanity check — every valid role must have been assigned.
  for (const role of VALID_ROLES) {
    if (!roleMap[role]) {
      throw new FixtureDriftError(
        `Role "${role}" could not be matched to any block. ` +
        `Run \`npm run seed\` to rebuild the test fixture.`
      );
    }
  }

  return roleMap;
}

/** Helper: expect exactly one match for a role, else throw with guidance. */
function assignSingle(roleMap, role, matches) {
  if (matches.length === 0) {
    throw new FixtureDriftError(
      `Role "${role}" not found in test DB. ` +
      `Run \`npm run seed\` to rebuild the test fixture.`
    );
  }
  if (matches.length > 1) {
    const ids = matches.map(m => m.id).join(', ');
    throw new FixtureDriftError(
      `Role "${role}" matched multiple blocks (IDs: ${ids}). ` +
      `The test fixture is in an unexpected state — inspect the blocks table ` +
      `or run \`npm run seed\` to rebuild.`
    );
  }
  roleMap[role] = matches[0];
}

/**
 * Returns the block row for a given role.
 * Loads the fixture on first call, then serves from cache.
 */
async function getBlockByRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(
      `Unknown fixture role "${role}". Valid roles: ${VALID_ROLES.join(', ')}`
    );
  }
  if (!cache) {
    cache = await loadFixture();
  }
  return cache[role];
}

/**
 * Returns an object keyed by role for a batch of roles.
 * Efficient — still only one DB query for the whole test run.
 */
async function getBlocksByRoles(roles) {
  if (!Array.isArray(roles)) {
    throw new Error('getBlocksByRoles expects an array of role strings.');
  }
  const result = {};
  for (const role of roles) {
    result[role] = await getBlockByRole(role);
  }
  return result;
}

/** Clears the cache — useful if a spec deliberately reseeds mid-run. */
function clearFixtureCache() {
  cache = null;
}

module.exports = {
  getBlockByRole,
  getBlocksByRoles,
  clearFixtureCache,
  FixtureDriftError,
  VALID_ROLES,
};
