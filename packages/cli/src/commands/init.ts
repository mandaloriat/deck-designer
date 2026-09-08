import fs from 'node:fs/promises';
import path from 'node:path';
import type { CommandResult, Reporter } from '../output.js';
import { SCAFFOLD } from '../scaffold/files.js';

export interface InitOptions {
  force?: boolean;
  name?: string;
}

export async function initCommand(
  dir: string | undefined,
  options: InitOptions,
  reporter: Reporter,
): Promise<CommandResult> {
  const target = path.resolve(dir ?? '.');
  await fs.mkdir(target, { recursive: true });

  const existing: string[] = [];
  for (const relative of Object.keys(SCAFFOLD)) {
    if (await exists(path.join(target, relative))) existing.push(relative);
  }
  if (existing.length > 0 && !options.force) {
    return {
      data: { dir: target, existing },
      diagnostics: [
        {
          severity: 'error',
          code: 'init/exists',
          message: `${existing.length} file(s) already exist in ${target}.`,
          hint: 'Re-run with --force to overwrite them.',
        },
      ],
    };
  }

  const written: string[] = [];
  for (const [relative, contents] of Object.entries(SCAFFOLD)) {
    const file = path.join(target, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const body = options.name && relative === 'deck.yaml'
      ? contents.replace('name: Starter Deck', `name: ${options.name}`)
      : contents;
    await fs.writeFile(file, body);
    written.push(relative);
  }

  reporter.info(`Created ${written.length} file(s) in ${target}`);
  reporter.info('Next: deck validate && deck build');
  return { data: { dir: target, files: written } };
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
