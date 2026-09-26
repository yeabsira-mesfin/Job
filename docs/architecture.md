# Design notes

## Why a workflow, not arbitrary status editing?

Applications start at `saved`. Each state exposes its allowed next states through `/api/workflow`. The UI consumes that contract rather than maintaining a second transition table. Terminal outcomes are accepted, rejected, or withdrawn; notes can still be added afterwards.

## Consistency

Each mutation runs inside `BEGIN IMMEDIATE`. Application and event writes either commit together or roll back together. A version increments once per successful edit. A stale version returns HTTP 409 before any history is appended. This prevents the common two-tab lost-update problem without holding a lock during user interaction.

## Storage and backup

SQLite uses WAL mode and a five-second busy timeout. Files live outside source control. Stop the process before copying the database and its WAL sidecars, or use SQLite's online backup tooling for a live deployment. The demo has a single schema version; future schema changes need explicit versioned migrations rather than editing CREATE TABLE in place.

## Boundaries

The API never visits supplied job URLs. Only http/https links can be stored. React escapes text. CSV cells beginning with formula characters receive a leading apostrophe. These measures do not replace authentication for shared deployment.

## Test strategy

Tests exercise the public store and real HTTP server with ephemeral ports. A temporary on-disk database proves restart persistence. Conflict tests assert the event count, verifying rollback behavior rather than only checking the error message. Browser layout is responsive; automated browser end-to-end coverage is a future improvement.
