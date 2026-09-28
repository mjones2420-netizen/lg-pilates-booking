---
name: backlog-ticket
description: >
  Mark's format and mechanics for booking-system backlog tickets (GitHub Issues + project board #1). Use whenever a ticket is created, rewritten, re-ranked, attached to a parent, closed, or when Mark asks to review/groom the backlog. Trigger on "create a ticket", "raise an issue", "add to the backlog", "open an issue for", "new ticket", "re-rank", "move to High/Medium/Low", "review the backlog", "backlog review", or /backlog-ticket. Also use when a finding mid-task deserves its own ticket. Do NOT use for website-repo (lg-pilates-website) tickets unless Mark asks, and never for release/deploy tickets (those update RELEASE-PLAN.md + phase issues #63-#69 instead).
---

# Backlog Ticket Skill

Mark is non-technical. Every ticket must make sense to him at a glance months later. The format was set in the session-100 backlog review (28 Sep 2026).

## Board facts

- Repo: `mjones2420-netizen/lg-pilates-booking`. Board: user project **#1** ("Booking System Backlog"), owner `mjones2420-netizen`.
- Status field id: `PVTSSF_lAHOD-Lj284Bcs4QzhXTuTI`

| Column | Option id | Meaning |
|---|---|---|
| Todo | `36ea2b26` | New, not yet ranked by Mark |
| High Priority | `eb47b09c` | |
| Medium Priority | `10d8d684` | |
| Low Priority | `114f195c` | |
| Done | `918a68cf` | Closed (completed or not planned) |

If an edit fails with an unknown option id, re-read the field: `gh project field-list 1 --owner mjones2420-netizen --format json`. The columns may have changed; update this table.

## 1. Title

- Plain English. Say what it achieves or what's wrong, not the jargon. Good: "Automatic database backups + a tested restore". Bad: "T3-04: pg_dump cron".
- Add timing in brackets when it matters: "(before Phase 2b)", "(during Netlify move)", "(idea)".
- No old tier prefixes (T1-03, T2-05...).

## 2. Body template

```markdown
## Plain-English summary (<context, e.g. "raised session 101">, <DD Mon YYYY>)
- **What it is:** / **What's wrong:** <one or two plain sentences>
- **Why:** <impact on customers, Louise, or the business>
- **Scenario:** <concrete example, if one helps>
- **Rating:** <impact / effort, if known>. **Timing:** <deadline or release phase, if relevant>
- **Worth knowing:** <overlaps, risks, decisions Mark or Louise must make, related tickets #NN>

---

<technical detail: files, line numbers, error text, CI run ids, SQL, fix approach>
```

- Keep the summary to about 4–7 bullets. Put jargon below the `---`, or gloss it in brackets.
- If the ticket touches production, money, or customer data, say so plainly in the summary.
- **Rewriting an old ticket:** put the summary block ABOVE the existing body, then `---`, then the original text. Never delete the original detail.

## 3. Create, add to board, rank

```bash
S=<scratchpad>
URL=$(gh issue create --title "<title>" --body-file $S/ticket.md)
IID=$(gh project item-add 1 --owner mjones2420-netizen --url $URL --format json -q .id)
PID=$(gh project view 1 --owner mjones2420-netizen --format json -q .id)
# leave in Todo, OR if Mark already named a priority:
gh project item-edit --id $IID --project-id $PID \
  --field-id PVTSSF_lAHOD-Lj284Bcs4QzhXTuTI --single-select-option-id <option id>
```

Then in chat give Mark the plain-English summary, the suggested title, and **one question: High, Medium or Low?** Stop and wait. Move the ticket once he answers.

## 4. Existing ticket: move, rename, attach, close

- **Find a ticket's board item id:** `gh project item-list 1 --owner mjones2420-netizen --limit 300 --format json` and match `content.number`.
- **Rename + prepend summary:** build the new body file (summary + `---` + `gh issue view N --json body -q .body`), then `gh issue edit N --title "..." --body-file ...`.
- **Attach as a sub-issue:** the sub-issue needs the REST `id`, not the number.
  ```bash
  SUB=$(gh api repos/mjones2420-netizen/lg-pilates-booking/issues/<child> --jq .id)
  gh api -X POST repos/mjones2420-netizen/lg-pilates-booking/issues/<parent>/sub_issues -F sub_issue_id=$SUB
  ```
  If it returns a 422 "may only have one parent", check the existing parent first: GraphQL `issue(number:N){parent{number}}`.
- **Close:** always do BOTH steps. Set Done on the board, AND `gh issue close N --comment "<why, dated>"`. Add `--reason "not planned"` when Mark drops it.
- A parent with an open sub-issue shouldn't be closed. Tell Mark it will close when the child does.

## 5. Backlog review mode

When Mark asks to review or groom the backlog:
1. Pull everything: `gh project item-list ... --format json` into the scratchpad. Work through Todo (or whichever column he names) top to bottom.
2. For each ticket, **one at a time**:
   - Read the body and comments.
   - Check the claims against reality. Is it already done in the code? Are any linked issues closed? Is it blocked or overtaken?
   - Give Mark the plain-English summary, a suggested title, and a recommendation (rank / close / attach under a parent). Then ask one question and stop.
3. Once he answers, apply: rename, prepend the summary, set the column, attach if agreed.
4. Look out for duplicates, parents that are now redundant, and findings worth their own ticket. Suggest them, don't just do them.
5. At the end: verify the board (Todo empty, counts per column) and give the full milestone recap. If release phases changed, update RELEASE-PLAN.md and the Launch Roadmap artifact.

## Don'ts

- Don't open release/deploy tickets. Update RELEASE-PLAN.md and phase issues #63–#69 instead.
- Don't rank a ticket yourself unless Mark has already named the priority.
- Don't put secrets or credentials in tickets. The repo is public until #104.
