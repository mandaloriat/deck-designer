import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPreviewServer, type PreviewServer } from '../src/preview/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/briscola');

async function get(server: PreviewServer, route: string): Promise<{ status: number; body: string }> {
  const response = await fetch(`${server.url}${route}`);
  return { status: response.status, body: await response.text() };
}

describe('preview server', () => {
  let server: PreviewServer;

  beforeAll(async () => {
    // Port 0 lets the OS pick, so the suite never fights a running preview.
    server = await startPreviewServer({ root: EXAMPLE, host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await server?.close();
  });

  it('serves the chrome at the root', async () => {
    const { status, body } = await get(server, '/');
    expect(status).toBe(200);
    expect(body).toContain('deck preview');
  });

  it('reports the project and its diagnostics as JSON', async () => {
    const { body } = await get(server, '/__preview/state');
    const state = JSON.parse(body) as {
      project: string;
      total: number;
      cardTypes: { id: string; count: number }[];
      diagnostics: unknown[];
    };
    expect(state.project).toBe('Briscola');
    expect(state.total).toBe(40);
    expect(state.cardTypes[0]).toMatchObject({ id: 'card', count: 40 });
    expect(state.diagnostics).toEqual([]);
  });

  it('renders the same card markup the exporter composes', async () => {
    const { body } = await get(server, '/__preview/gallery?faces=front&search=denari-01');
    expect(body).toContain('data-card="denari-01"');
    expect(body).toContain('class="dd-card"');
    // 58x88mm at the CSS reference resolution.
    expect(body).toContain('width:219px;height:332px');
  });

  it('applies the bleed and zoom controls to the real geometry', async () => {
    const bleed = await get(server, '/__preview/gallery?faces=front&search=denari-01&bleed=1');
    expect(bleed.body).toContain('width:242px;height:355px');

    const zoomed = await get(server, '/__preview/gallery?faces=front&search=denari-01&zoom=2');
    expect(zoomed.body).toContain('width:438px;height:664px');
  });

  it('filters by id', async () => {
    const filtered = JSON.parse((await get(server, '/__preview/state?search=coppe')).body) as { shown: number };
    expect(filtered.shown).toBe(10);

    const missing = await get(server, '/__preview/gallery?search=nothing-matches-this');
    expect(missing.body).toContain('No components match');
  });

  it('treats a malformed url as a client error, not an internal failure', async () => {
    // decodeURIComponent throws on a stray %, which used to surface as a 500.
    expect((await get(server, '/%25zz%')).status).toBe(400);
  });

  it('asks the state endpoint for the same filter the gallery is showing', async () => {
    // The chrome cannot be unit tested as a page, but the counts in its footer
    // are wrong unless both requests carry the same filter, so pin that here.
    const { body } = await get(server, '/');
    expect(body).toContain('function filterParams()');
    expect(body).toContain('fetch(stateUrl())');
    expect(body).not.toContain("fetch('/__preview/state')");
  });

  it('escapes every part of a diagnostic, not only its message', async () => {
    const { body } = await get(server, '/');
    expect(body).toContain('.filter(Boolean).map(escapeHtml).join');
  });

  it('serves project assets but refuses to escape the project', async () => {
    const asset = await get(server, '/assets/suits/denari.svg');
    expect(asset.status).toBe(200);
    expect(asset.body).toContain('<svg');

    expect((await get(server, '/does-not-exist.png')).status).toBe(404);

    // fetch normalises a plain ../, so the traversal has to be percent-encoded
    // to reach the server at all. This is the one route that exposes a
    // directory over HTTP, so the guard is worth asserting directly.
    expect((await get(server, '/%2e%2e%2f%2e%2e%2fetc%2fpasswd')).status).toBe(403);
  });
});
