import { openStore } from './store.mjs';
const store = openStore(process.env.DB_PATH ?? 'data/applications.db');
if (!store.list().length) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const [company, role, state] of [['Cedar Labs (demo)', 'Software Engineer', 'interview'], ['Atlas Systems (demo)', 'Infrastructure Engineer', 'applied'], ['Northstar Studio (demo)', 'Full Stack Developer', 'saved']]) {
    let row = store.create({ company, role, location: 'Remote', follow_up: tomorrow });
    if (state !== 'saved') row = store.update(row.id, { version: row.version, status: 'applied', note: 'Synthetic opportunity for the demo.' });
    if (state === 'interview') store.update(row.id, { version: row.version, status: 'interview' });
  }
  console.log('Created 3 synthetic opportunities.');
} else console.log('Existing data preserved; seed skipped.');
store.close();
