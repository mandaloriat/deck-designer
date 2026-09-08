import { loadProject, type Diagnostic } from '@deck-designer/core';
import { resolveChromiumPath } from '@deck-designer/render';
import type { CommandResult, Reporter } from '../output.js';

export interface DoctorOptions {
  project?: string;
}

/** Environment check: answers "why did this fail on your machine and not mine". */
export async function doctorCommand(options: DoctorOptions, reporter: Reporter): Promise<CommandResult> {
  const diagnostics: Diagnostic[] = [];
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  const nodeOk = Number(process.versions.node.split('.')[0]) >= 20;
  checks.push({ name: 'node', ok: nodeOk, detail: process.versions.node });
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
    checks.push({ name: 'chromium', ok: true, detail: chromium });
  } catch (error) {
    checks.push({ name: 'chromium', ok: false, detail: (error as Error).message.split('\n')[0] ?? '' });
    diagnostics.push({
      severity: 'error',
      code: 'doctor/chromium',
      message: 'No Chromium binary found; PNG and PDF export will fail.',
      hint: 'Run `npx playwright install chromium`, or set DECK_CHROMIUM_PATH.',
    });
  }

  try {
    const project = await loadProject(options.project ? { cwd: options.project } : {});
    checks.push({ name: 'project', ok: true, detail: project.configPath });
    checks.push({
      name: 'fonts',
      ok: true,
      detail: project.fonts.length === 0 ? 'none vendored (system fallbacks in use)' : `${project.fonts.length} vendored`,
    });
    if (project.fonts.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'doctor/system-fonts',
        message: 'No fonts are vendored into the project.',
        hint: 'Output will depend on the host font stack. Add files under fonts/ and declare them in deck.yaml.',
      });
    }
  } catch (error) {
    checks.push({ name: 'project', ok: false, detail: (error as Error).message });
  }

  reporter.table([
    ['CHECK', 'STATUS', 'DETAIL'],
    ...checks.map((c) => [c.name, c.ok ? 'ok' : 'fail', c.detail]),
  ]);

  return { data: { checks, chromium }, diagnostics };
}
