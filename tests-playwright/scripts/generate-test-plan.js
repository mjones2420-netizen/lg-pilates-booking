#!/usr/bin/env node
//
// generate-test-plan.js — regenerates TEST-PLAN.md from the live Playwright suite.
//
// Run after adding or removing tests:
//   npm run test-plan
//
// It lists every test via `playwright test --list --reporter=json`, groups them
// by suite prefix, and writes TEST-PLAN.md. The total is always the real test
// count, so it can never drift. Long-form history stays in TEST-PLAN-HISTORY.md
// (this script does not touch that file).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'TEST-PLAN.md');

// Suite label → spec-file prefix. Order here is the order in the doc.
const GROUPS = [
  ['Smoke', 'smoke'],
  ['Client Booking (CB)', 'cb'],
  ['Priority Booking (PB)', 'pb'],
  ['Booking Windows (BW)', 'bw'],
  ['Admin Bookings (AB)', 'ab'],
  ['Admin Classes (AC)', 'ac'],
  ['Admin Clients (ACL)', 'acl'],
  ['Schedule Display (SD)', 'sd'],
  ['Settings & Export (SE)', 'se'],
  ['Edge Cases (EC)', 'ec'],
  ['Block Warnings (BLW)', 'blw'],
  ['Security (SEC)', 'sec'],
  ['Stripe (ST)', 'st'],
  ['Refund Sync (RF)', 'rf'],
];

function getRows() {
  // globalSetup (safety-check) prints non-JSON lines before the JSON body — strip them.
  const raw = execSync('npx playwright test --list --reporter=json', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const json = raw.slice(raw.indexOf('{'));
  const data = JSON.parse(json);
  const rows = [];
  (function walk(suite) {
    (suite.suites || []).forEach(walk);
    (suite.specs || []).forEach(sp => rows.push({ file: sp.file.replace(/^tests\//, ''), title: sp.title }));
  })({ suites: data.suites || [] });
  return rows;
}

function build(rows) {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  let body = '';
  let grand = 0;
  const usedFiles = new Set();

  GROUPS.forEach(([label, pref]) => {
    const g = rows
      .filter(r => r.file.startsWith(pref + '-'))
      .sort((a, b) => a.file.localeCompare(b.file));
    if (!g.length) return;
    g.forEach(r => usedFiles.add(r.file));
    grand += g.length;
    body += `## ${label} — ${g.length} tests\n\n| Spec file | Test |\n|---|---|\n`;
    g.forEach(r => {
      body += `| \`${r.file}\` | ${r.title.replace(/\|/g, '\\|')} |\n`;
    });
    body += '\n';
  });

  // Safety net: if a new prefix is added that isn't in GROUPS, fail loudly
  // rather than silently dropping tests from the doc.
  const orphans = rows.filter(r => !usedFiles.has(r.file));
  if (orphans.length) {
    const prefixes = [...new Set(orphans.map(r => r.file.split('-')[0]))];
    throw new Error(
      `Tests not covered by any suite group: ${orphans.length} test(s) in prefixes [${prefixes.join(', ')}]. ` +
      `Add the prefix to GROUPS in scripts/generate-test-plan.js.`
    );
  }

  const header =
`# LG Pilates Booking System — Test Plan

**Last updated:** ${today}
**Total tests:** ${grand}
**Test framework:** Playwright
**Test database:** \`lg-pilates-test\` (Supabase project \`ngzfhamjuviwfwuncrjo\`)

This document is generated from the live suite — do not edit by hand. Regenerate
after adding or removing tests:

\`\`\`bash
cd tests-playwright
npm run test-plan
\`\`\`

The full suite reseeds the test database automatically before running:

\`\`\`bash
cd tests-playwright
npm test                 # full suite
npm run test:ui          # interactive UI runner — step through any test
npx playwright show-report   # video, trace and screenshots after a run
\`\`\`

> Historical detail — the old Excel scenario tables, per-tab coverage tracker,
> build batches, and long-form per-test write-ups — now lives in
> \`TEST-PLAN-HISTORY.md\`.

---

`;

  const fixtures =
`---

## Fixture roles (the seeded test data)

Every test runs against pre-seeded blocks across 4 classes. Roles are stable,
block IDs are not — tests look up blocks by role, never by hardcoded ID
(\`getBlockByRole(role)\` in \`helpers/fixture-lookup.js\`).

| Role | Class | State | Purpose |
|---|---|---|---|
| \`mon-past\` | Mon Mixed Ability | Completed | Historical record; priority-source for returning customers |
| \`mon-current\` | Mon Mixed Ability | Active (mid-run) | Bookable current block; new-client happy paths |
| \`mon-upcoming\` | Mon Mixed Ability | Upcoming (~13 days out) | Priority-window testing |
| \`mon-full\` | Mon Mixed Ability | Upcoming, cap=2, fully booked | Capacity-limit testing |
| \`wed-past\` | Wed Beginner | Completed | Priority-source for Wed customers |
| \`wed-upcoming\` | Wed Beginner | Upcoming (~8 days out) | Priority-window + manual priority grant |
| \`thu-current\` | Thu Mixed Ability | Active (mid-run) | Anchor for the Thursday card so a nextBlk panel renders |
| \`thu-locked\` | Thu Mixed Ability | Upcoming (~30 days out) | Locked-window UI testing (PB-01) |
| \`fri-old-past\` | Fri Intermediate | Completed (older) | Historical record |
| \`fri-recent-past\` | Fri Intermediate | Just completed | Priority-source for Fri customers |
| \`fri-upcoming\` | Fri Intermediate | Upcoming (~3 days out) | Standard-window testing |

**Seeded customers:**
- \`returning-one@test.example\` — confirmed on Mon past, Mon current, Wed past; manual priority on Wed class
- \`returning-two@test.example\` — confirmed on Mon past, Fri recent past, Mon full
- \`admin-dummy@test.example\` — confirmed on Mon full (to fill cap-2)
`;

  return { content: header + body + fixtures, grand };
}

const rows = getRows();
const { content, grand } = build(rows);
fs.writeFileSync(OUT, content);
console.log(`TEST-PLAN.md regenerated — ${grand} tests across ${new Set(rows.map(r => r.file)).size} spec files.`);
