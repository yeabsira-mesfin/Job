import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const transitions = Object.freeze({
  saved: ['applied', 'withdrawn'],
  applied: ['interview', 'rejected', 'withdrawn'],
  interview: ['offer', 'rejected', 'withdrawn'],
  offer: ['accepted', 'rejected', 'withdrawn'],
  accepted: [], rejected: [], withdrawn: [],
});
export class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function text(value, name, max = 160, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Problem(400, `${name} must be ${required ? 'nonempty text' : 'text'} up to ${max} characters.`);
  return value.trim();
}
function date(value, field = 'Follow-up') {
  if (value === '' || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Problem(400, `${field} must be a valid YYYY-MM-DD date.`);
  return value;
}
export function openStore(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY, company TEXT NOT NULL, role TEXT NOT NULL,
      location TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL,
      follow_up TEXT, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
      kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS events_application ON events(application_id, id);
    `);
  // Additive, transactional migration preserves existing opportunities and events.
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('PRAGMA table_info(applications)').all().some(column => column.name === 'deadline'))
      db.exec('ALTER TABLE applications ADD COLUMN deadline TEXT');
    db.exec('PRAGMA user_version=2; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function get(id) {
    const row = db.prepare('SELECT * FROM applications WHERE id=?').get(id);
    if (!row) throw new Problem(404, 'Application not found.');
    return { ...row, events: db.prepare('SELECT kind, detail, created_at FROM events WHERE application_id=? ORDER BY id').all(id) };
  }
  function event(id, kind, detail, now) {
    db.prepare('INSERT INTO events(application_id,kind,detail,created_at) VALUES(?,?,?,?)').run(id, kind, detail, now);
  }
  return {
    close: () => db.close(), get,
    list({ q = '', status = '' } = {}) {
      if (status && !Object.hasOwn(transitions, status)) throw new Problem(400, 'Unknown status.');
      const query = String(q).slice(0, 160).toLowerCase();
      return db.prepare('SELECT * FROM applications ORDER BY updated_at DESC, id').all()
        .filter(row => (!status || row.status === status) && `${row.company} ${row.role} ${row.location}`.toLowerCase().includes(query));
    },
    create(input) {
      if (!input || typeof input !== 'object') throw new Problem(400, 'Expected an application object.');
      const company = text(input.company, 'Company');
      const role = text(input.role, 'Role');
      const location = text(input.location ?? '', 'Location', 160, false);
      const url = text(input.url ?? '', 'URL', 1000, false);
      if (url) {
        let parsed;
        try { parsed = new URL(url); } catch { throw new Problem(400, 'Use an http or https job URL.'); }
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Problem(400, 'Use an http or https job URL.');
      }
      const followUp = date(input.follow_up ?? null);
      const deadline = date(input.deadline ?? null, 'Deadline');
      return transaction(() => {
        const id = randomUUID(), now = new Date().toISOString();
        db.prepare('INSERT INTO applications(id,company,role,location,url,status,follow_up,version,created_at,updated_at,deadline) VALUES(?,?,?,?,?,?,?,1,?,?,?)')
          .run(id, company, role, location, url, 'saved', followUp, now, now, deadline);
        event(id, 'created', 'Opportunity saved', now);
        return get(id);
      });
    },
    update(id, input) {
      if (!input || !Number.isInteger(input.version)) throw new Problem(400, 'Include the current integer version.');
      return transaction(() => {
        const current = get(id);
        if (input.version !== current.version) throw new Problem(409, 'This application changed. Refresh before saving.');
        const status = input.status ?? current.status;
        if (status !== current.status && !transitions[current.status].includes(status))
          throw new Problem(422, `Cannot move from ${current.status} to ${status}.`);
        const followUp = Object.hasOwn(input, 'follow_up') ? date(input.follow_up) : current.follow_up;
        const deadline = Object.hasOwn(input, 'deadline') ? date(input.deadline, 'Deadline') : current.deadline;
        const note = input.note === undefined ? '' : text(input.note, 'Note', 1500, false);
        if (status === current.status && followUp === current.follow_up && deadline === current.deadline && !note) throw new Problem(400, 'No changes to save.');
        const now = new Date().toISOString();
        db.prepare('UPDATE applications SET status=?,follow_up=?,deadline=?,version=version+1,updated_at=? WHERE id=?')
          .run(status, followUp, deadline, now, id);
        if (status !== current.status) event(id, 'status', `${current.status} → ${status}`, now);
        if (followUp !== current.follow_up) event(id, 'follow_up', followUp ?? 'Cleared', now);
        if (deadline !== current.deadline) event(id, 'deadline', deadline ?? 'Cleared', now);
        if (note) event(id, 'note', note, now);
        return get(id);
      });
    },
  };
}
export function toCSV(rows) {
  const columns = ['company', 'role', 'location', 'status', 'follow_up', 'deadline', 'url'];
  const escape = value => {
    let v = String(value ?? '');
    if (/^[\s]*[=+@\-\t\r]/.test(v)) v = `'${v}`;
    return `"${v.replaceAll('"', '""')}"`;
  };
  return [columns.join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\r\n');
}
