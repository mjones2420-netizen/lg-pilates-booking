// AC-09 — Add class rejected when not logged in
// Confirms the admin_insert_classes RLS policy blocks anon inserts on the classes table.
// Uses direct pg (bypasses PostgREST) to SET ROLE anon and attempt an INSERT.
// No UI interaction needed — this is a pure DB-layer assertion.

const { test, expect } = require('@playwright/test');

test.describe('AC-09 — Add class rejected when not logged in', () => {

  test('anon INSERT on classes is rejected by RLS', async () => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    const client = await pool.connect();

    let error = null;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL ROLE anon");
      await client.query(`
        INSERT INTO classes (name, level, day, time, end_time, venue, loc)
        VALUES ('AC09 Test Class', 'Mixed Ability', 'Monday', '9:00am', '9:45am', 'Test Venue', 'Test Loc')
      `);
      await client.query('ROLLBACK');
    } catch (err) {
      error = err;
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }

    expect(error, 'Expected RLS to reject anon INSERT on classes').not.toBeNull();
    // PostgreSQL error 42501 = insufficient_privilege (RLS rejection)
    expect(error.code).toBe('42501');
  });

});
