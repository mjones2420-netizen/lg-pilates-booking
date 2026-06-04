// AC-10 — Edit class rejected when not logged in
// Confirms the admin_update_classes RLS policy blocks anon UPDATEs on the classes table.
// Uses direct pg with SET LOCAL ROLE anon.
// No UI interaction needed — pure DB-layer assertion.

const { test, expect } = require('@playwright/test');

test.describe('AC-10 — Edit class rejected when not logged in', () => {

  test('anon UPDATE on classes is rejected by RLS', async () => {
    const { getPool } = require('./helpers/admin-db');
    const pool = getPool();
    const client = await pool.connect();

    let error = null;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL ROLE anon");
      // Attempt to update class_id=1 (mon-current fixture class) — safe target
      await client.query(`
        UPDATE classes SET name = 'AC10 Tampered Name' WHERE id = 1
      `);
      await client.query('ROLLBACK');
    } catch (err) {
      error = err;
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }

    expect(error, 'Expected RLS to reject anon UPDATE on classes').not.toBeNull();
    expect(error.code).toBe('42501');
  });

});
