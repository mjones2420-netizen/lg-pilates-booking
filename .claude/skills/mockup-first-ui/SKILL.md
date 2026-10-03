---
name: mockup-first-ui
description: >
  When a new feature or UI change is requested, always produce a working visual mockup first and wait for explicit sign-off before making changes to any source file. Use this skill whenever a user asks for a new feature, screen, layout, UI update, or any change that affects how something looks or behaves visually. Trigger on phrases like "add a feature", "change the layout", "new screen", "update the UI", "can we have a button/form/page", or any request that implies a visual or interactive change. Do not keep, commit or push the change until the user has explicitly approved the mockup. This skill must always fire before touching production files.
---

# Mockup-First UI Development Skill

For any new feature or visual/interactive UI change, always follow this workflow. Never skip straight to a kept change.

## Step 1: Clarify the Request (if needed)

Before building the mockup, make sure you understand what the feature should do, where it appears, and any constraints. If the request is clear, proceed directly. If not, ask one focused question — don't ask multiple at once.

## Step 2: Build a Working Mockup

Build the mockup in the real app: make the change locally (uncommitted, never pushed) and run it on localhost against the TEST database (`?env=test`, test-mode banner on). Static mockups hide dead-CSS bugs, so this is the default. Production is never touched. If Mark declines, revert the local change with git; any test data created is wiped by `npm run seed`. If the mockup would need a database change (new column, migration), ask first.

Only when Mark asks (e.g. he's away from his Mac), also publish screenshots of the same mockup as an Artifact so he can view it on his phone or iPad. Redeploy to the same Artifact when iterating so the link stays stable.

Present it clearly labelled as a mockup and ask for review before proceeding.

## Step 3: Wait for Explicit Sign-Off

Do not proceed until the user gives explicit approval ("looks good", "go ahead", "yes", "approved", etc.). If changes are requested, update and re-present. Repeat until approved.

## Step 4: Keep the Change

Once approved, keep the change (tidy it up if needed) and carry on with the normal review → tests → commit order. Note what changed and reference the approved mockup.

## Notes

- Required for new features and UI changes. Not required for non-visual bug fixes or backend-only changes.
- Minor changes (label, colour) may use a description instead of a full mockup, but still wait for approval.
- Goal: avoid wasted effort and ensure alignment before a change is kept.
