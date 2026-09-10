import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveChromiumPath } from '@deck-designer/render';
import { startPreviewServer, type PreviewServer } from '../src/preview/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/briscola');

let chromiumAvailable = true;
try {
  resolveChromiumPath();
} catch {
  chromiumAvailable = false;
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function post(server: PreviewServer, payload: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const response = await fetch(`${server.url}/__preview/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('preview export', () => {
  let root: string;
  let server: PreviewServer;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-export-'));
    await fs.cp(EXAMPLE, root, { recursive: true });
    server = await startPreviewServer({ root, host: '127.0.0.1', port: 0 });
  }, 60_000);

  afterAll(async () => {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  const cards = path.join('dist', 'cards', 'card');

  it('reports whether exporting is possible, so the button can say why not', async () => {
    const state = (await (await fetch(`${server.url}/__preview/state`)).json()) as {
      exportable: { ok: boolean; reason?: string };
    };
    expect(state.exportable.ok).toBe(chromiumAvailable);
    if (!chromiumAvailable) expect(state.exportable.reason).toBeTruthy();
  });

  it.runIf(chromiumAvailable)(
    'writes the current selection into the project output directory',
    async () => {
      const reply = await post(server, { search: 'denari-01', faces: 'front', bleed: true });
      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({ out: 'dist/cards', files: 1, dpi: 300 });

      const written = await fs.readdir(path.join(root, cards));
      expect(written).toEqual(['denari-01.front.png']);
      // 58+6mm wide at 300dpi, so the bleed flag reached the renderer.
      const png = await fs.readFile(path.join(root, cards, 'denari-01.front.png'));
      expect(png.readUInt32BE(16)).toBe(756);
    },
    120_000,
  );

  it.runIf(chromiumAvailable)(
    'never bakes the guide overlay into the files',
    async () => {
      // Guides are an inspection aid. A crop mark reaching a print file because
      // a checkbox was left on in the viewer is found far too late to be cheap.
      const plain = path.join(root, cards, 'denari-02.front.png');
      await post(server, { search: 'denari-02', faces: 'front' });
      const without = await fs.readFile(plain);

      await post(server, { search: 'denari-02', faces: 'front', guides: true });
      expect(await fs.readFile(plain)).toEqual(without);
    },
    120_000,
  );

  it.runIf(chromiumAvailable)(
    'refuses a second export while one is running',
    async () => {
      const both = await Promise.all([
        post(server, { search: 'spade-07', faces: 'front' }),
        post(server, { search: 'spade-07', faces: 'front' }),
      ]);
      const statuses = both.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);
      expect(both.find((r) => r.status === 409)?.body.error).toMatchObject({ code: 'preview/export-busy' });
    },
    120_000,
  );

  it('refuses when the filter matches nothing, instead of writing an empty directory', async () => {
    const reply = await post(server, { search: 'no-such-card' });
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatchObject({ code: 'select/empty' });
  });

  it('refuses a body that is not JSON, and a foreign origin', async () => {
    const plain = await fetch(`${server.url}/__preview/export`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(plain.status).toBe(415);

    const foreign = await post(server, {}, { origin: 'http://evil.example' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error).toMatchObject({ code: 'preview/origin' });
  });

  it('rejects GET on the export route', async () => {
    expect((await fetch(`${server.url}/__preview/export`)).status).toBe(405);
  });
});

describe('preview export off loopback', () => {
  let root: string;
  let server: PreviewServer;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-export-net-'));
    await fs.cp(EXAMPLE, root, { recursive: true });
    server = await startPreviewServer({ root, host: '0.0.0.0', port: 0 });
  });

  afterAll(async () => {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('will not render to disk when anyone on the network could have asked', async () => {
    const state = (await (await fetch(`${server.url}/__preview/state`)).json()) as {
      exportable: { ok: boolean };
    };
    expect(state.exportable.ok).toBe(false);

    const reply = await post(server, { faces: 'front' });
    expect(reply.status).toBe(403);
    expect(reply.body.error).toMatchObject({ code: 'preview/not-loopback' });
    await expect(fs.readdir(path.join(root, 'dist'))).rejects.toThrow();
  });
});
