import {
  composeCards,
  loadProject,
  resolveCards,
  resolveTheme,
  type Card,
  type ComposedCard,
  type Diagnostic,
  type Face,
  type Project,
} from '@deck-designer/core';

export interface SelectionOptions {
  project?: string;
  type?: string[];
  id?: string[];
  where?: string[];
  limit?: number;
  face?: string[];
}

export interface Prepared {
  project: Project;
  cards: Card[];
  diagnostics: Diagnostic[];
}

export async function prepare(options: SelectionOptions, checkAssets = true): Promise<Prepared> {
  const project = await loadProject(options.project ? { cwd: options.project } : {});
  const { cards, diagnostics } = await resolveCards(project, {
    checkAssets,
    ...(options.type?.length ? { types: options.type } : {}),
  });
  // Theme knobs are checked here rather than only in the preview: a typo in
  // `theme:` should fail `deck validate` in CI, not wait to be noticed as a
  // control that never appeared.
  return {
    project,
    cards: filterCards(cards, options),
    diagnostics: [...diagnostics, ...resolveTheme(project).diagnostics],
  };
}

export function filterCards(cards: readonly Card[], options: SelectionOptions): Card[] {
  let out = [...cards];

  if (options.type?.length) {
    const wanted = new Set(options.type);
    out = out.filter((card) => wanted.has(card.type));
  }
  if (options.id?.length) {
    const wanted = new Set(options.id);
    out = out.filter((card) => wanted.has(card.id));
  }
  for (const clause of options.where ?? []) {
    const eq = clause.indexOf('=');
    if (eq < 1) throw new Error(`Invalid --where clause: ${clause} (expected field=value)`);
    const field = clause.slice(0, eq).trim();
    const value = clause.slice(eq + 1).trim();
    out = out.filter((card) => String(card.values[field] ?? '') === value);
  }
  if (options.limit !== undefined && options.limit > 0) out = out.slice(0, options.limit);
  return out;
}

export function facesFrom(options: SelectionOptions): Face[] {
  const raw = options.face?.length ? options.face : ['front', 'back'];
  const faces = raw.filter((f): f is Face => f === 'front' || f === 'back');
  if (faces.length === 0) throw new Error('--face accepts "front" and/or "back"');
  return faces;
}

export async function compose(
  project: Project,
  cards: readonly Card[],
  faces: readonly Face[],
): Promise<ComposedCard[]> {
  return composeCards(project, cards, { faces });
}
