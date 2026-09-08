# Architecture

Three packages, each usable on its own:

    packages/core     project model, validation, templating, layout maths
    packages/render   Chromium-backed rasteriser and PDF writer
    packages/cli      the `deck` command

`core` has no browser dependency and no side effects beyond reading the project
directory. Template output can be diffed and unit-tested without launching
anything, which is why the test suite runs in under a second.

## The pipeline

    deck.yaml ─┐
    data/*     ├─► load ──► resolve ──► compose ──► render ──► write
    templates/ ┘   (schema)  (typed     (Liquid →   (Chromium)
                             cards)      markup)

**load** parses `deck.yaml` against a Zod schema, normalises every length to
millimetres, reads templates and stylesheets, and indexes `assets/icons`.
Paths are checked against the project root: a deck cannot read files above it.

**resolve** turns data rows into typed cards. Each card carries two views of its
values: `values`, canonical and unescaped, used by `deck cards` and the manifest;
and `view`, render-ready, with text HTML-escaped, rich text sanitised, and image
paths turned into URLs. Escaping once at this boundary is what lets templates
write `{{ card.name }}` without thinking about it.

**compose** renders each card through Liquid into a markup fragment. Liquid was
chosen over a JavaScript-evaluating engine because building a deck someone else
wrote should not execute their code.

**render** wraps fragments in the engine's card box and hands them to Chromium.

## Rendering

A loopback HTTP server rooted at the project directory serves the generated
document plus every asset it references. `file://` is avoided because Chromium
refuses to load fonts from it, which is a classic cause of output that differs
between a laptop and CI.

Determinism comes from: blocking every request that does not target that server,
requiring fonts to be vendored, and pinning colour profile, locale, timezone,
reduced motion and font hinting on the browser context.

Raster and vector take different paths on purpose:

- **PNG** — cards are laid out as a contact sheet and screenshotted one element
  at a time, so a batch costs one page load. Each card sits inside a capture box
  whose size in CSS pixels is exactly the target pixel size, with the card zoomed
  to fill it. Chromium clips screenshots on whole CSS pixels, so a card sized in
  millimetres captures a few pixels too large; zoom re-runs layout at the target
  scale, so glyphs stay on the pixel grid instead of being resampled the way a
  transform would.
- **PDF** — no zoom and no device scale factor. Page size comes from an `@page`
  rule with `preferCSSPageSize`, so the output is vector with embedded fonts.
  Print media emulation is turned off so a PDF and a PNG of the same card look
  the same.

## Imposition

`impose()` is pure geometry: page size, cell size, margin and gutter in, a list
of pages with positioned slots out. It fits the largest grid unless a fixed one
is asked for, centres it in the usable area, and emits each back page directly
after its front, mirrored on the flip axis.

Crop marks are drawn only inside the page margin, aligned to every trim
boundary, so they can never print over a card.

## Diagnostics

Everything that can go wrong produces a `Diagnostic` — severity, stable code,
message, and where possible the file, card type and card. Commands collect them
and the reporter decides how to present them. `--json` returns the same array
verbatim, which is what makes the CLI usable from a script.

## What is deliberately absent

- **A play simulator.** Simulating a game is a different product with a different
  release cadence. Rendering cards is the job.
- **A database.** The project is files; git is the history, the diff and the
  merge tool.
- **A bundled editor.** The build tool comes first. A UI can be added later as a
  separate package on top of the same on-disk format.
