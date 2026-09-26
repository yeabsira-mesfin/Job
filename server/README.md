# ApplyFlow API

Node.js 24 or later; no backend packages required.

```sh
node server/seed.mjs
node server/app.mjs
node --test tests/*.test.mjs
```

The server binds to 127.0.0.1:3101. Records persist in `data/applications.db`.
`DB_PATH`, `HOST`, `PORT`, and `APP_ORIGIN` are configurable. This is a local,
single-user portfolio application. Add authentication, TLS, per-user isolation,
and backups before hosting it for other people.

- `GET /api/health`: liveness
- `GET /api/workflow`: allowed state transitions
- `GET /api/applications?q=engineer&status=applied`: search/filter
- `POST /api/applications`: company, role, optional location, url, follow_up, deadline
- `GET /api/applications/:id`: details and chronological event history
- `PATCH /api/applications/:id`: current version and status, follow_up, deadline, or note
- `GET /api/export.csv`: spreadsheet-safe export

Conflicting versions return 409, invalid transitions 422, invalid input 400.
Creation and event history updates are atomic SQLite transactions. Versions
prevent a second browser tab from silently replacing newer changes.

`deadline` is an optional valid `YYYY-MM-DD` UTC calendar date, independent of
`follow_up`. Omit it on PATCH to preserve it, or send null/empty text to clear it.
Changing a deadline records an audit event and increments the version. Existing
databases migrate in place to schema version 2 with null deadlines. CSV includes
the deadline column. Dashboard reminders cover saved opportunities due within
seven days (inclusive), today, or overdue. Applied and closed records retain
the date but do not produce application reminders. No notifications are sent.
