import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, toCSV } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { deadlineState, deadlineReminders } from '../src/deadlines.mjs';

test('reminders include overdue, today and day seven across a year boundary', () => {
  const row = deadline => ({ company: 'Cedar', status: 'saved', deadline });
  const today = '2026-12-29';
  assert.equal(deadlineState(row('2026-12-28'), today), 'overdue');
  assert.equal(deadlineState(row(today), today), 'today');
  assert.equal(deadlineState(row('2027-01-05'), today), 'soon');
  assert.equal(deadlineState(row('2027-01-06'), today), 'later');
  const rows = [row('2027-01-05'), row(null), row('2027-01-06'), row(today), row('2026-12-28')];
  assert.deepEqual(deadlineReminders(rows, today).map(r => r.deadline), ['2026-12-28', today, '2027-01-05']);
  assert.equal(rows[0].deadline, '2027-01-05', 'sorting must not mutate source');
  for (const status of ['applied', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn'])
    assert.equal(deadlineState({ ...row(today), status }, today), null);
  assert.equal(deadlineState(row('2028-03-01'), '2028-02-29'), 'soon');
});

test('deadline changes are audited, independent, validated and version checked', () => {
  const store = openStore();
  try {
    const row = store.create({ company: 'Cedar', role: 'Engineer', deadline: '2028-02-29', follow_up: '2028-02-20' });
    assert.equal(row.deadline, '2028-02-29');
    for (const deadline of ['2027-02-29', '2026-04-31', 'bad', 123])
      assert.throws(() => store.update(row.id, { version: 1, deadline }), { status: 400 });
    assert.equal(store.get(row.id).version, 1);
    const updated = store.update(row.id, { version: 1, deadline: '2028-03-01' });
    assert.equal(updated.follow_up, '2028-02-20');
    assert.deepEqual(updated.events.map(e => e.kind), ['created', 'deadline']);
    assert.throws(() => store.update(row.id, { version: 1, deadline: null }), { status: 409 });
    const preserved = store.update(row.id, { version: 2, note: 'Deadline confirmed' });
    assert.equal(preserved.deadline, '2028-03-01');
    assert.match(toCSV([preserved]), /follow_up,deadline,url/);
    assert.match(toCSV([preserved]), /"2028-03-01"/);
    const cleared = store.update(row.id, { version: 3, deadline: '' });
    assert.equal(cleared.deadline, null);
    assert.equal(cleared.events.at(-1).detail, 'Cleared');
  } finally { store.close(); }
});

test('schema version one migrates without losing applications or events and reopens safely', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applyflow-migrate-')), file = join(directory, 'old.db');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE applications(id TEXT PRIMARY KEY,company TEXT NOT NULL,role TEXT NOT NULL,location TEXT NOT NULL,url TEXT NOT NULL,status TEXT NOT NULL,follow_up TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE events(id INTEGER PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),kind TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL) STRICT;
    INSERT INTO applications VALUES('legacy','Cedar','Engineer','','','saved','2026-10-01',1,'2026-09-26','2026-09-26');
    INSERT INTO events VALUES(1,'legacy','created','Opportunity saved','2026-09-26');
    PRAGMA user_version=1;`);
  db.close();
  try {
    const store = openStore(file);
    try {
      assert.equal(store.get('legacy').deadline, null);
      assert.equal(store.get('legacy').events.length, 1);
      store.update('legacy', { version: 1, deadline: '2026-10-03' });
    } finally { store.close(); }
    const reopened = openStore(file);
    try {
      assert.equal(reopened.get('legacy').deadline, '2026-10-03');
      assert.equal(reopened.get('legacy').follow_up, '2026-10-01');
      assert.equal(reopened.get('legacy').events.length, 2);
    } finally { reopened.close(); }
  } finally { rmSync(directory, { recursive: true }); }
});

test('HTTP deadline create, read, invalid update and clear round trip', async () => {
  const store = openStore(), server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/applications`;
  const send = (url, method, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const created = await send(base, 'POST', { company: 'Cedar', role: 'Engineer', deadline: '2026-10-01' });
    assert.equal(created.status, 201);
    const row = await created.json();
    assert.equal((await (await fetch(base)).json())[0].deadline, '2026-10-01');
    assert.equal((await send(`${base}/${row.id}`, 'PATCH', { version: 1, deadline: '2026-02-30' })).status, 400);
    const cleared = await send(`${base}/${row.id}`, 'PATCH', { version: 1, deadline: null });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).deadline, null);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
