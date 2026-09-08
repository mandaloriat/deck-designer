import type { Project } from '../project/model.js';
import { diag, type Diagnostic } from '../util/errors.js';
import { projectRelative } from '../util/paths.js';
import { classify, countDeclarations, labelFor, readVariable, type ThemeVariable } from './variables.js';

export interface ResolvedTheme {
  variables: ThemeVariable[];
  diagnostics: Diagnostic[];
}

/**
 * Every stylesheet the project loads, in cascade order: the global ones first,
 * then each card type's own. Later wins, which is what the browser will do too.
 */
function stylesheetsInOrder(project: Project): string[] {
  return [...new Set(project.cardTypes.flatMap((type) => type.stylePaths))];
}

/**
 * Matches each declared knob to the stylesheet that actually sets it, and to
 * the value it currently holds. A knob nothing declares is reported rather than
 * silently dropped: a typo in `theme:` would otherwise just make a control
 * vanish, which is the hardest kind of mistake to notice.
 */
export function resolveTheme(project: Project): ResolvedTheme {
  const diagnostics: Diagnostic[] = [];
  const variables: ThemeVariable[] = [];
  const sheets = stylesheetsInOrder(project);

  for (const entry of project.raw.theme) {
    const declaring = sheets.filter((sheet) => readVariable(project.styleSources[sheet] ?? '', entry.name) !== undefined);
    const winner = declaring[declaring.length - 1];
    if (winner === undefined) {
      diagnostics.push(
        diag('warning', 'theme/not-declared', `theme: ${entry.name} is not declared by any stylesheet.`, {
          file: projectRelative(project.root, project.configPath),
          hint: 'Declare it in a stylesheet the deck loads, usually on :root.',
        }),
      );
      continue;
    }

    const css = project.styleSources[winner] ?? '';
    const file = projectRelative(project.root, winner);
    // Editing writes the first declaration, so a knob with several of them
    // would appear to do nothing whenever a later one shadows the one written.
    if (countDeclarations(css, entry.name) > 1) {
      diagnostics.push(
        diag('warning', 'theme/duplicate', `theme: ${entry.name} is declared more than once in ${file}.`, {
          file,
          hint: 'Keep one declaration, or the panel will edit the wrong one.',
        }),
      );
    }
    if (declaring.length > 1) {
      const others = declaring.slice(0, -1).map((sheet) => projectRelative(project.root, sheet));
      diagnostics.push(
        diag('warning', 'theme/shadowed', `theme: ${entry.name} is also declared in ${others.join(', ')}.`, {
          file,
          hint: `The panel edits ${file}, the declaration the cascade uses.`,
        }),
      );
    }

    const value = readVariable(css, entry.name) as string;
    const { kind, unit } = classify(value);
    // A slider needs both ends. One alone would silently become a range of
    // zero to something, which is worse than the number field it replaced.
    const ranged = entry.min !== undefined && entry.max !== undefined && (kind === 'length' || kind === 'number');
    if (!ranged && (entry.min !== undefined || entry.max !== undefined)) {
      diagnostics.push(
        diag('warning', 'theme/bad-range', `theme: ${entry.name} needs both min and max on a numeric value to show a slider.`, {
          file: projectRelative(project.root, project.configPath),
        }),
      );
    }

    variables.push({
      name: entry.name,
      label: entry.label ?? labelFor(entry.name),
      value,
      kind,
      ...(unit ? { unit } : {}),
      ...(ranged ? { min: entry.min as number, max: entry.max as number } : {}),
      file,
    });
  }

  return { variables, diagnostics };
}
