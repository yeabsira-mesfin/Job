import { toCalendar } from './calendar.mjs';
import { pathToFileURL } from 'node:url';
import { openStore, toCSV, transitions, Problem } from './store.mjs';
import { serve, body, json } from './http.mjs';

export function createApp(store, options) {
  return serve(async (req, res, url) => {
    const path = url.pathname;
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && path === '/api/workflow') return json(res, 200, transitions);
    if (req.method === 'GET' && path === '/api/applications') return json(res, 200, store.list(Object.fromEntries(url.searchParams)));
    if (req.method === 'POST' && path === '/api/applications') return json(res, 201, store.create(await body(req)));
    if (req.method === 'GET' && path === '/api/export.csv') {
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="applications.csv"', 'Cache-Control': 'no-store' });
      return res.end(toCSV(store.list()));
    }
    if (req.method === 'GET' && path === '/api/export.ics') {
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="application-deadlines.ics"', 'Cache-Control': 'no-store' });
      return res.end(toCalendar(store.list()));
    }
    const match = path.match(/^\/api\/applications\/([a-f0-9-]{36})$/);
    if (match && req.method === 'GET') return json(res, 200, store.get(match[1]));
    if (match && req.method === 'PATCH') return json(res, 200, store.update(match[1], await body(req)));
    throw new Problem(404, 'Route not found.');
  }, options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = openStore(process.env.DB_PATH ?? 'data/applications.db');
  const server = createApp(store);
  server.listen(Number(process.env.PORT ?? 3101), process.env.HOST ?? '127.0.0.1', () => console.log('ApplyFlow listening on port', server.address().port));
  const stop = () => server.close(() => { store.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
