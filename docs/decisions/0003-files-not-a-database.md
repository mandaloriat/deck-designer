# 3. The project is files

Status: accepted

## Context

Keeping a project in browser storage with import/export archives makes an editor
self-contained, and makes everything else hard: no diff, no merge, no review, no
CI, no scripted edit, and one cleared browser profile from losing the work.

## Decision

A project is a directory: `deck.yaml`, CSV/YAML data, templates, assets, fonts.
No hidden state, no lock file, no database. `dist/` is disposable output.

Data is CSV by default because a designer can open it in a spreadsheet and a
script can append to it, and both produce a readable diff.

## Consequences

- Balance changes review like code. `git log data/creatures.csv` is the balance
  history.
- Two people can work on different component types and merge.
- An agent edits a project with the same tools it edits code with.
- Ids must stay stable across edits, so they are derived from a named field
  (`idFrom`, defaulting to `name`) rather than from row order, with an explicit
  `id` column available when a name changes.
