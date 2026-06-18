---
name: playwright-batch-workflow
description: >
  Mark's personal workflow for writing batches of Playwright tests for the LG Pilates booking system. Apply this skill whenever Mark wants to write, expand, or work on a batch of automated tests — including any mention of "Batch [N]", "next batch", "continue with batch", "write CB-XX tests", "write AB-XX tests", "write PB-XX tests", "add Playwright tests", or any general intent to expand Playwright coverage for the booking system. This skill governs the full session rhythm including session-start checks, scope confirmation, pre-flight selector verification, 1:1 spec mapping, established CB/AB/PB patterns, mandatory TEST-PLAN.md updates, Coverage Tracker maintenance, and end-of-batch verification. Always load this skill alongside the lgpilates-booking-system skill when Playwright work is requested. Do NOT apply this skill to one-off bug fixes, manual testing, or unrelated coding work.
---

# Playwright Batch Workflow Skill — Mark's Personal Setup

## Context

Mark and Claude are working through ~169 test scenarios across multiple tabs (CB, AB, PB, Booking Windows, Edge Cases, etc.) of `LG-Pilates-Test-Scenarios.xlsx`. Coverage is built up in batches, grouped by shared scaffold (e.g. "Batch 1 — quick wins on new-client scaffold", "Batch 2 — T&Cs checkbox").

The recurring rhythm of writing a batch needs to be consistent across sessions so:
- Mark can trust the conventions don't drift
- Existing tests stay maintainable as new ones land
- TEST-PLAN.md and the Coverage Tracker stay accurate
- Nothing gets accidentally skipped

This skill is the playbook. It assumes context.txt has already been read and the lgpilates-booking-system skill is loaded.

---

## STEP 0 — Session-start checks (MANDATORY at start of every session)

Two checks must be run before any test work, regardless of whether the session looks test-related or not. These are also documented in context.txt under WORKFLOW FOR NEW CHAT SESSIONS.

**Check A: Confirm index.html is present**
- Verify Mark uploaded a fresh copy at session start
- Note line count (~2,885 lines post-Session 11)
- Copy to `/home/claude/index.html` as the working file

**Check B: Test DB fixture freshness**
- Run the drift check query against `ngzfhamjuviwfwuncrjo`:

```sql
SELECT
  COUNT(*) FILTER (WHERE status='active'
                   AND start_date <= CURRENT_DATE
                   AND end_date   >= CURRENT_DATE) AS active_ok,
  COUNT(*) FILTER (WHERE status='completed'
                   AND end_date < CURRENT_DATE)    AS past_ok,
  COUNT(*) FILTER (WHERE status='upcoming'
                   AND (start_date - CURRENT_DATE) BETWEEN 0 AND 7)  AS standard_window,
  COUNT(*) FILTER (WHERE status='upcoming'
                   AND (start_date - CURRENT_DATE) BETWEEN 8 AND 14) AS priority_window,
  COUNT(*) FILTER (WHERE status='upcoming'
                   AND (start_date - CURRENT_DATE) >= 15)            AS locked_window
FROM blocks;
```

- Healthy: `active_ok >= 1`, `past_ok >= 1`, at least 2 of (standard_window, priority_window, locked_window) >= 1
- If drift detected, remind Mark to run `npm run seed` before any test work — do not block the session over it

**Check C: Confirm helper files are in context**

When Playwright work is on the agenda, the test helper files are needed to verify function signatures before writing specs. Don't wait until pre-flight to discover one is missing — flag at session start.

At the top of the opening response (alongside Checks A and B), list which of these helpers are in context and which are not:

- `tests/helpers/booking-flow.js`
- `tests/helpers/fixture-lookup.js`
- `tests/helpers/app-url.js`
- `tests/helpers/supabase.js`

If any are missing, ask Mark to upload them before scope confirmation. Wording template:

> "I have [X] of the 4 test helpers in context. Could you upload [missing files] before we start? It avoids guessing at function signatures and saves a wrong-first-draft."

This is preventive, not blocking — if Mark prefers to skip and proceed, accept that and rely on Step 2a to catch issues. But the default is: ask now, not later. Session 13 produced a wrong CB-14 first draft because `openBookingModal`'s signature was guessed wrong; uploading `booking-flow.js` at session start would have prevented it.

Report results as a single line near the top of the opening response. Do not explain the checks at length unless something fails.

---

## STEP 1 — Confirm scope (HARD GATE)

Before writing any code, lock down which scenarios are being automated this session. Do not assume — even if Mark says "carry on with the next batch", confirm exactly which scenario numbers are in scope.

**HARD GATE — present the batch and wait for confirmation:**

> "Batch [N] is [scenario list]. That's [count] tests. Anything to add or remove before I start?"

Do not proceed to Step 2 until Mark explicitly confirms.

If TEST-PLAN.md isn't in context, read it from `~/dev/lg-pilates-booking/tests-playwright/TEST-PLAN.md` (or ask Mark to upload). The Coverage Tracker at the top is the authoritative view of outstanding scenarios.

---

## STEP 2 — Pre-flight (MANDATORY before writing specs)

Before producing any spec code, verify the building blocks:

**2a. Confirm helpers are in context.** Check C in Step 0 should already have surfaced any missing helpers. Verify the following are in context before writing any spec:
- `tests/helpers/app-url.js` — exports `APP_PATH`
- `tests/helpers/booking-flow.js` — exports `openBookingModal(page, day, which)`, `fillStep1`, `fillStep2Medical`, `fillStep2Emergency`, `agreeAndReserve`, `uniqueTestEmail`, `DEFAULT_NEW_CLIENT`. Note that `openBookingModal` takes a day-name string (e.g. "Monday"), NOT a numeric class_id — common pitfall.
- `tests/helpers/fixture-lookup.js` — exports `getBlockByRole`, `getBlocksByRoles`, `clearFixtureCache`, `VALID_ROLES`
- `tests/helpers/supabase.js` — exports `sb` (NOT `supabase` — common pitfall)

If any are still missing at this point, stop and request them. Do not guess at function signatures — wrong-first-drafts cost time and erode trust in the workflow.

**2b. Confirm at least one existing CB/AB/PB spec is in context** so the new specs match the existing style. If no example is uploaded, request one (typically `cb-01-new-client-happy-path.spec.js`).

**2c. Scan index.html for the selectors and validation strings the batch will use.** Don't write `expect(toast).toContainText(/some text/i)` based on assumptions — grep the actual file for the validation strings, button labels, and IDs the tests will interact with. Common targets:
- `#validation-toast` — top-of-page validation summary toast (added via `showValidationToast()`)
- `#step-1`, `#step-2a`, `#step-2b`, `#step-3`, `#success-view` — step containers
- `#pip-1` to `#pip-4`, `#pip-lbl-1` to `#pip-lbl-4` — step indicator
- `#b-firstname`, `#b-lastname`, `#b-email`, `#b-phone` — Step 1 fields
- `#b-age`, `#b-print-name`, `#b-declaration`, `#b-health-conditions`, `#parq-yes-section` — Step 2a
- `#b-emergency-name`, `#b-emergency-relationship`, `#b-emergency-phone` — Step 2b
- `#tcs-agree`, `#reserve-btn`, `#m-reference`, `#m-name`, `#m-sub` — Step 3
- `#test-mode-banner` — env-switch indicator (Session 11+)
- `input[name="qN"][value="Yes"|"No"]` — PAR-Q radios (N = 1 to 12)

**2d. Confirm the planned spec file count and file naming.** Default to 1:1 mapping with Excel scenario numbers (e.g. CB-08 → `cb-08-tcs-disabled-by-default.spec.js`). Sub-cases in the same scenario go as separate `test()` blocks within the same file. Confirm with Mark before writing if more than one viable structure exists.

**2e. Scan for fixture-customer collisions (returning-client batches only).** If any spec in this batch will book a fixture customer onto a fixture block, search the existing test suite for collisions BEFORE writing. The `(customer, block)` pair must be unique across:

- All other CB specs in the suite (especially returning-client specs like CB-13, CB-31, CB-03)
- All smoke specs that assert "no booking exists for X" (these treat unbooked pairs as stable, and a new spec booking that pair will break them)

Practical scan: ask Mark to upload any returning-client specs already in the suite, plus `smoke-02-anon-rpcs.spec.js`, and grep them for the customer email and block role. If a collision is found, pick a different `(customer, block)` combination and document the rationale in the spec's header comment.

Session 15 hit this pitfall three times in one batch: CB-03 vs CB-32 (both wanted returning-two + mon-current), CB-13 vs CB-32 (both wanted returning-two + fri-upcoming), then smoke-02 vs CB-32 (smoke test was relying on returning-one + fri-upcoming being unbooked, which the eventual CB-32 fix booked). Each took a separate test run + debug cycle to surface. Doing the scan up front would have caught all three before any spec was written.

Related rule for smoke tests: any smoke test asserting "no booking exists for X" should use deliberately-fake IDs (e.g. 999999999), NOT real fixture pairs. If you spot a smoke test that violates this while doing the scan, flag it as a parallel fix.

---

## STEP 2.5 — Mid-batch scope discipline (HARD GATE — applies throughout the session)

This step exists because of recurring failure mode where Claude makes unilateral changes mid-batch instead of asking. The pattern: something unexpected comes up (a spec turns out to need a fixture change, a scenario turns out to be obsolete, a selector behaves differently than expected), and Claude decides to "just fix it" rather than stop and surface the finding. Resist this — every time.

**The rule:** if anything changes from the agreed batch scope at Step 1, STOP. Do not make the change. Surface the finding in two short lines and ask. The triggers for stopping include — but are not limited to:

- A spec needs deferring or skipping
- A fixture needs altering (new role, new seed data, new migration)
- An Excel scenario turns out to be obsolete or wrong
- A selector or validation string in the code doesn't match what the spec assumes
- A test reveals a bug in the app that wasn't part of the batch scope
- A spec needs to be split, merged, or renumbered
- The agreed customer/block pairing turns out to be unworkable

**The fact that the change seems obvious, small, or "the only sensible option" is not a reason to skip the ask.** Small unilateral changes are exactly the failure mode this step exists to prevent. The user's review is the safeguard, not Claude's judgement.

**Self-trigger phrases.** If Claude finds itself about to write any of the following — that is the cue to stop and ask, not to keep typing:

- "I'll just..."
- "Easiest thing is to..."
- "Let me also..."
- "While I'm at it..."
- "It makes sense to..."
- "I'll defer/skip/replace this for now..."

When triggered, the response template is:

> "Found a problem with [scope item]: [one-line description]. [One-line proposed fix]. Want me to go ahead, or take a different approach?"

That's it. Two lines. No preamble, no extended diagnostic, no narration of how the problem was discovered. If the user wants the reasoning they'll ask.

**Documentation files are locked until tests pass.** Do not update `TEST-PLAN.md`, `context.txt`, or the Excel scenarios sheet during a batch in progress. These files capture state, and updating them before the state is verified (i.e. tests pass green) is wasted work and creates rework when the plan changes mid-flight. The trigger for updating them is the user explicitly saying tests are green or asking for the update — not Claude inferring that the work is "done enough."

If a documentation update would clearly help — e.g. recording a fixture change for the next reseed — flag it ("Worth updating context.txt to reflect this when we wrap up?") and wait for the answer.

---

## STEP 3 — Write the specs

Each spec file follows the established CB-01 pattern. Do not deviate without flagging it first.

**Mandatory structure:**

```javascript
// tests/cb-XX-short-description.spec.js
//
// CB (Client Booking) — CB-XX: [one-line scenario summary].
//
// Excel scenario CB-XX: "[exact scenario title from Excel]"
//   Given: [precondition]
//   When:  [action]
//   Then:  [outcome]
//
// Fixture role: [role used]

const { test, expect } = require('@playwright/test');
const { APP_PATH } = require('./helpers/app-url');
const { /* helpers used */ } = require('./helpers/booking-flow');

const APP_URL = process.env.TEST_APP_URL;

test.describe('CB-XX — [scenario title]', () => {
  test.skip(!APP_URL, 'TEST_APP_URL not set — CB specs require the app to be served.');

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_PATH);
    await expect(page.getByText(/Monday|Wednesday|Friday/).first()).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('#test-mode-banner.on'),
      'TEST MODE banner is not visible — env switch is NOT active, aborting to protect production data'
    ).toBeVisible({ timeout: 5000 });
  });

  test('[lowercase summary of what the test does]', async ({ page }) => {
    // ... arrange / act / assert
  });
});
```

**Mandatory conventions:**

- **TEST MODE banner assertion** in every `beforeEach` — non-negotiable. It's the second line of defence against tests hitting production.
- **`uniqueTestEmail(N)`** with the scenario number for each test — never use a literal email or share emails across tests
- **Monday is the canonical bookable class** for new-client flows (use `mon-current` role). Wednesday is used for variety tests (e.g. CB-04). Friday and others have specific fixture purposes — see TEST-PLAN.md fixture roles table.
- **Use `getBlockByRole()` for any block lookup** — never hardcode block IDs (they regenerate on every reseed via migration 09)
- **`page.goto(APP_PATH)`** — never `page.goto('/')` (Playwright's baseURL strips the query string, breaking the env switch)
- **Wait for Step 2 with `{ timeout: 5000 }`** — the modal has a 2.5s setTimeout between Step 1 Continue and Step 2a appearing; default Playwright timeouts work but explicit is clearer
- **Phone numbers** — use the format `'07700900XXX'` where XXX is the scenario number, for traceability
- **Test names** in `test()` blocks — lowercase, descriptive, no scenario number prefix (the describe block already has it)

**Validation toast assertions:** the toast appears as `#validation-toast`, contains a `<ul>` of error messages. Use case-insensitive text matching:

```javascript
const toast = page.locator('#validation-toast');
await expect(toast).toBeVisible({ timeout: 3000 });
await expect(toast).toContainText(/exact text from goStep2 or goStep2b/i);
```

**Mobile viewport tests:** until a Mobile Safari project is added to `playwright.config.js`, use `await page.setViewportSize({ width: 480, height: 700 })` as a proxy AND add a `> Follow-up:` note in the matching TEST-PLAN.md entry pointing back to the mobile project follow-up in context.txt.

---

## STEP 4 — TEST-PLAN.md is updated IN THE SAME SESSION as the test change (NON-NEGOTIABLE)

This is the rule Mark explicitly captured in memory: TEST-PLAN.md must be updated in the same session as any new or substantially modified test. There are no exceptions.

The detailed structure of the TEST-PLAN.md updates lives in Step 4B.2 below — it's part of the broader end-of-batch documentation routine that also covers context.txt and (sometimes) the Excel scenarios sheet. Don't update TEST-PLAN.md piecemeal mid-batch — wait for tests to be green AND user sign-off, then run the full 4B routine in one go.

---

## STEP 4B — End-of-batch documentation routine (after tests are GREEN and user has signed off)

This is the canonical end-of-batch sequence Mark and Claude have settled on across many batches. It updates three files in a specific order, with specific structural changes in each. Do all three in the same session as the batch — do not let any drift to the next session.

**Trigger:** the user has explicitly confirmed the full test suite is passing (`N passed`) AND has signaled to proceed with documentation updates. Do not start this on Claude's own judgement.

**Order of updates (smallest first to keep momentum):**

1. Excel (`LG_Pilates_Test_Scenarios.xlsx`) — only if scenario wording changed during the batch
2. `TEST-PLAN.md` — Coverage Tracker, header, batch summary row, new detailed sections
3. `context.txt` — header date, helper exports, test count, repo layout, batches list, KEY DECISIONS

Each file is its own `present_files` deliverable. After all three are ready, produce the consolidated push command at the bottom.

---

### 4B.1 — Excel updates (only if scenario wording changed)

Touch the Excel only when something in the batch revealed that the canonical scenario text has drifted from reality. Common triggers:
- Excel SQL hint is wrong (e.g. invalid constraint value, wrong column name)
- Excel Steps refer to old UI states (e.g. 3-step flow when current is 4-step)
- Excel Expected Result references DB columns or behaviours that no longer exist
- A field's actual cap (e.g. maxlength=50) differs from what the scenario assumes

**Process:**
1. Read the current row via `openpyxl` and print what's there before touching it
2. Update only the columns that need it — never rewrite the whole row
3. Preserve existing styling: alternating row fills `FFFFFFFF` / `FFEEF5F5`, SQL column (5) uses `FFE8F0FE` pale-blue fill with Courier New 8pt, header style untouched
4. Save to `/home/claude/LG_Pilates_Test_Scenarios.xlsx` then copy to outputs

**Do NOT touch:**
- Red-filled rows (those are intentionally inactive duplicates)
- Header row, column widths, freeze panes
- Other tabs that the batch didn't visit

---

### 4B.2 — TEST-PLAN.md updates

Five distinct edits, in this order:

**(a) Header date and total tests:**
```markdown
**Last updated:** [today's date]
**Total tests:** [N] (14 smoke + 34 CB + 16 PB + 6 SD + 2 ACL + 3 BW + 6 SEC + [EC/AB/AC/etc] count)
```

**(b) Coverage Tracker summary row** — update the row for the tab this batch touched. Bump Automated up, Outstanding down. Then update the **Totals** row at the bottom.

**(c) Per-tab table** — flip each newly-automated scenario from `⬜ Outstanding` to `✅ [spec-filename].spec.js`. Format must match exactly:
```markdown
| EC-01 | Booking a full class is prevented | ✅ ec-01.spec.js | Batch 11 |
```

**(d) Suggested Batches table** — mark the batch complete with a detailed one-line summary of what each spec proved. Format:
```markdown
| Batch [N] ✅ | [Tab name] (part [X]) | [count] | [Detailed sentence-per-spec summary referring to specific mechanisms, helper additions, and any Excel updates made in the same session.] |
```

The summary should be substantive enough that future Claude can reconstruct what this batch did without opening the specs. Mention any new helpers, fixture changes, or notable mechanism findings.

**(e) Detailed scenario sections** — add a new block for each scenario, inserted after the last existing detailed section (typically below SEC-07 or wherever the previous batch ended). Format matches the established pattern:

```markdown
### [ID] — [Title matching test.describe block]

**What this proves:** [Plain English business reason — why this test matters to Louise/customers]

**Preconditions:**
- [What must be true in the test database]

**Mechanism note (if deviating from Excel):** [Only include if the spec works differently to the Excel scenario — explain the actual mechanism and reference the Excel update in 4B.1.]

**Steps the test performs:**
1. [Step 1]
2. [Step 2]
...

**What a fail would mean:**
[What would be broken in the real system, in plain English. Why Mark/Louise should care.]

**Cleanup:** [afterEach behaviour, OR "No DB state created — no afterEach cleanup is required."]

---
```

**(f) Outstanding totals + next session focus** — near the bottom of TEST-PLAN.md:
```markdown
**Outstanding totals:** [N] scenarios across [X] tabs ([today's date]).

**Next session focus:** Batch [N+1] — [name]. See the Suggested Batches table for full batch sequence.
```

---

### 4B.3 — context.txt updates

Six distinct edits. Take care with indentation — context.txt uses spaces and aligned columns in several places.

**(a) Header date:**
```
Last updated: [today's date]
```

**(b) Helper exports list (only if a new helper was added)** — update the admin-db.js / admin-auth.js / booking-flow.js block comment in the repo layout section to list any new exports, including the session number that added them:
```
│                            #          [newHelperName] ([S<N>]),
```

**(c) CURRENT TEST COUNT block** — update the headline number, the session/batch marker, and either:
- Bump an existing tab's line count (e.g. "EC: 6 → 13 tests"), or
- Add a new line for a tab whose first batch just landed (e.g. EC after Batch 11):
```
  EC:    6 tests covering 6 of 13 genuine EC scenarios (Batch 11 — EC-01,
         EC-03, EC-04, EC-05, EC-06, EC-07. EC-02 red-filled in Excel as
         duplicate of CB-31. Remaining 7 in Batch 12.)
```

**(d) Repo layout spec-file listing** — add or update the `xx-*.spec.js` line:
```
    └── ec-*.spec.js             # 6 EC spec files covering 6 of 13 genuine scenarios (Batch 11)
```

**(e) Completed suites + upcoming batches list:**
- Append a new `✅ Batch [N] (Session [N]) — ...` entry to the COMPLETED SUITES list with a detailed multi-line summary (similar level of detail to the TEST-PLAN.md Suggested Batches summary, but in prose form, and with explicit cross-references to any helpers added or Excel changes made)
- Remove the just-completed batch from the UPCOMING BATCHES list
- Update NEXT SESSION FOCUS to point at the next batch

**(f) KEY DECISIONS — append a "SESSION [N] LEARNINGS" block** at the end. Required content:
- A short title naming the 2-4 main learnings of the session
- One bullet per learning, no padding, focused on what would save time next session

Template:
```
SESSION [N] LEARNINGS — [SHORT TITLE LISTING MAIN TOPICS]
---------------------------------------------------------
- [Specific gotcha, mechanism finding, helper pitfall, or pattern. State
  the symptom, the cause, and the fix in compact prose. Reference the
  spec that surfaced it so future debugging can find context fast.]
- [Next learning — same compact style.]
- [...]

```

Only include genuine durable learnings — not session narrative. Rule of thumb: if it would save a future Claude/Mark session real time, include it. If it's a one-off bug fix or session play-by-play, leave it out.

---

### 4B.4 — Consolidated push command

After all three (or four, if a new helper was added) files are produced, supply a single push command block that includes only the files that actually changed. Order them logically:

```bash
cd ~/dev/lg-pilates-booking
git status
git add tests-playwright/tests/helpers/[helper].js \
        tests-playwright/tests/[ec-XX-...].spec.js \
        [...all new spec files...] \
        tests-playwright/TEST-PLAN.md \
        LG_Pilates_Test_Scenarios.xlsx \
        context.txt
git commit -m "Batch [N] complete — [Tab name] part [X] ([count] [tab-prefix] specs)"
git push
```

Remind Mark to confirm `git status` shows only the expected files before committing.

**Commit message format:** single-line title only. zsh-safe (no em-dashes, no backticks). Same rule as Step 7.

---

## STEP 5 — Self-review before presenting

Before producing output files, run a security & quality self-check on the new specs:

- **Security:** no real PII, all emails on `@test.example`, all DB writes go to test project only
- **Code review:** every spec has TEST MODE banner assertion, every spec uses `uniqueTestEmail(N)` with its own number, all selectors verified against index.html, all validation strings verified against the actual JS functions (goStep2, goStep2b, etc.)
- **Regression awareness:** no changes to existing helpers or specs, only additions
- **Error handling:** every spec has `test.skip()` guard for missing TEST_APP_URL

If any check fails, fix before presenting.

---

## STEP 6 — Present output

Produce these files in `/mnt/user-data/outputs/`:
- `tests/cb-XX-*.spec.js` for each new spec (under a `tests/` subdir)
- `TEST-PLAN.md` (updated)

Use `present_files` to make them downloadable.

In the response message:
- Confirm the test count change (e.g. "21 → 28")
- Confirm the CB coverage change (e.g. "7 → 15 of 33")
- Provide the destination paths in Mark's repo:
  - Specs go in `~/dev/lg-pilates-booking/tests-playwright/tests/`
  - TEST-PLAN.md replaces `~/dev/lg-pilates-booking/tests-playwright/TEST-PLAN.md`
- Provide the run commands:
  ```
  cd ~/dev/lg-pilates-booking/tests-playwright
  npm test
  ```
- Provide the commit message (Step 7)

---

## STEP 7 — Commit message format

**Single-line title only.** Do not produce multi-line commit messages with em-dashes, backticks, or other special characters. zsh quoting trips on these and Mark's terminal copy-paste fails (Session 10 learning).

Format:

```
Title: Batch [N] CB tests: CB-AA, CB-BB, CB-CC, CB-DD, CB-EE
Description: [2-3 sentences on what changed and why]
```

Mark uses just the title for `git commit -m`. The description is for context in the chat reply, not the commit itself.

---

## STEP 8 — End-of-batch verification

After Mark drops files into the repo:

1. Ask him to verify file locations with `ls`
2. Wait for him to run `npm test` and report back
3. If all green: provide the push commands
4. If anything fails: dig into the trace together (always-on traces from Session 10 mean every failure has full forensic evidence)

Push commands:
```
cd ~/dev/lg-pilates-booking
git status
git add tests-playwright/
git commit -m "[title from Step 7]"
git push
```

If `git status` shows index.html as modified and it shouldn't be (the env switch was already pushed in Session 11), flag it before staging.

---

## End-of-Session Updates

For most batch sessions, the 4B routine above replaces the historical "End-of-Session" wrap-up: TEST-PLAN.md and context.txt are updated as part of the batch close, not separately at session end.

If the session involves work that ISN'T a Playwright batch (e.g. an index.html bug fix, a fixture migration, a schema change), context.txt may still need a touch at end of session — header date, relevant section update, and a brief KEY DECISIONS entry if there's a durable learning. Wait for the explicit "End of session" signal before doing those updates.

---

## Recovery Signal

If Mark types "skill?" at any point, it means Claude has skipped or is about to skip a step from this skill. Stop immediately, acknowledge the miss, and return to the correct step before continuing.

---

## Quick Reference — Batch Session Checklist

1. Run session-start checks (index.html present, fixture drift, helpers in context)
2. Confirm batch scope with hard gate phrase
3. Pre-flight: helpers verified, example spec in context, selectors verified in index.html, Excel scenario wording matches reality, file naming confirmed, fixture-customer collisions scanned (returning-client batches only)
4. **Throughout the session:** if anything changes from agreed scope (spec deferral, fixture change, obsolete scenario, etc.) STOP and ask in two lines. Self-trigger on phrases like "I'll just" / "easiest thing is" / "let me also". Do NOT update TEST-PLAN.md, context.txt, or Excel until tests are green AND the user has signed off.
5. Write specs following the mandatory structure
6. Run tests, iterate until green
7. After user confirms all tests pass AND signals to proceed with documentation:
   - **STEP 4B routine:** Excel (if scenario wording changed) → TEST-PLAN.md (5 edits) → context.txt (6 edits, including KEY DECISIONS "SESSION [N] LEARNINGS" block)
8. Self-review against security/code/regression checklist
9. Produce output files for the entire batch (specs + helper changes + 3 docs), present them with destination paths and run commands
10. Provide single-line commit message + consolidated push command block
11. Remind Mark to confirm `git status` shows only the expected files before committing

---

## What this skill does NOT cover

- **Project-level conventions** — see the lgpilates-booking-system skill
- **Mockup-first UI gating** — that's the mockup-first-ui skill, applies to feature changes not test writing
- **Code quality review for index.html changes** — that's the code-quality-review skill

**Excel test scenario updates ARE in scope when:** the wording in `LG_Pilates_Test_Scenarios.xlsx` no longer matches what the system actually does (e.g. references defunct steps, old labels, or skipped transitions). Session 13 hit this — the Excel CB-14 to CB-20 referenced an old 3-step flow when the live system has 4 steps. When this is detected:

1. Flag it to Mark before writing specs that would otherwise inherit the stale wording
2. Confirm whether to update the Excel at end of session
3. If yes, update the Excel as a separate end-of-session deliverable alongside `TEST-PLAN.md` and `context.txt`
4. Preserve formatting (Arial 10pt, wrap-text on, top-aligned cells, header style) — read style from an existing data row and copy via `openpyxl`'s `copy()` rather than re-applying defaults

If a NEW scenario is added (e.g. CB-16b filling a flow gap), confirm whether it should be an "official numbered scenario" in the Excel or remain an unofficial extra. Default recommendation: make it official to avoid confusing gaps in the numbering. Update the Excel total scenario count accordingly.

If the session involves a mix (e.g. a feature change AND new tests for it), all relevant skills apply in their proper order: mockup-first → code-quality-review for index.html → playwright-batch-workflow for the new tests.
