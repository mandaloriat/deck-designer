import path from 'node:path';
import { Liquid } from 'liquidjs';
import type { Card, Project, ResolvedCardType } from '../project/model.js';
import { renderRichText, slugify } from '../util/html.js';
import { cssMm, round } from '../util/units.js';
import { DeckError } from '../util/errors.js';

export type Face = 'front' | 'back';

/**
 * Liquid rather than raw string interpolation or a JS-evaluating engine: the
 * template language is sandboxed by construction, so a deck cloned from an
 * untrusted repository cannot execute code during a build.
 */
export function createEngine(project: Project): Liquid {
  const roots = [
    path.join(project.root, 'templates'),
    path.join(project.root, 'templates', 'partials'),
    project.root,
  ];

  const engine = new Liquid({
    root: roots,
    extname: '.liquid',
    cache: true,
    strictFilters: true,
    strictVariables: project.render.strict,
    jsTruthy: true,
    ownPropertyOnly: true,
    relativeReference: false,
  });

  engine.registerFilter('asset', (value: unknown) => {
    if (value === null || value === undefined || value === '') return '';
    return `/${String(value).replace(/^\/+/, '')}`;
  });

  engine.registerFilter('icon', (value: unknown) => project.icons[String(value)] ?? '');

  engine.registerFilter('rich', (value: unknown) =>
    renderRichText(String(value ?? ''), { resolveIcon: (name) => project.icons[name] ?? null }),
  );

  engine.registerFilter('mm', (value: unknown) => cssMm(Number(value) || 0));

  engine.registerFilter('slug', (value: unknown) => slugify(String(value ?? '')));

  engine.registerFilter('pad', (value: unknown, width: unknown = 2, fill: unknown = '0') =>
    String(value ?? '').padStart(Number(width) || 0, String(fill)),
  );

  engine.registerFilter('repeat', (value: unknown, times: unknown = 1) =>
    String(value ?? '').repeat(Math.max(0, Math.trunc(Number(times) || 0))),
  );

  engine.registerFilter('round', (value: unknown, decimals: unknown = 0) =>
    round(Number(value) || 0, Number(decimals) || 0),
  );

  engine.registerFilter('json', (value: unknown) => JSON.stringify(value));

  return engine;
}

export interface RenderContextOptions {
  face: Face;
  /** Index within the current print run, when rendering an imposed sheet. */
  sequence?: number;
}

export function buildContext(
  project: Project,
  type: ResolvedCardType,
  card: Card,
  options: RenderContextOptions,
): Record<string, unknown> {
  const g = type.geometry;
  return {
    card: {
      ...card.view,
      id: card.id,
      type: card.type,
      index: card.index,
      copies: card.copies,
      /** Unescaped values, for arithmetic and comparisons. */
      raw: card.values,
    },
    deck: {
      name: project.name,
      description: project.description ?? '',
      units: project.units,
    },
    type: { id: type.id, name: type.name },
    face: options.face,
    sequence: options.sequence ?? card.index,
    geometry: {
      width: g.width,
      height: g.height,
      bleed: g.bleed,
      safe: g.safe,
      cornerRadius: g.cornerRadius,
    },
    icons: project.icons,
  };
}

export async function renderTemplate(
  engine: Liquid,
  source: string,
  templatePath: string,
  context: Record<string, unknown>,
): Promise<string> {
  try {
    return await engine.parseAndRender(source, context);
  } catch (cause) {
    throw new DeckError(`Template error in ${path.basename(templatePath)}: ${(cause as Error).message}`, {
      code: 'template/render',
      cause,
    });
  }
}
