# 3. The project is files

Status: accepted

## Context

Browser-based card tools keep the project in IndexedDB and offer import/export
archives. That makes the editor self-contained, and makes everything else hard:
no diff, no merge, no review, no CI, no scripted edit, and one cleared browser
profile from losing the deck.

## Decision

A project is a directory: `deck.yaml`, CSV/YAML data, templates, assets, fonts.
No hidden state, no lock file, no database. `dist/` is disposable output.

Card data is CSV by default because a designer can open it in a spreadsheet and a
script can append to it, and both produce a readable diff.

## Consequences

- Balance changes review like code. `git log data/creatures.csv` is the balance
  history.
- Two people can work on different card types and merge.
- An agent edits a deck with the same tools it edits code with.
- Card ids must be stable across edits, so they are derived from the `name` field
  rather than from row order, with an explicit `id` column when a name changes.
