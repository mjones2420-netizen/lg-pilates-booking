---
name: lgpilates-booking-system
description: >
  Full context skill for the LG Pilates web-based booking system project. Use this skill whenever working on the LG Pilates booking system, including feature development, bug fixes, database queries, UI changes, admin functions, or any discussion of the project architecture. Trigger on any mention of "LG Pilates", "Louise's booking system", "Pilates booking", "the booking system", or references to the Supabase schema, class management, waitlists, or block bookings. Always load this skill before writing any code or making any suggestions related to this project.
---

# LG Pilates Booking System

## Project Overview

A web-based booking system for LG Pilates, a Pilates business run by Louise (Mark's partner). Built as a standalone single HTML file connected to a Supabase database. It is separate from the WordPress website and operates independently.

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

Mark has a Supabase project connected to this system. Key rules when working with Supabase:

- **Always confirm with Mark before running any SQL query** — explain what the query does before executing
- The database schema should be referenced from the current index.html and any context files Mark provides
- Never assume the schema — ask Mark to confirm table and column names if uncertain

---

## Development Workflow

This project follows the **mockup-first-ui** skill for any visual or UI changes:
1. Build a working mockup first
2. Wait for Mark's explicit sign-off
3. Apply to index.html only after approval

This project also follows the **code-quality-review** skill after every code change.

### Session start
Mark should upload the latest `index.html` at the start of every session before work begins. Confirm the file is present before proceeding. Do not use any previously cached or in-memory version.

If a second `index.html` is uploaded mid-session, warn Mark that this may overwrite the working copy and ask whether to proceed.

### GitHub commits
Whenever an updated index.html is ready to push to GitHub, provide a ready-to-copy commit message in this format:

**Title:** Short commit title (e.g. "Add waitlist notification on class full")
**Description:** 2–3 sentence summary of what changed and why.

---

## End of Session

When Mark says "End of session", "Wrap up", "Update context", or similar:
1. Produce an updated `context.txt` reflecting all changes made in the session and present it for download
2. Remind Mark to push the updated `index.html` to GitHub if not already done

---

## Business Context

- **Business name:** LG Pilates
- **Owner:** Louise (Mark's partner)
- **Location:** Guiseley and nearby areas in West Yorkshire
- **Classes:** Pilates sessions run at hired venues
- **Customers:** Members who book classes individually or in blocks
- Mark helps Louise with the technical side — Louise is non-technical

---

## Important Reminders

- Always work from the uploaded `index.html` — never guess or reconstruct from memory
- Supabase SQL must be confirmed with Mark before execution
- All UI changes require a mockup and sign-off before touching the source file
- Keep all code in the single `index.html` file — do not suggest splitting into multiple files unless Mark explicitly requests it
