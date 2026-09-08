import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPreviewServer, type PreviewServer } from '../src/preview/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/briscola');

interface Reply {
  status: number;
  body: Record<string, unknown>;
}

async function post(server: PreviewServer, payload: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const response = await fetch(`${server.url}/__preview/theme`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('theme endpoint', () => {
  let root: string;
  let server: PreviewServer;

  beforeAll(async () => {
    // A copy: these tests write CSS, and the example is the documentation.
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-theme-'));
    await fs.cp(EXAMPLE, root, { recursive: true });
    server = await startPreviewServer({ root, host: '127.0.0.1', port: 0 });
  });

  afterAll(async () => {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  const css = (): Promise<string> => fs.readFile(path.join(root, 'templates/base.css'), 'utf8');

  it('lists the declared knobs in the state payload', async () => {
    const state = (await (await fetch(`${server.url}/__preview/state`)).json()) as {
      theme: { name: string; kind: string; file: string }[];
      themeWritable: boolean;
    };
    expect(state.themeWritable).toBe(true);
    expect(state.theme.map((v) => v.name)).toEqual([
      '--ink', '--paper', '--denari', '--coppe', '--spade', '--bastoni', '--frame-inset',
    ]);
    expect(state.theme[0]).toMatchObject({ name: '--ink', kind: 'color', file: 'templates/base.css' });
    expect(state.theme[6]).toMatchObject({ name: '--frame-inset', kind: 'length', unit: 'mm', min: 1, max: 8 });
  });

  it('writes the value into the stylesheet that declares it', async () => {
    const before = await css();
    const reply = await post(server, { name: '--coppe', value: '#123456' });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ name: '--coppe', value: '#123456', file: 'templates/base.css' });

    const after = await css();
    expect(after).toBe(before.replace('#97292f', '#123456'));
    await fs.writeFile(path.join(root, 'templates/base.css'), before);
  });

  it('refuses a property the project does not declare as a knob', async () => {
    // `--dd-card-background` is real CSS in this deck, and still not a knob.
    const reply = await post(server, { name: '--dd-card-background', value: 'red' });
    expect(reply.status).toBe(404);
    expect(reply.body.error).toMatchObject({ code: 'theme/not-declared' });
  });

  it('refuses a value that would break out of the declaration', async () => {
    const before = await css();
    const reply = await post(server, { name: '--ink', value: 'red; position: fixed' });
    expect(reply.status).toBe(400);
    expect(reply.body.error).toMatchObject({ code: 'theme/unsafe-value' });
    expect(await css()).toBe(before);
  });

  it('refuses a body that is not JSON, so a cross-origin form post cannot write', async () => {
    const response = await fetch(`${server.url}/__preview/theme`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ name: '--ink', value: 'red' }),
    });
    expect(response.status).toBe(415);
  });

  it('refuses a write announced from another origin', async () => {
    const reply = await post(server, { name: '--ink', value: '#000000' }, { origin: 'http://evil.example' });
    expect(reply.status).toBe(403);
    expect(reply.body.error).toMatchObject({ code: 'preview/origin' });
  });

  it('rejects GET on the write route', async () => {
    const response = await fetch(`${server.url}/__preview/theme`);
    expect(response.status).toBe(405);
  });
});

describe('theme endpoint off loopback', () => {
  let root: string;
  let server: PreviewServer;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-theme-net-'));
    await fs.cp(EXAMPLE, root, { recursive: true });
    server = await startPreviewServer({ root, host: '0.0.0.0', port: 0 });
  });

  afterAll(async () => {
    await server?.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('will not write when anyone on the network could have asked', async () => {
    const state = (await (await fetch(`${server.url}/__preview/state`)).json()) as { themeWritable: boolean };
    expect(state.themeWritable).toBe(false);

    const reply = await post(server, { name: '--ink', value: '#000000' });
    expect(reply.status).toBe(403);
    expect(reply.body.error).toMatchObject({ code: 'preview/not-loopback' });
  });
});
