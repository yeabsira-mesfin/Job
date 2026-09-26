import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, toCSV } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const input = { company: 'Cedar Labs', role: 'Engineer' };
test('workflow rejects skipped stages and preserves audit ordering', () => {
  const store = openStore();
  try {
    const row = store.create(input);
    assert.throws(() => store.update(row.id, { version: 1, status: 'offer' }), { status: 422 });
    const updated = store.update(row.id, { version: 1, status: 'applied', note: 'Referral submitted' });
    assert.equal(updated.version, 2);
    assert.deepEqual(updated.events.map(x => x.kind), ['created', 'status', 'note']);
    assert.equal(store.get(row.id).status, 'applied');
  } finally { store.close(); }
});
test('stale updates return conflict and do not append events', () => {
  const store = openStore();
  try {
    const row = store.create(input);
    store.update(row.id, { version: 1, note: 'First writer' });
    assert.throws(() => store.update(row.id, { version: 1, note: 'Lost update' }), { status: 409 });
    assert.equal(store.get(row.id).events.length, 2);
  } finally { store.close(); }
});
test('rejects unsafe URLs and impossible dates', () => {
  const store = openStore();
  try {
    for (const extra of [{ url: 'javascript:alert(1)' }, { follow_up: '2026-02-30' }, { role: '' }])
      assert.throws(() => store.create({ ...input, ...extra }), { status: 400 });
  } finally { store.close(); }
});
test('data survives closing and reopening SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'applyflow-'));
  const file = join(directory, 'app.db');
  const first = openStore(file); const row = first.create(input); first.close();
  const second = openStore(file);
  try { assert.equal(second.get(row.id).company, input.company); }
  finally { second.close(); rmSync(directory, { recursive: true }); }
});
test('CSV quotes data and neutralizes spreadsheet formulas', () => {
  const csv = toCSV([{ company: '=1+1', role: 'Lead, "API"' }]);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"Lead, ""API"""/);
});
test('HTTP creates, searches and validates malformed requests', async () => {
  const store = openStore(); const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    const row = await response.json();
    response = await fetch(`${base}/api/applications/${row.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(response.status, 400);
    assert.equal((await (await fetch(`${base}/api/applications?q=CEDAR`)).json()).length, 1);
    assert.equal((await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/applications?status=invalid`)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
