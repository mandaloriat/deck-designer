import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  cardElement,
  collectCss,
  composeCards,
  escapeHtml,
  htmlDocument,
  isSubPath,
  loadProject,
  rasterFrame,
  resolveCards,
  type Card,
  type Diagnostic,
  type Face,
  type Project,
} from '@deck-designer/core';
import { CHROME_PAGE } from './page.js';

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
};

/** CSS reference resolution: 96 CSS pixels to the inch. */
const SCREEN_DPI = 96;

export interface PreviewServerOptions {
  root: string;
  host: string;
  port: number;
}

export interface PreviewServer {
  url: string;
  /** Tells every connected browser to reload. */
  notify(): void;
  close(): Promise<void>;
}

interface Snapshot {
  project: Project;
  cards: Card[];
  diagnostics: Diagnostic[];
}

/**
 * Serves the deck as the renderer would compose it, in a page that reloads
 * when the project changes. Deliberately a viewer, not an editor: the files
 * stay the source of truth, and every control here maps to a flag `deck
 * export` already has.
 */
export async function startPreviewServer(options: PreviewServerOptions): Promise<PreviewServer> {
  const clients = new Set<http.ServerResponse>();

  const load = async (): Promise<Snapshot> => {
    const project = await loadProject({ cwd: options.root });
    const { cards, diagnostics } = await resolveCards(project);
    return { project, cards, diagnostics };
  };

  const server = http.createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(error instanceof Error ? error.message : String(error));
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const route = decodeURIComponent(url.pathname);

    if (route === '/' || route === '/index.html') return send(res, 'text/html; charset=utf-8', CHROME_PAGE);
    if (route === '/__preview/events') return subscribe(res);
    if (route === '/__preview/state') return sendState(res, url);
    if (route === '/__preview/gallery') return sendGallery(res, url);
    return sendFile(res, route);
  }

  function send(res: http.ServerResponse, type: string, body: string): void {
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  }

  function subscribe(res: http.ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    res.write('retry: 1000\n\n');
    clients.add(res);
    res.on('close', () => clients.delete(res));
  }

  async function sendState(res: http.ServerResponse, url: URL): Promise<void> {
    let snapshot: Snapshot;
    try {
      snapshot = await load();
    } catch (error) {
      return send(res, MIME['.json'] as string, JSON.stringify({ error: describe(error) }));
    }

    const shown = select(snapshot.cards, url);
    send(
      res,
      MIME['.json'] as string,
      JSON.stringify({
        project: snapshot.project.name,
        total: snapshot.cards.length,
        shown: shown.length,
        cardTypes: snapshot.project.cardTypes.map((type) => ({
          id: type.id,
          name: type.name,
          count: snapshot.cards.filter((card) => card.type === type.id).length,
        })),
        diagnostics: snapshot.diagnostics,
      }),
    );
  }

  async function sendGallery(res: http.ServerResponse, url: URL): Promise<void> {
    let snapshot: Snapshot;
    try {
      snapshot = await load();
    } catch (error) {
      return send(res, MIME['.html'] as string, errorPage(describe(error)));
    }

    const faces = (url.searchParams.get('faces') ?? 'front,back')
      .split(',')
      .filter((face): face is Face => face === 'front' || face === 'back');
    const zoom = clamp(Number(url.searchParams.get('zoom')) || 1, 0.25, 4);
    const flags = {
      bleed: url.searchParams.get('bleed') === '1',
      guides: url.searchParams.get('guides') === '1',
      rounded: url.searchParams.get('rounded') === '1',
    };

    const cards = select(snapshot.cards, url);
    if (cards.length === 0) return send(res, MIME['.html'] as string, emptyPage());

    let composed;
    try {
      composed = await composeCards(snapshot.project, cards, { faces: faces.length ? faces : ['front'] });
    } catch (error) {
      return send(res, MIME['.html'] as string, errorPage(describe(error)));
    }

    // The same document the renderer builds, at screen scale: zoom is applied
    // as resolution, so layout is recomputed rather than scaled after the fact.
    const dpi = SCREEN_DPI * zoom;
    const body = composed
      .map((item) => {
        const frame = rasterFrame(item.geometry, flags.bleed, dpi);
        const card = cardElement({
          id: item.card.id,
          typeId: item.typeId,
          face: item.face,
          geometry: item.geometry,
          html: item.html,
          includeBleed: flags.bleed,
          rounded: flags.rounded,
          guides: flags.guides,
        });
        return `<figure class="ddp-cell"><div class="dd-shot" style="width:${frame.widthPx}px;height:${frame.heightPx}px"><div class="dd-zoom" style="zoom:${frame.zoom}">${card}</div></div><figcaption class="ddp-label">${escapeHtml(item.card.id)} <span>${item.face}</span></figcaption></figure>`;
      })
      .join('\n');

    send(
      res,
      MIME['.html'] as string,
      htmlDocument({
        title: `${snapshot.project.name} preview`,
        fonts: snapshot.project.fonts,
        css: collectCss(snapshot.project, [...new Set(composed.map((c) => c.typeId))]),
        body,
        background: 'transparent',
        pageCss: GALLERY_CSS,
      }),
    );
  }

  async function sendFile(res: http.ServerResponse, route: string): Promise<void> {
    const abs = path.resolve(options.root, `.${route}`);
    if (!isSubPath(options.root, abs)) {
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
    res.setHeader('cache-control', 'no-store');
    fs.createReadStream(abs).pipe(res);
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('preview server failed to bind');

  return {
    url: `http://${options.host}:${address.port}`,
    notify() {
      for (const client of clients) client.write('event: reload\ndata: 1\n\n');
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of clients) client.end();
        clients.clear();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

function select(cards: readonly Card[], url: URL): Card[] {
  const type = url.searchParams.get('type');
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  return cards.filter((card) => {
    if (type && card.type !== type) return false;
    if (search && !card.id.toLowerCase().includes(search)) return false;
    return true;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function describe(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : 'preview/error';
  return { code, message };
}

/** Chrome that lives inside the frame. Namespaced so a deck cannot inherit it. */
const GALLERY_CSS = `
html, body { background: #8a8d93; }
body { padding: 20px; display: flex; flex-wrap: wrap; gap: 20px; align-content: flex-start; }
.ddp-cell { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ddp-cell .dd-shot { box-shadow: 0 1px 3px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.18); }
.ddp-label {
  all: initial;
  font: 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #22242a;
  background: rgba(255,255,255,.55);
  padding: 3px 6px;
  border-radius: 4px;
}
.ddp-label span { opacity: .55; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#8a8d93;
font:14px/1.5 ui-sans-serif,system-ui,sans-serif;color:#1b1d22}
.card{max-width:60ch;background:#fff;border-radius:10px;padding:20px 24px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
h1{margin:0 0 8px;font-size:15px}
code{font:12px ui-monospace,Menlo,monospace;color:#666}
pre{white-space:pre-wrap;margin:8px 0 0;font:12px/1.5 ui-monospace,Menlo,monospace}
</style></head><body><div class="card">${body}</div></body></html>`;
}

function errorPage(error: { code: string; message: string }): string {
  return shell(
    'error',
    `<h1>The project did not load</h1><code>${escapeHtml(error.code)}</code><pre>${escapeHtml(error.message)}</pre>`,
  );
}

function emptyPage(): string {
  return shell('nothing to show', '<h1>No components match the filter</h1>');
}
