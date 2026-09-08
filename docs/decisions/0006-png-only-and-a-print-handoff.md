# 6. PNG is the output; printing is somebody else's job

Status: accepted
Supersedes: the PDF exporter present in the first commit

## Context

The renderer could emit vector PDFs directly: Chromium's print pipeline gives
embedded fonts and real type, and an imposition layer on top gives print sheets
with crop marks. It was built, and then it turned out to be the wrong shape.

PNGs are what the downstream actually consumes. Virtual tabletops want images.
Review and diffing want images. A separate printing tool wants images. A PDF is
useful at exactly one moment, the last one, and at that moment the constraints
are about paper: pre-cut stock, bleed colour, printer margins, sheet alignment.
Those constraints belong to whoever is holding the paper, and they change
independently of how a component is designed.

Carrying an imposition engine to serve that one moment meant maintaining page
geometry, crop marks, duplex logic, output profiles and a second render path,
inside a tool whose job is layout.

## Decision

PNG is the only rendered output. Printing is delegated to
[print-cards](https://github.com/mandaloriat/print-cards), which already solves
paper.

`deck print-plan` produces the handoff rather than the paper: it groups
components by size, fits a grid, expands `copies`, mirrors back sheets on the
flip axis, and writes both a runnable script and a `plan.json`.

## Consequences

- The renderer has one code path, so raster and vector output cannot drift apart.
- Two things stay here because they are knowledge about the components, not about
  paper: which item goes in which cell, and how backs mirror for duplex. Neither
  is inferable from a directory of PNGs.
- The integration is a generated command line, not a dependency. Nothing is
  imported, versions do not have to match, and `plan.json` lets something else be
  driven instead.
- print-cards prompts interactively unless every grid cell is accounted for, so a
  partial last sheet is filled with a transparent placeholder. This keeps each
  component on the same physical spot it would occupy on a full sheet, which is
  what pre-cut stock requires.
- Vector output is gone. If a print shop ever asks for it, it comes back as an
  exporter behind the same `plan.json`, not as a second render path.
