import fs from 'node:fs';
import path from 'node:path';
import { findProjectFile } from '@deck-designer/core';
import type { CommandResult, Reporter } from '../output.js';
import { startPreviewServer } from '../preview/server.js';

export interface PreviewOptions {
  project?: string;
  port?: number;
  host?: string;
  debounce?: number;
}

const IGNORED = new Set(['node_modules', '.git', 'dist', 'out']);

/**
 * A live view of the deck, in a browser, reloading on save. It renders the same
 * document the exporter does, so it is a preview rather than an impression.
 */
export async function previewCommand(options: PreviewOptions, reporter: Reporter): Promise<CommandResult> {
  const configPath = await findProjectFile(path.resolve(options.project ?? process.cwd()));
  if (!configPath) throw new Error('No deck.yaml found; run `deck init` first.');
  const root = path.dirname(configPath);

  const host = options.host ?? '127.0.0.1';
  const server = await startPreviewServer({ root, host, port: options.port ?? 4321 });

  if (host !== '127.0.0.1' && host !== 'localhost') {
    reporter.step(`Listening on ${host}: the project directory is readable by anyone who can reach this port.`);
  }

  let timer: NodeJS.Timeout | null = null;
  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (filename.split(path.sep).some((segment) => IGNORED.has(segment))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      reporter.step(`Changed: ${filename}`);
      server.notify();
    }, options.debounce ?? 120);
  });

  reporter.info(`Preview running at ${server.url}`);
  reporter.info('Watching for changes. Ctrl-C to stop.');

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      watcher.close();
      void server.close().then(resolve);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

  return { data: { url: server.url, root } };
}
