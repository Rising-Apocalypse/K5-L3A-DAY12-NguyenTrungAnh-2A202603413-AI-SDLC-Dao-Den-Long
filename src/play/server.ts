import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { parseEntry } from '../leaderboard/board';
import { readBoard, saveEntry } from './store';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

const MAX_BODY = 16 * 1024;

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
const sendJson = (res: ServerResponse, status: number, doc: unknown): void => send(res, status, JSON.stringify(doc), MIME['.json']!);

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        done(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => done(null));
  });
}

async function handleApi(req: IncomingMessage, res: ServerResponse, boardFile: string): Promise<void> {
  if (req.method === 'GET') return sendJson(res, 200, { entries: readBoard(boardFile) });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' });
  const body = await readBody(req);
  if (body === null) return sendJson(res, 400, { error: 'body too large or unreadable' });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: 'body is not valid JSON' });
  }
  const entry = parseEntry(json);
  if (!entry) return sendJson(res, 400, { error: 'invalid entry (name 3-12 chars of letters/digits/_, integer score >= 0, nights_won 0-3, ISO 8601 achieved_at with zone, integer seed)' });
  sendJson(res, 200, { entries: saveEntry(boardFile, entry) });
}

async function handleStatic(req: IncomingMessage, res: ServerResponse, webDir: string): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  } catch {
    return send(res, 400, 'bad request', 'text/plain');
  }
  if (path.includes('\0')) return send(res, 400, 'bad request', 'text/plain');
  if (path.endsWith('/')) path += 'index.html';
  const root = resolve(webDir);
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'forbidden', 'text/plain');
  try {
    const data = await readFile(file);
    send(res, 200, req.method === 'HEAD' ? '' : data, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}

/** Static server for the web build plus the leaderboard API (`/api/leaderboard`). Not listening yet. */
export function createPlayServer(webDir: string, boardFile: string): Server {
  return createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const job = url === '/api/leaderboard' ? handleApi(req, res, boardFile) : handleStatic(req, res, webDir);
    job.catch((e) => {
      if (!res.headersSent) sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
      else res.end();
    });
  });
}

/** Listen on 127.0.0.1 at `first`, or the next free port up to `first + tries - 1`. Resolves to the port used. */
export async function listenFrom(server: Server, first: number, tries: number): Promise<number> {
  for (let port = first; port < first + tries; port++) {
    const ok = await new Promise<boolean>((done, fail) => {
      const onError = (e: NodeJS.ErrnoException): void => (e.code === 'EADDRINUSE' ? done(false) : fail(e));
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError);
        done(true);
      });
    });
    if (ok) return port;
  }
  throw new Error(`no free port between ${first} and ${first + tries - 1}`);
}
