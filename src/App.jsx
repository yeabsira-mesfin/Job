import React, { useEffect, useState } from 'react';
import { deadlineState, deadlineReminders } from './deadlines.mjs';

async function api(path, options) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Request failed.');
  return data;
}
const label = text => text.replaceAll('_', ' ');
const terminal = ['accepted', 'rejected', 'withdrawn'];
export default function App() {
  const [rows, setRows] = useState([]), [workflow, setWorkflow] = useState({});
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false), [notice, setNotice] = useState('');
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const timer = setInterval(() => setToday(new Date().toISOString().slice(0, 10)), 60000);
    return () => clearInterval(timer);
  }, []);
  const reminders = deadlineReminders(rows, today);
  const overdue = row => row.follow_up && row.follow_up <= today && !terminal.includes(row.status);
  async function refresh() {
    const [applications, states] = await Promise.all([api('/applications'), api('/workflow')]);
    setRows(applications); setWorkflow(states);
  }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  async function run(action) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await refresh(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function open(id) { try { setSelected(await api(`/applications/${id}`)); setError(''); } catch (e) { setError(e.message); } }
  const visible = rows.filter(row => (!filter || (filter === 'deadlines' ? reminders.some(r => r.id === row.id) : filter === 'due' ? overdue(row) : row.status === filter)) && `${row.company} ${row.role} ${row.location}`.toLowerCase().includes(query.toLowerCase()));
  const stats = [['Opportunities', rows.length], ['In progress', rows.filter(r => ['applied', 'interview', 'offer'].includes(r.status)).length], ['Follow-ups due', rows.filter(overdue).length], ['Offers received', rows.filter(r => ['offer', 'accepted'].includes(r.status)).length]];
  return <div className="shell">
    <header><a className="brand" href="/">A<span>ApplyFlow</span></a><span className="tag">PERSONAL WORKSPACE</span><a className="export" href="/api/export.csv">Export CSV ↗</a></header>
    <main>
      <div className="heading"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h1>Make your next move.</h1><p>One place for opportunities, conversations, and follow-ups.</p></div><button onClick={() => setShowForm(!showForm)}>{showForm ? 'Close form' : '+ Save opportunity'}</button></div>
      <div className="stats">{stats.map(([name, value]) => <div className="stat" key={name}><span>{name}</span><strong>{value.toString().padStart(2, '0')}</strong></div>)}</div>
      {reminders.length > 0 && <section className="panel deadlines" aria-label="Application deadline reminders"><div><h2>{reminders.length} application deadline{reminders.length === 1 ? '' : 's'} need attention</h2><p>Saved opportunities only. Dates use UTC. This is an in-app reminder, with no email or background notifications.</p></div><ul>{reminders.slice(0, 5).map(row => <li key={row.id}><button className="plain" onClick={() => open(row.id)}>{row.company}: {row.role}</button><span className="due">{deadlineState(row, today) === 'overdue' ? 'Overdue' : deadlineState(row, today) === 'today' ? 'Due today' : 'Due soon'} · {row.deadline}</span></li>)}</ul><button onClick={() => { setFilter('deadlines'); setQuery(''); }}>View all deadline reminders</button></section>}
      {error && <div className="alert" role="alert">{error} <button className="plain" disabled={busy} onClick={() => run(async () => { await refresh(); if (selected) await open(selected.id); })}>Refresh data</button></div>}
      <p className="notice" role="status">{notice}</p>
      {showForm && <section className="panel"><h2>Save an opportunity</h2><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); run(async () => { const row = await api('/applications', { method: 'POST', body: JSON.stringify(values) }); setSelected(row); setShowForm(false); setNotice('Opportunity saved.'); }); }}>
        <div className="formgrid">{[['company', 'Company', 'text', true], ['role', 'Role', 'text', true], ['location', 'Location', 'text', false], ['url', 'Job posting URL', 'url', false], ['follow_up', 'Follow-up date', 'date', false], ['deadline', 'Application deadline', 'date', false]].map(([name, title, type, required]) => <label key={name}>{title}<input name={name} type={type} required={required} maxLength={name === 'url' ? 1000 : 160}/></label>)}</div>
        <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save opportunity'}</button>
      </form></section>}
      <div className="workgrid"><section>
        <div className="sectionhead"><h2>Your pipeline <span>{visible.length}</span></h2><label className="search"><span className="sr-only">Search opportunities</span><input placeholder="Search company or role…" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
        <div className="filters" aria-label="Filter opportunities">{[['', 'All'], ['due', 'Follow-ups due'], ['deadlines', 'Deadline reminders'], ...Object.keys(workflow).map(s => [s, label(s)])].map(([value, name]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{name}</button>)}</div>
        {loading ? <p role="status">Loading your workspace…</p> : !visible.length ? <div className="empty"><h3>A fresh start.</h3><p>{rows.length ? 'No opportunities match these filters.' : 'Save your first opportunity above, or run npm run seed for a synthetic demo.'}</p></div> : <div className="cards">{visible.map(row => <button className={`opportunity ${selected?.id === row.id ? 'selected' : ''}`} key={row.id} onClick={() => open(row.id)}><div className="cardtop"><span className="monogram">{row.company.slice(0, 2).toUpperCase()}</span><span className={`pill ${row.status}`}>{row.status}</span></div><h3>{row.role}</h3><p>{row.company}</p><div className="cardbottom"><span>{row.location || 'Location flexible'}</span><span className={overdue(row) ? 'due' : ''}>{row.follow_up ? `Follow up ${row.follow_up}` : 'No follow-up set'}</span>{row.deadline && <span className={['overdue', 'today', 'soon'].includes(deadlineState(row, today)) ? 'due' : ''}>Apply by {row.deadline}</span>}</div></button>)}</div>}
      </section><aside className="panel detail">{selected ? <div key={`${selected.id}-${selected.version}`}><p className="eyebrow">OPPORTUNITY DETAIL</p><h2>{selected.role}</h2><p>{selected.company} · {selected.location || 'Unspecified location'}</p>{selected.url && <a href={selected.url} target="_blank" rel="noreferrer">View original posting ↗</a>}
        <form onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); run(async () => { setSelected(await api(`/applications/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ ...values, version: selected.version }) })); setNotice('Changes saved to the timeline.'); }); }}>
          <label>Stage<select name="status" defaultValue={selected.status}><option>{selected.status}</option>{(workflow[selected.status] ?? []).map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Follow-up date<input type="date" name="follow_up" defaultValue={selected.follow_up ?? ''}/></label>
          <label>Application deadline<input type="date" name="deadline" defaultValue={selected.deadline ?? ''}/></label>
          <label>Add a note<textarea name="note" maxLength={1500} rows={3} placeholder="What happened? What comes next?"/></label><button disabled={busy} type="submit">{busy ? 'Saving…' : 'Update opportunity'}</button>
        </form><h3>Activity timeline</h3><ol className="timeline">{[...selected.events].reverse().map((event, i) => <li key={i}><strong>{label(event.kind)}</strong><p>{event.detail}</p><time>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol>
      </div> : <div className="empty"><p className="eyebrow">STAY IN THE LOOP</p><h2>Every next step, in view.</h2><p>Select an opportunity to see its history, move it forward, or schedule a follow-up.</p></div>}</aside></div>
    </main><footer><span>ApplyFlow · Built for intentional career moves</span><span>Local, single-user app · Dates use UTC</span></footer>
  </div>;
}
