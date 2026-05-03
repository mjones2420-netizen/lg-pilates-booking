#!/usr/bin/env node
/**
 * scripts/seed.js
 *
 * Reseeds the lg-pilates-test Supabase project by re-applying
 * migrations/09_reseed_with_dynamic_dates.sql against the test database.
 *
 * Usage:
 *   npm run seed             # prompts for confirmation
 *   npm run seed -- --yes    # skips prompt (for CI)
 *
 * Safety:
 *   - Refuses to run if the DB URL or project ID matches production.
 *   - Runs the entire migration in a single transaction — all-or-nothing.
 *   - Verifies the resulting fixture before exiting.
 *
 * Requires in .env.test:
 *   TEST_SUPABASE_PROJECT_ID   (must NOT equal production)
 *   TEST_SUPABASE_DB_URL       (direct Postgres connection string for test DB)
 */

require('dotenv').config({ path: '.env.test' });

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Client } = require('pg');

// --- Constants ----------------------------------------------------------
const PRODUCTION_PROJECT_ID = 'mrlooyixnlxzcfmvnqme';
// Migrations are applied in order inside a single transaction. Migration 09
// is the base fixture (3 classes, 9 blocks, 7 bookings). Migration 11 adds
// the Thursday class with active + locked-window blocks for PB-01.
const MIGRATION_FILES = [
  path.join(__dirname, '..', 'migrations', '09_reseed_with_dynamic_dates.sql'),
  path.join(__dirname, '..', 'migrations', '11_add_locked_window_class.sql'),
];

// Expected fixture shape after a successful reseed.
// Block + class counts include Migration 11 (Thursday class with active +
// locked-window blocks) on top of Migration 09's 9 blocks across 3 classes.
const EXPECTED = {
  blocks: 11,
  classes: 4,
  customers: 3,
  bookings: 7,
  priority_grants: 1,
};

// --- Helpers ------------------------------------------------------------
function log(line) { console.log(line); }
function die(line) { console.error(`\n❌ ${line}\n`); process.exit(1); }

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// --- Safety checks ------------------------------------------------------
function runSafetyChecks() {
  const projectId = process.env.TEST_SUPABASE_PROJECT_ID;
  const dbUrl     = process.env.TEST_SUPABASE_DB_URL;

  if (!projectId) {
    die('TEST_SUPABASE_PROJECT_ID is not set in .env.test');
  }
  if (projectId === PRODUCTION_PROJECT_ID) {
    die(`TEST_SUPABASE_PROJECT_ID is set to PRODUCTION (${PRODUCTION_PROJECT_ID}). Aborting.`);
  }
  if (!dbUrl) {
    die('TEST_SUPABASE_DB_URL is not set in .env.test. Grab the connection string from Supabase dashboard → Project Settings → Database.');
  }
  if (dbUrl.includes(PRODUCTION_PROJECT_ID)) {
    die(`TEST_SUPABASE_DB_URL references the PRODUCTION project. Aborting.`);
  }
  log('✅ Safety checks passed (not production)');
  return { projectId, dbUrl };
}

// --- Migration & verification ------------------------------------------
async function runMigrations(client) {
  for (const file of MIGRATION_FILES) {
    if (!fs.existsSync(file)) {
      die(`Migration file not found: ${file}`);
    }
  }

  await client.query('BEGIN');
  try {
    for (const file of MIGRATION_FILES) {
      const sql = fs.readFileSync(file, 'utf8');
      await client.query(sql);
      log(`   applied ${path.basename(file)}`);
    }
    await client.query('COMMIT');
    log('✅ Migrations applied');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    die(`Migration failed (rolled back): ${err.message}`);
  }
}

async function verifyFixture(client) {
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM blocks)                   AS blocks,
      (SELECT COUNT(*) FROM classes)                  AS classes,
      (SELECT COUNT(*) FROM customers)                AS customers,
      (SELECT COUNT(*) FROM bookings)                 AS bookings,
      (SELECT COUNT(*) FROM customer_class_priority)  AS priority_grants
  `);
  const actual = rows[0];

  const mismatches = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const got = Number(actual[key]);
    if (got !== expected) mismatches.push(`${key}: expected ${expected}, got ${got}`);
  }

  if (mismatches.length > 0) {
    die(`Verification FAILED:\n   - ${mismatches.join('\n   - ')}`);
  }

  log(`✅ Verification: ${actual.blocks} blocks, ${actual.classes} classes, ${actual.customers} customers, ${actual.bookings} bookings, ${actual.priority_grants} priority grant`);
}

// --- Main ---------------------------------------------------------------
(async () => {
  log('🌱 Reseeding lg-pilates-test Supabase project...');

  const { projectId, dbUrl } = runSafetyChecks();
  log(`   Project: ${projectId}`);
  log(`   Migrations: ${MIGRATION_FILES.map(f => path.basename(f)).join(', ')}\n`);

  // Confirmation prompt (skipped with --yes or in non-TTY CI env)
  const skipConfirm = process.argv.includes('--yes') || !process.stdin.isTTY;
  if (!skipConfirm) {
    const answer = await confirm('This will WIPE and rebuild test fixture data. Type "yes" to continue: ');
    if (answer !== 'yes') {
      log('\nAborted. No changes made.');
      process.exit(0);
    }
    log('');
  }

  // SSL is required for Supabase pooler connections. rejectUnauthorized: false
  // is standard for Supabase CLI + pooler usage — the connection is still TLS
  // encrypted; it just doesn't verify the cert chain, which Supabase's pooler
  // cert doesn't expose cleanly.
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    log('✅ Connected to test DB');

    await runMigrations(client);
    await verifyFixture(client);

    log('\n🌱 Seed complete.\n');
  } catch (err) {
    die(`Unexpected error: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
})();
