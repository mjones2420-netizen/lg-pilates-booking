// tests/ec-14-not-null-constraints.spec.js
//
// EC (Edge Cases) — EC-14: DB refuses rows with NULL on critical columns
//
// Excel scenario EC-14: "DB refuses rows with NULL on critical columns"
//   Given: Tables with NOT NULL constraints on critical columns
//   When:  An INSERT omits a required column (or explicitly sets it to NULL)
//   Then:  - INSERT fails with SQLSTATE 23502 (not_null_violation)
//          - Error message names the violated column
//          - No row inserted
//
// Mechanism:
//   Postgres NOT NULL constraints on 10 critical columns:
//     customers.email
//     bookings.customer_id, bookings.class_id, bookings.block_id
//     blocks.class_id, blocks.start_date, blocks.end_date
//     classes.name, classes.day, classes.venue
//
//   Any INSERT that doesn't supply a value for these columns fails at the
//   DB level with code 23502 BEFORE the row is written.
//
// Test approach:
//   Pure DB test — three sub-tests via separate test() blocks for clarity
//   on which constraint fails when one of them regresses.
//   For each: attempt the INSERT via direct pg, assert the error code is
//   '23502', and (where possible) assert the error column name.
//
//   The Excel scenario lists 3 example INSERTs covering the 3 tables
//   (customers, classes, blocks). We mirror exactly those 3.
//
// Cleanup (afterEach):
//   None needed — all INSERTs are rejected, no state written.

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { getPool } = require('./helpers/admin-db');

const APP_URL = process.env.TEST_APP_URL;

test.describe('EC-14 — NOT NULL constraints enforced on critical columns', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — EC specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('customers.email NOT NULL: INSERT without email fails with 23502', async () => {
    let caught = null;
    try {
      await getPool().query(
        `INSERT INTO customers (first_name, last_name) VALUES ($1, $2)`,
        ['Test', 'User']
      );
    } catch (err) {
      caught = err;
    }
    expect(caught, 'INSERT without email should have raised').toBeTruthy();
    expect(caught.code, 'SQLSTATE should be 23502 (not_null_violation)').toBe('23502');
    expect(caught.column, 'violated column should be "email"').toBe('email');
  });

  test('classes.name NOT NULL: INSERT without name fails with 23502', async () => {
    let caught = null;
    try {
      await getPool().query(
        `INSERT INTO classes (day, venue) VALUES ($1, $2)`,
        ['Mon', 'Test Venue']
      );
    } catch (err) {
      caught = err;
    }
    expect(caught, 'INSERT without name should have raised').toBeTruthy();
    expect(caught.code, 'SQLSTATE should be 23502 (not_null_violation)').toBe('23502');
    expect(caught.column, 'violated column should be "name"').toBe('name');
  });

  test('blocks.class_id NOT NULL: INSERT with NULL class_id fails with 23502', async () => {
    let caught = null;
    try {
      await getPool().query(
        `INSERT INTO blocks (class_id, weeks) VALUES ($1, $2)`,
        [null, 6]
      );
    } catch (err) {
      caught = err;
    }
    expect(caught, 'INSERT with NULL class_id should have raised').toBeTruthy();
    expect(caught.code, 'SQLSTATE should be 23502 (not_null_violation)').toBe('23502');
    expect(caught.column, 'violated column should be "class_id"').toBe('class_id');
  });
});
