---
name: code-quality-review
description: >
  After every code change, automatically run a security and quality review checklist, then present the change with a technical explanation and plain English summary. Use this skill whenever code is written, modified, or updated — including HTML, JavaScript, Python, SQL, or any other language. Trigger for any request like "make a change", "update the code", "fix this", "add a feature", "refactor", or any task that results in new or modified code. Always apply this skill after completing the code change, before presenting the final output to the user. Do not skip this review even for small or minor changes.
---

# Code Quality & Security Review Skill

After every code change — no matter how small — complete the following review checklist before presenting the output to the user. This is a non-optional step.

---

## Step 1: Run the Post-Change Review

Work through each of these checks silently before presenting your response. If any issue is found, fix it before proceeding.

### Security
- Does the change expose any sensitive data (API keys, passwords, tokens, personal data)?
- Could it introduce injection risks (SQL injection, XSS, command injection)?
- Does it weaken any authentication or authorisation controls?
- Are there any new attack vectors or vulnerabilities introduced?

### Data Protection
- Is personal or sensitive data handled safely?
- Is anything being logged, exposed in responses, or stored unnecessarily?
- Are any privacy best practices being violated?

### Code Review
- Re-read the code after writing it.
- Check for bugs, typos, or logic errors.
- Are edge cases handled (empty inputs, nulls, unexpected types)?
- Are there unintended side effects?

### Regression Awareness
- What existing functionality could this change break?
- Mentally trace through the affected code paths.
- Flag anything that should be tested after the change.

### Error Handling
- Are failures handled gracefully?
- Do error messages avoid leaking system details, stack traces, or internal paths?
- Are there unhandled exceptions or missing null checks?

---

## Step 2: Present the Change

After completing the review, present your output in this structure:

### What changed (Technical)
A brief technical explanation of what was changed and why — suitable for a developer reviewing the code.

### What changed (Plain English)
A short, clear summary in simple terms so a non-technical person can understand what was updated and what it means for them.

### Review Summary
Confirm the review was completed. If any issues were found and fixed, briefly note them here. If everything was clean, say so. Example:

> ✅ Security and quality review completed. No issues found.

or

> ✅ Security and quality review completed. Fixed one edge case where a null value could cause an error on empty form submission.

---

## Notes

- Never skip the review, even for "just a small tweak".
- If a change is high-risk (e.g. auth logic, database queries, file handling), call this out explicitly in the review summary.
- If the change affects a critical user-facing flow, recommend that the user tests it manually.
