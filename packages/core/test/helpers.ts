import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Fixture {
  root: string;
  cleanup(): Promise<void>;
}

/** Writes a throwaway project on disk; the loader is intentionally fs-bound. */
export async function makeProject(files: Record<string, string>): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-test-'));
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
  return { root, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

export const MINIMAL_CONFIG = `version: 1
name: Test Deck
units: mm
card: { width: 63, height: 88, bleed: 3 }
cardTypes:
  - id: unit
    template: templates/unit.liquid
    data: data/units.csv
    fields:
      name: { type: text, required: true }
      cost: { type: integer, default: 0 }
      rarity: { type: enum, values: [common, rare], default: common }
      rules: { type: richtext }
`;

export const MINIMAL_TEMPLATE = `<h1>{{ card.name }}</h1><p>{{ card.rules }}</p>`;
