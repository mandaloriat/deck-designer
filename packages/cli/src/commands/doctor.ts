import { DeckError, loadProject, type Diagnostic } from '@deck-designer/core';
import { resolveChromiumPath } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';

export interface DoctorOptions {
  project?: string;
}

/** `none` is not a failure: some checks only apply inside a project. */
type CheckStatus = 'ok' | 'fail' | 'none';

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

/** Environment check: answers "why did this fail on your machine and not mine". */
export async function doctorCommand(options: DoctorOptions, reporter: Reporter): Promise<CommandResult> {
  const diagnostics: Diagnostic[] = [];
  const checks: Check[] = [];

  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  checks.push({ name: 'node', status: nodeOk ? 'ok' : 'fail', detail: process.versions.node });
  if (!nodeOk) {
    diagnostics.push({
      severity: 'error',
      code: 'doctor/node',
      message: `Node ${process.versions.node} is too old; 20.11 or newer is required.`,
    });
  }

  let chromium = '';
  try {
    chromium = resolveChromiumPath();
    checks.push({ name: 'chromium', status: 'ok', detail: chromium });
  } catch (error) {
    checks.push({ name: 'chromium', status: 'fail', detail: (error as Error).message.split('\n')[0] ?? '' });
    diagnostics.push({
      severity: 'error',
      code: 'doctor/chromium',
      message: 'No Chromium binary found; image export will fail.',
      // `pnpm exec`, not `npx`: it uses the playwright this repo pins, so the
      // browser revision matches the playwright-core the renderer resolves
      // against. A different version installs a revision it will not find.
      hint:
        'Run `pnpm exec playwright install chromium` from the repository root, ' +
        'or set DECK_CHROMIUM_PATH to a Chrome or Chromium you already have.',
    });
  }

  await checkProject(options, checks, diagnostics);

  reporter.table([['CHECK', 'STATUS', 'DETAIL'], ...checks.map((c) => [c.name, c.status, c.detail])]);

  return { data: { checks, chromium }, diagnostics };
}

async function checkProject(
  options: DoctorOptions,
  checks: Check[],
  diagnostics: Diagnostic[],
): Promise<void> {
  try {
    const project = await loadProject(options.project ? { cwd: options.project } : {});
    checks.push({ name: 'project', status: 'ok', detail: project.configPath });
    checks.push({
      name: 'fonts',
      status: 'ok',
      detail:
        project.fonts.length === 0
          ? 'none vendored (system fallbacks in use)'
          : `${project.fonts.length} vendored`,
    });
    if (project.fonts.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'doctor/system-fonts',
        message: 'No fonts are vendored into the project.',
        hint: 'Output will depend on the host font stack. Add files under fonts/ and declare them in deck.yaml.',
      });
    }
    return;
  } catch (error) {
    // Running doctor outside a project is a normal thing to do: the toolchain
    // checks above are the point, and this repository has no deck.yaml of its
    // own. Only an explicit --project, or a project that exists but will not
    // load, is a failure.
    const missing = error instanceof DeckError && error.code === 'config/not-found';
    if (missing && options.project === undefined) {
      checks.push({
        name: 'project',
        status: 'none',
        detail: 'not inside a project; pass --project to check one',
      });
      return;
    }

    checks.push({ name: 'project', status: 'fail', detail: (error as Error).message.split('\n')[0] ?? '' });
    diagnostics.push({
      severity: 'error',
      code: 'doctor/project',
      message: (error as Error).message,
      ...(missing ? { hint: 'Check the path, or run `deck init` to create a project there.' } : {}),
    });
  }
}
