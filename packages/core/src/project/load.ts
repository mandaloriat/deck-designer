import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { projectSchema, type ProjectConfig } from '../schema/project.js';
import { DeckError } from '../util/errors.js';
import { isSubPath, projectRelative, resolveInProject } from '../util/paths.js';
import { parseLength, type Unit } from '../util/units.js';
import type { Geometry, Project, ResolvedCardType, ResolvedFont } from './model.js';

export const CONFIG_FILENAMES = ['deck.yaml', 'deck.yml', 'deck.json'] as const;

/** Walks up from `start` looking for a project config. */
export async function findProjectFile(start: string): Promise<string | null> {
  let dir = path.resolve(start);
  for (;;) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.join(dir, name);
      if (await exists(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function parseConfig(source: string, filename: string): ProjectConfig {
  let data: unknown;
  try {
    data = filename.endsWith('.json') ? JSON.parse(source) : YAML.parse(source);
  } catch (cause) {
    throw new DeckError(`Cannot parse ${path.basename(filename)}: ${(cause as Error).message}`, {
      code: 'config/parse',
      cause,
    });
  }
  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) {
    throw new DeckError(`Invalid ${path.basename(filename)}`, {
      code: 'config/invalid',
      diagnostics: zodDiagnostics(parsed.error, projectRelativeOrName(filename)),
    });
  }
  return parsed.data;
}

function projectRelativeOrName(filename: string): string {
  return path.basename(filename);
}

export function zodDiagnostics(error: z.ZodError, file?: string) {
  return error.issues.map((issue) => ({
    severity: 'error' as const,
    code: 'config/invalid',
    message: `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`,
    ...(file ? { file } : {}),
  }));
}

function geometryFrom(
  units: Unit,
  base: { width: number; height: number; bleed: number; safe: number; cornerRadius: number } | null,
  raw: Partial<Record<'width' | 'height' | 'bleed' | 'safe' | 'cornerRadius', number | string>> | undefined,
): Geometry {
  const pick = (key: 'width' | 'height' | 'bleed' | 'safe' | 'cornerRadius', fallback: number | null): number => {
    const value = raw?.[key];
    if (value !== undefined) return parseLength(value, units);
    if (fallback !== null) return fallback;
    throw new DeckError(`Missing card.${key}`, { code: 'config/invalid' });
  };
  return {
    width: pick('width', base?.width ?? null),
    height: pick('height', base?.height ?? null),
    bleed: pick('bleed', base?.bleed ?? 0),
    safe: pick('safe', base?.safe ?? 0),
    cornerRadius: pick('cornerRadius', base?.cornerRadius ?? 0),
  };
}

async function readText(root: string, relative: string, kind: string): Promise<string> {
  const abs = resolveInProject(root, relative);
  try {
    return await fs.readFile(abs, 'utf8');
  } catch (cause) {
    throw new DeckError(`Missing ${kind}: ${relative}`, { code: 'config/missing-file', cause });
  }
}

/** Builds the `[[token]]` lookup table by listing the icons directory once. */
async function discoverIcons(
  root: string,
  dir: string,
  extensions: readonly string[],
): Promise<Record<string, string>> {
  const abs = path.resolve(root, dir);
  if (!isSubPath(root, abs)) return {};
  let entries: string[];
  try {
    entries = await fs.readdir(abs);
  } catch {
    return {};
  }
  const allowed = new Set(extensions.map((e) => `.${e.replace(/^\./, '').toLowerCase()}`));
  const icons: Record<string, string> = {};
  for (const entry of entries.sort()) {
    const ext = path.extname(entry).toLowerCase();
    if (!allowed.has(ext)) continue;
    const name = entry.slice(0, -ext.length);
    if (icons[name] === undefined) icons[name] = `/${projectRelative(root, path.join(abs, entry))}`;
  }
  return icons;
}

export interface LoadOptions {
  /** Directory or config file. Defaults to the current working directory. */
  cwd?: string;
}

export async function loadProject(options: LoadOptions = {}): Promise<Project> {
  const start = path.resolve(options.cwd ?? process.cwd());
  const stat = await fs.stat(start).catch(() => null);
  if (!stat) throw new DeckError(`No such path: ${start}`, { code: 'config/not-found' });

  const configPath = stat.isFile() ? start : await findProjectFile(start);
  if (!configPath) {
    throw new DeckError(`No deck.yaml found in ${start} or any parent directory`, {
      code: 'config/not-found',
      diagnostics: [
        {
          severity: 'error',
          code: 'config/not-found',
          message: 'No project configuration found.',
          hint: 'Run `deck init` to create one.',
        },
      ],
    });
  }

  const root = path.dirname(configPath);
  const config = parseConfig(await fs.readFile(configPath, 'utf8'), configPath);
  const units = config.units as Unit;
  const geometry = geometryFrom(units, null, config.card);

  const fonts: ResolvedFont[] = [];
  for (const font of config.fonts) {
    if (/^[a-z]+:\/\//i.test(font.src)) {
      throw new DeckError(`Remote font sources are not allowed: ${font.src}`, {
        code: 'config/remote-font',
        diagnostics: [
          {
            severity: 'error',
            code: 'config/remote-font',
            message: `Font "${font.family}" points at a remote URL.`,
            hint: 'Vendor the font file into the project so builds are reproducible offline.',
          },
        ],
      });
    }
    const abs = resolveInProject(root, font.src);
    if (!(await exists(abs))) {
      throw new DeckError(`Missing font file: ${font.src}`, { code: 'config/missing-file' });
    }
    fonts.push({
      family: font.family,
      path: abs,
      url: `/${projectRelative(root, abs)}`,
      weight: String(font.weight ?? 400),
      style: font.style ?? 'normal',
      display: font.display ?? 'block',
    });
  }

  const icons = await discoverIcons(root, config.icons.dir, config.icons.extensions);

  const styleSources: Record<string, string> = {};
  const loadStyle = async (rel: string): Promise<string> => {
    const abs = resolveInProject(root, rel);
    if (styleSources[abs] === undefined) styleSources[abs] = await readText(root, rel, 'stylesheet');
    return abs;
  };

  const globalStylePaths: string[] = [];
  for (const rel of config.styles) globalStylePaths.push(await loadStyle(rel));

  const seen = new Set<string>();
  const cardTypes: ResolvedCardType[] = [];
  for (const raw of config.cardTypes) {
    if (seen.has(raw.id)) {
      throw new DeckError(`Duplicate card type id: ${raw.id}`, { code: 'config/duplicate-card-type' });
    }
    seen.add(raw.id);

    const typeStylePaths: string[] = [];
    for (const rel of raw.styles) typeStylePaths.push(await loadStyle(rel));
    const stylePaths = [...globalStylePaths, ...typeStylePaths];

    const dataPaths = (raw.data === undefined ? [] : Array.isArray(raw.data) ? raw.data : [raw.data]).map((rel) =>
      resolveInProject(root, rel),
    );

    cardTypes.push({
      id: raw.id,
      name: raw.name ?? raw.id,
      geometry: geometryFrom(units, geometry, raw.card),
      fields: raw.fields,
      defaults: raw.defaults,
      templatePath: resolveInProject(root, raw.template),
      templateSource: await readText(root, raw.template, 'template'),
      ...(raw.back
        ? { backPath: resolveInProject(root, raw.back), backSource: await readText(root, raw.back, 'back template') }
        : {}),
      stylePaths,
      css: stylePaths
        .map((p) => `/* ${projectRelative(root, p)} */\n${styleSources[p] ?? ''}`)
        .join('\n\n'),
      dataPaths,
      inlineRows: raw.cards ?? [],
    });
  }

  return {
    root,
    configPath,
    name: config.name,
    ...(config.description ? { description: config.description } : {}),
    units,
    geometry,
    render: config.render,
    fonts,
    outputDir: path.resolve(root, config.output.dir),
    profiles: config.profiles,
    icons,
    styleSources,
    cardTypes,
    raw: config,
  };
}
