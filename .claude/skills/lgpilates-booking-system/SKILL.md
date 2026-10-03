---
name: lgpilates-booking-system
description: >
  Full context skill for the LG Pilates web-based booking system project. Use this skill whenever working on the LG Pilates booking system, including feature development, bug fixes, database queries, UI changes, admin functions, or any discussion of the project architecture. Trigger on any mention of "LG Pilates", "Louise's booking system", "Pilates booking", "the booking system", or references to the Supabase schema, class management, waitlists, or block bookings. Always load this skill before writing any code or making any suggestions related to this project.
---

# LG Pilates Booking System

## Project Overview

A web-based booking system for LG Pilates, a Pilates business run by Louise (Mark's partner). Built as a standalone single HTML file connected to a Supabase database. It is separate from the main website (lg-pilates.co.uk) and operates independently.

Mark builds and maintains this system. Louise is the end user and business owner.

---

## Architecture

- **Frontend:** Single `index.html` file — all HTML, CSS, and JavaScript in one file
- **Backend/Database:** Supabase (PostgreSQL)
- **Hosting:** GitHub (index.html pushed to repo)
- **No framework** — vanilla JS, no build tools

### Key principle
All code lives in `index.html`. There are no separate JS or CSS files. Any feature additions or changes must be applied to this single file.

---

## Core Features

- **Class management** — Louise can create and manage Pilates classes with a set capacity limit
- **Block session bookings** — customers can book a block of sessions, not just individual classes
- **Class limits** — each class has a maximum number of spaces
- **Waitlist** — when a class is full, customers can join a waitlist and are notified if a space opens
- **Notifications** — automated notifications sent to both the customer and Louise on booking, cancellation, and waitlist updates
- **Admin functions** — Louise has an admin panel to manage classes, view bookings, manage customers, and handle waitlists

---

## Supabase Setup

There are two Supabase projects (test and production) — see CLAUDE.md for IDs and which MCP server to use. Key rules when working with Supabase:

- **Always confirm with Mark before running any SQL query** — explain what the query does before executing
- Take the schema from context.txt section 4, or inspect the test database directly — don't guess table or column names

---

## Development Workflow

This project follows the **mockup-first-ui** skill for any visual or UI changes:
1. Build a working mockup first
2. Wait for Mark's explicit sign-off
3. Apply to index.html only after approval

Every product-code change follows the order in CLAUDE.md rule 9: `/code-review` → `/security-review` (when relevant) → tests → commit/push.

### Session start
In Claude Code, read `index.html` directly from the repo — never use a cached version. The session-start checks (index.html line count, time drift, state drift) are defined in CLAUDE.md.

### GitHub commits
Single-line commit messages only — no em-dashes or backticks (zsh quoting issues). Always run `npm test` and confirm green before pushing.

---

## End of Session

When Mark says "End of session", "Wrap up", or similar, run the `/wrap-up` routine. Session notes go in SESSION-LOG.md; CLAUDE.md changes only when a rule, gotcha, or the current-state snapshot changes. GitHub Issues is the backlog — BACKLOG.md is historical only.

---

## Business Context

- **Business name:** LG Pilates
- **Owner:** Louise (Mark's partner)
- **Location:** Baildon and Guiseley, West Yorkshire
- **Classes:** Pilates sessions run at hired venues
- **Customers:** Members who book classes individually or in blocks
- Mark helps Louise with the technical side — Louise is non-technical

---

## Important Reminders

- Always work from `index.html` in the repo — never guess or reconstruct from memory
- Supabase SQL must be confirmed with Mark before execution
- All UI changes require a mockup and sign-off before touching the source file
- Keep all code in the single `index.html` file — do not suggest splitting into multiple files unless Mark explicitly requests it
