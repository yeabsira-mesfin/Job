import test from 'node:test';
import assert from 'node:assert/strict';
import { toCalendar } from '../server/calendar.mjs';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const row = { id: 'stable-id', status: 'saved', company: 'Cedar', role: 'Engineer', deadline: '2028-02-29' };
const unfold = text => text.replace(/\r\n /g, '');
test('all-day export validates dates, includes saved only and keeps IDs across edits', () => {
  for (const deadline of ['2028-02-29', '2026-12-31', '2027-01-01', '9999-12-31']) {
    const result = toCalendar([{ ...row, deadline }]);
    assert.match(result, new RegExp(`DTSTART;VALUE=DATE:${deadline.replaceAll('-', '')}\\r\\nDURATION:P1D`));
    assert.match(result, /UID:application-stable-id@applyflow.local/);
  }
  const invalid = [null, '', '2027-02-29', '2026-04-31', '0000-01-01', 'bad', 123].map(deadline => ({ ...row, deadline }));
  const other = ['applied', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn'].map(status => ({ ...row, status }));
  assert.doesNotMatch(toCalendar([...invalid, ...other]), /BEGIN:VEVENT/);
  assert.match(toCalendar([]), /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
});
test('text injection is escaped and Unicode folds without splitting UTF-8 characters', () => {
  const result = toCalendar([{ ...row, company: 'A,B;C\\D\r\nBEGIN:VEVENT', role: '界🙂'.repeat(60) }], new Date('2026-09-27T12:00:00Z'));
  assert.match(unfold(result), /A\\,B\\;C\\\\D\\nBEGIN:VEVENT/);
  assert.equal(result.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.ok(result.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.ok(unfold(result).includes('界🙂'.repeat(60)));
  assert.match(result, /DTSTAMP:20260927T120000Z/);
  assert.doesNotMatch(result.replaceAll('\r\n', ''), /[\r\n]/);
});
test('download endpoint exports current records with attachment and no-cache headers', async () => {
  const store = openStore(), server = createApp(store);
  const saved = store.create({ company: 'Cedar', role: 'Engineer', deadline: '2028-02-29' });
  store.create({ company: 'No deadline', role: 'Engineer' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/export.ics`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/calendar/);
    assert.match(response.headers.get('content-disposition'), /attachment; filename="application-deadlines.ics"/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const first = await response.text();
    assert.equal(first.match(/BEGIN:VEVENT/g).length, 1);
    store.update(saved.id, { version: 1, deadline: '2028-03-01' });
    const updated = await (await fetch(url)).text();
    assert.equal(updated.match(/UID:.*/)[0], first.match(/UID:.*/)[0]);
    assert.match(updated, /DTSTART;VALUE=DATE:20280301/);
    store.update(saved.id, { version: 2, status: 'applied' });
    assert.doesNotMatch(await (await fetch(url)).text(), /BEGIN:VEVENT/);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); }
});
