import fs from 'node:fs';
import path from 'node:path';
import { findProjectFile } from '@deck-designer/core';
import type { CommandResult, Reporter } from '../output.js';
import { buildCommand, type BuildOptions } from './build.js';

export interface WatchOptions extends BuildOptions {
  debounce?: number;
}

const IGNORED = new Set(['node_modules', '.git', 'dist', 'out']);

/**
 * Rebuilds on change. Deliberately a plain rebuild rather than an incremental
 * one: a deck is small enough that a full pass is fast, and partial state is
 * where card tools usually start producing stale output.
 */
export async function watchCommand(options: WatchOptions, reporter: Reporter): Promise<CommandResult> {
  const configPath = await findProjectFile(path.resolve(options.project ?? process.cwd()));
  if (!configPath) throw new Error('No deck.yaml found; run `deck init` first.');
  const root = path.dirname(configPath);

  let running = false;
  let queued = false;
  let timer: NodeJS.Timeout | null = null;

  const build = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const result = await buildCommand(options, reporter);
      reporter.diagnostics(result.diagnostics ?? []);
    } catch (error) {
      reporter.failure('watch', error);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void build();
      }
    }
  };

  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const segments = filename.split(path.sep);
    if (segments.some((s) => IGNORED.has(s))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      reporter.step(`Changed: ${filename}`);
      void build();
    }, options.debounce ?? 120);
  });

  reporter.info(`Watching ${root} (ctrl-c to stop)`);
  await build();

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      watcher.close();
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

  return { data: { watched: root } };
}
