import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { userIdForToken } from './auth.ts';
import { openDb } from './db.ts';
import { buildRoutes } from './routes.ts';

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_FILE = process.env.DB_FILE ?? new URL('../data/whilefly.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

export function startServer(port = PORT, dbFile = DB_FILE) {
  const db = openDb(dbFile);
  const router = buildRoutes(db);
  const resolveUser = (token: string | null) => userIdForToken(db, token);

  const server = createServer((req, res) => {
    router.handle(req, res, resolveUser);
  });

  return new Promise<{ close: () => Promise<void>; port: number }>((resolve) => {
    server.listen(port, HOST, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => {
              db.close();
              done();
            });
            server.closeAllConnections();
          }),
      });
    });
  });
}

// Run directly: `node src/index.ts`
if (import.meta.main) {
  const { port } = await startServer();
  console.log(`WhileFly server listening on port ${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  → http://${a.address}:${port}`);
    }
  }
  console.log(`DB: ${DB_FILE}`);
}
