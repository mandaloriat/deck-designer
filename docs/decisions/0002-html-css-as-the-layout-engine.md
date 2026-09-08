# 2. HTML and CSS as the layout engine

Status: accepted

## Context

A game component is a small, fixed-size page with flowing text, layered artwork
and conditional decoration. The candidates:

- **SVG** — resolution independent and deterministic, but has no text flow. Every
  line break becomes the template author's problem, and "make this name fit"
  becomes arithmetic.
- **A canvas API** — full control, no layout at all. Everything above a rectangle
  is hand-rolled.
- **A typesetting system (Typst, LaTeX)** — excellent at documents, awkward at a
  63x88mm box with a full-bleed illustration behind three overlapping badges.
- **HTML and CSS** — flexbox and grid, real text flow, web fonts, `color-mix`,
  and a rasteriser already attached to it.

## Decision

HTML and CSS, rendered by Chromium.

The interesting failure mode of a template-based component tool is not the
substrate, it is unstructured input: markup as an opaque blob, untyped data, and
neither checked before rendering. That is addressed with a typed field schema and
a sandboxed template language, not by replacing CSS.

## Consequences

- Chromium is a hard dependency. `deck doctor` and `DECK_CHROMIUM_PATH` make it
  explicit rather than magic.
- Determinism has to be engineered: fonts vendored, network blocked, colour
  profile and hinting pinned, capture geometry snapped to whole pixels.
- Authors need CSS. That is a real cost, and it buys a layout engine nobody here
  has to maintain.
- A higher-level declarative layout that compiles to HTML/CSS stays possible as a
  later addition, with raw templates as the escape hatch.
