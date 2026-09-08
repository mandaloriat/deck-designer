import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isSubPath } from '@deck-designer/core';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

export interface RenderServer {
  origin: string;
  /** Registers a document and returns the URL to navigate to. */
  publish(html: string): string;
  /** Requests that were served, useful for asserting hermetic builds. */
  close(): Promise<void>;
}

/**
 * Rendering goes through a loopback HTTP origin rather than `file://` so web
 * fonts, CSS and images obey the same origin rules they would in a browser.
 * `file://` silently fails font loading in Chromium, which is a classic source
 * of "the PDF looks different on CI" bugs.
 */
export async function startRenderServer(root: string): Promise<RenderServer> {
  const documents = new Map<string, string>();

  const server = http.createServer((req, res) => {
    void handle(req, res).catch(() => {
      res.statusCode = 500;
      res.end('render server error');
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/__deck/doc/')) {
      const id = pathname.slice('/__deck/doc/'.length);
      const html = documents.get(id);
      if (!html) {
        res.statusCode = 404;
        res.end('unknown document');
        return;
      }
      res.setHeader('content-type', MIME['.html'] as string);
      res.setHeader('cache-control', 'no-store');
      res.end(html);
      return;
    }

    const abs = path.resolve(root, `.${pathname}`);
    if (!isSubPath(root, abs)) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(abs);
    } catch {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    if (!stat.isFile()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    res.setHeader('content-type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('content-length', String(stat.size));
    res.setHeader('cache-control', 'no-store');
    fs.createReadStream(abs).pipe(res);
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('render server failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    publish(html: string): string {
      const id = randomUUID();
      documents.set(id, html);
      return `${origin}/__deck/doc/${id}`;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
