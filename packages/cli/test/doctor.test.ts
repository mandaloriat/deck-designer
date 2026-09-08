import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { doctorCommand } from '../src/commands/doctor.js';
import { Reporter } from '../src/output.js';
import type { Diagnostic } from '@deck-designer/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../examples/briscola');
const reporter = new Reporter({ json: false, quiet: true, color: false });

interface Check {
  name: string;
  status: string;
  detail: string;
}

async function doctor(project?: string): Promise<{ checks: Check[]; diagnostics: Diagnostic[] }> {
  const result = await doctorCommand(project === undefined ? {} : { project }, reporter);
  return {
    checks: (result.data as { checks: Check[] }).checks,
    diagnostics: result.diagnostics ?? [],
  };
}

function find(checks: Check[], name: string): Check | undefined {
  return checks.find((check) => check.name === name);
}

describe('doctor', () => {
  it('does not call a missing project a failure when none was asked for', async () => {
    // The tool's own repository has no deck.yaml, and checking the toolchain
    // from there is the command's main use. It used to report "fail".
    const cwd = process.cwd();
    process.chdir(await fs.mkdtemp(path.join(os.tmpdir(), 'deck-doctor-')));
    try {
      const { checks, diagnostics } = await doctor();
      expect(find(checks, 'project')?.status).toBe('none');
      expect(diagnostics.some((d) => d.code === 'doctor/project')).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });

  it('does call it a failure when a project was named and is not there', async () => {
    const { checks, diagnostics } = await doctor(path.join(os.tmpdir(), 'deck-does-not-exist'));
    expect(find(checks, 'project')?.status).toBe('fail');
    expect(diagnostics.some((d) => d.code === 'doctor/project' && d.severity === 'error')).toBe(true);
  });

  it('reports a real project and its vendored fonts', async () => {
    const { checks, diagnostics } = await doctor(EXAMPLE);
    expect(find(checks, 'project')?.status).toBe('ok');
    expect(find(checks, 'fonts')?.detail).toBe('1 vendored');
    expect(diagnostics.some((d) => d.code === 'doctor/system-fonts')).toBe(false);
  });

  it('points at the pinned playwright rather than a floating npx one', async () => {
    const { diagnostics } = await doctor(EXAMPLE);
    const chromium = diagnostics.find((d) => d.code === 'doctor/chromium');
    // Only asserted when this machine has no browser; where one exists the
    // check passes and there is nothing to hint about.
    if (chromium) expect(chromium.hint).toContain('pnpm exec playwright install chromium');
  });
});
