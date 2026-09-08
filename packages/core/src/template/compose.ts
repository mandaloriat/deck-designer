import type { Liquid } from 'liquidjs';
import type { Card, Geometry, Project } from '../project/model.js';
import { findCardType } from '../project/model.js';
import { DeckError } from '../util/errors.js';
import { projectRelative } from '../util/paths.js';
import { buildContext, createEngine, renderTemplate, type Face } from './engine.js';

export interface ComposedCard {
  card: Card;
  face: Face;
  typeId: string;
  geometry: Geometry;
  /** Inner markup, to be placed inside `.dd-trim`. */
  html: string;
}

export interface ComposeOptions {
  faces?: readonly Face[];
  engine?: Liquid;
}

/**
 * Turns resolved cards into markup. Kept separate from rendering so template
 * output can be diffed, cached and unit-tested without starting a browser.
 */
export async function composeCards(
  project: Project,
  cards: readonly Card[],
  options: ComposeOptions = {},
): Promise<ComposedCard[]> {
  const engine = options.engine ?? createEngine(project);
  const faces = options.faces ?? ['front'];
  const out: ComposedCard[] = [];

  for (const card of cards) {
    const type = findCardType(project, card.type);
    if (!type) throw new DeckError(`Unknown card type "${card.type}"`, { code: 'deck/unknown-type' });

    for (const face of faces) {
      const source = face === 'front' ? type.templateSource : type.backSource;
      const templatePath = face === 'front' ? type.templatePath : type.backPath;
      if (source === undefined || templatePath === undefined) continue;

      const html = await renderTemplate(
        engine,
        source,
        templatePath,
        buildContext(project, type, card, { face }),
      );
      out.push({ card, face, typeId: type.id, geometry: type.geometry, html });
    }
  }
  return out;
}

/** Stylesheets that apply to the given card types, deduped and in project order. */
export function collectCss(project: Project, typeIds?: readonly string[]): string {
  const wanted = typeIds ? new Set(typeIds) : null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const type of project.cardTypes) {
    if (wanted && !wanted.has(type.id)) continue;
    for (const p of type.stylePaths) {
      if (seen.has(p)) continue;
      seen.add(p);
      parts.push(`/* ${projectRelative(project.root, p)} */\n${project.styleSources[p] ?? ''}`);
    }
  }
  return parts.join('\n\n');
}
