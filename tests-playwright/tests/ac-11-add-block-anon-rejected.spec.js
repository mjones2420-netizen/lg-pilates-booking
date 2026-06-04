// AC-11 — Add block rejected when not logged in
// Confirms the admin_insert_blocks RLS policy blocks anon inserts on the blocks table.
// Uses direct pg with SET LOCAL ROLE anon.
// No UI interaction needed — pure DB-layer assertion.

const { test, expect } = require('@playwright/test');

test.describe('AC-11 — Add block rejected when not logged in', () => {

  test('anon INSERT on blocks is rejected by RLS', async () => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    const client = await pool.connect();

    let error = null;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL ROLE anon");
      await client.query(`
        INSERT INTO blocks (class_id, start_date, end_date, weeks, dates, price, cap, booked, visible, status)
        VALUES (1, '2030-01-06', '2030-02-10', 6, ARRAY['6 Jan','13 Jan','20 Jan','27 Jan','3 Feb','10 Feb'], 60, 12, 0, true, 'upcoming')
      `);
      await client.query('ROLLBACK');
    } catch (err) {
      error = err;
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }

    expect(error, 'Expected RLS to reject anon INSERT on blocks').not.toBeNull();
    expect(error.code).toBe('42501');
  });

});
