# Architecture

Three packages, each usable on its own:

    packages/core     project model, validation, templating, grid maths
    packages/render   Chromium-backed rasteriser
    packages/cli      the `deck` command

`core` has no browser dependency and no side effects beyond reading the project
directory. Template output can be diffed and unit-tested without launching
anything, which is why most of the test suite runs in a second.

## The pipeline

    deck.yaml ─┐
    data/*     ├─► load ──► resolve ──► compose ──► render ──► write
    templates/ ┘   (schema)  (typed     (Liquid →   (Chromium)
                             items)      markup)

**load** parses `deck.yaml` against a Zod schema, normalises every length to
millimetres, reads templates and stylesheets, and indexes `assets/icons`. Paths
are checked against the project root: a project cannot read files above it.

Every source format collapses into `RawRow` before anything else runs, so adding
one costs a reader function and nothing downstream changes. A row can carry an id
implied by its source (a Markdown file's basename) and a body, which is how one
file per component works without the resolver knowing about files.

**resolve** turns data rows into typed items. Each carries two views of its
values: `values`, canonical and unescaped, used by `deck cards` and the manifest;
and `view`, render-ready, with text HTML-escaped, rich text sanitised, and image
paths turned into URLs. Escaping once at this boundary is what lets templates
write `{{ card.name }}` without thinking about it.

**compose** renders each item through Liquid into a markup fragment. Liquid was
chosen over a JavaScript-evaluating engine because building a project someone
else wrote should not execute their code.

**render** wraps fragments in the engine's component box and hands them to
Chromium.

## Rendering

A loopback HTTP server rooted at the project directory serves the generated
document plus every asset it references. `file://` is avoided because Chromium
refuses to load fonts from it, which is a classic cause of output that differs
between a laptop and CI.

Determinism comes from: blocking every request that does not target that server,
requiring fonts to be vendored, and pinning colour profile, locale, timezone,
reduced motion and font hinting on the browser context.

Blocking page requests is only half of it. The browser process has its own
network life — variations seeds, component and safe-browsing updates, sign-in
probes — and none of it passes through request interception. Those are turned
off at launch instead, which is the difference between a build that looks
hermetic and one that is.

Components are laid out as a contact sheet and screenshotted one element at a
time, so a batch costs one page load. Each sits inside a capture box whose size
in CSS pixels is exactly the target pixel size, with the component zoomed to fill
it. Chromium clips screenshots on whole CSS pixels, so something sized in
millimetres captures a few pixels too large; zoom re-runs layout at the target
scale, so glyphs stay on the pixel grid instead of being resampled the way a
transform would.

Because the capture box is per component, sizes can be mixed freely: a card and a
token render in the same pass, each at its own exact resolution.

## Sheet planning

`planSheets()` is pure geometry, generic over what it is arranging: page size,
cell size, margin and spacing in, sheets of positioned cells out. It fits the
largest grid unless a fixed one is given, centres it, and emits each back sheet
directly after its front with cells mirrored on the flip axis.

Nothing here renders paper. `deck print-plan` feeds the result to
[print-cards](https://github.com/mandaloriat/print-cards) as a generated command
line, plus a `plan.json` for anything else that wants to consume it. See
[decisions/0006](decisions/0006-png-only-and-a-print-handoff.md).

## Diagnostics

Everything that can go wrong produces a `Diagnostic` — severity, stable code,
message, and where possible the file, component type and component. Commands
collect them and the reporter decides how to present them. `--json` returns the
same array verbatim, which is what makes the CLI usable from a script.

## What is deliberately absent

- **A play simulator.** Simulating a game is a different product with a different
  release cadence. Rendering components is the job.
- **A database.** The project is files; git is the history, the diff and the
  merge tool.
- **A bundled editor.** The build tool comes first. A UI can be added later as a
  separate package on top of the same on-disk format.
- **A print pipeline.** Paper has its own constraints and its own tool.
