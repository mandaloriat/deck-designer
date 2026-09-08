import { hasErrors } from '@deck-designer/core';
import type { Reporter, CommandResult } from '../output.js';
import { prepare, type SelectionOptions } from '../select.js';

export interface ValidateOptions extends SelectionOptions {
  /** Treat warnings as errors. */
  strict?: boolean;
  /** Also compile every template, catching syntax errors without a browser. */
  templates?: boolean;
}

export async function validateCommand(options: ValidateOptions, reporter: Reporter): Promise<CommandResult> {
  const { project, cards, diagnostics } = await prepare(options);
  reporter.step(`Loaded ${project.name} from ${project.configPath}`);

  if (options.templates !== false) {
    const { composeCards } = await import('@deck-designer/core');
    await composeCards(project, cards, { faces: ['front', 'back'] });
    reporter.step('Templates compiled');
  }

  const failing = hasErrors(diagnostics) || (options.strict === true && diagnostics.length > 0);

  if (!failing) {
    reporter.info(
      `${project.name}: ${cards.length} card(s) across ${project.cardTypes.length} type(s) - no errors.`,
    );
  }

  return {
    data: {
      project: project.name,
      config: project.configPath,
      cardTypes: project.cardTypes.map((t) => ({
        id: t.id,
        cards: cards.filter((c) => c.type === t.id).length,
        width: t.geometry.width,
        height: t.geometry.height,
        bleed: t.geometry.bleed,
        hasBack: t.backPath !== undefined,
      })),
      cards: cards.length,
      copies: cards.reduce((sum, card) => sum + card.copies, 0),
    },
    diagnostics,
    ...(failing ? { exitCode: 2 } : {}),
  };
}
