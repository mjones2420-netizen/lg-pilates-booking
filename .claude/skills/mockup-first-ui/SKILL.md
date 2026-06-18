---
name: mockup-first-ui
description: >
  When a new feature or UI change is requested, always produce a working visual mockup first and wait for explicit sign-off before making changes to any source file. Use this skill whenever a user asks for a new feature, screen, layout, UI update, or any change that affects how something looks or behaves visually. Trigger on phrases like "add a feature", "change the layout", "new screen", "update the UI", "can we have a button/form/page", or any request that implies a visual or interactive change. Do not modify the main source file (e.g. index.html) until the user has explicitly approved the mockup. This skill must always fire before touching production files.
---

# Mockup-First UI Development Skill

For any new feature or visual/interactive UI change, always follow this workflow. Never skip straight to editing the source file.

## Step 1: Clarify the Request (if needed)

Before building the mockup, make sure you understand what the feature should do, where it appears, and any constraints. If the request is clear, proceed directly. If not, ask one focused question — don't ask multiple at once.

## Step 2: Build a Working Mockup

Create a standalone mockup that visually demonstrates the proposed change. It should be interactive where possible, reflect real layout/styling, and be isolated — never modifying the main source file. Present it clearly labelled as a mockup and ask for review before proceeding.

## Step 3: Wait for Explicit Sign-Off

Do not proceed until the user gives explicit approval ("looks good", "go ahead", "yes", "approved", etc.). If changes are requested, update and re-present. Repeat until approved.

## Step 4: Apply the Change to the Source File

Once approved, apply the change to index.html faithfully. Note what changed and reference the approved mockup.

## Notes

- Required for new features and UI changes. Not required for non-visual bug fixes or backend-only changes.
- Minor changes (label, colour) may use a description instead of a full mockup, but still wait for approval.
- Goal: avoid wasted effort and ensure alignment before source files are modified.
