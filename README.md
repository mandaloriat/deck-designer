# deck-designer

Render game components from data and HTML/CSS templates, from the command line.

Content lives in whichever plain-text format suits it — a Markdown file per card,
a CSV of tokens, YAML, JSON — layout lives in templates, and all of it is under
version control. One command turns them into PNGs at an exact resolution.

Cards are the obvious case, but a component type is only a size, a template and
some rows, so tokens, tiles, player boards and reference sheets work the same way
and can be rendered in the same pass.

There is no editor, no database and no play simulator. It is a build tool: it runs
in CI, in a container, or under an agent, and it tells you what is wrong instead of
quietly producing a broken deck.

    npx @deck-designer/cli init my-game
    cd my-game
    deck validate
    deck build

## The idea

Designing a deck is not really a drawing problem. It is a problem of applying one
layout, consistently, to a set of items that keep changing while the game is being
balanced. That is a build, and builds want typed inputs, deterministic output and a
diff.

So: a typed schema over the data, a sandboxed template language over the layout,
and a renderer whose output does not move when nothing changed.

**A typed project.** Every field has a declared type (`text`, `richtext`, `number`,
`enum`, `image`, `color`, `list`). `deck validate` catches a misspelled column, a
value outside an enum, a missing image, an over-long name and a broken template
before a browser starts.

**One schema, several formats.** The same field definitions read CSV, TSV, JSON,
YAML and Markdown with YAML front matter, and one project can mix them. Prose-heavy
cards want a file each, so a wording change is a one-line diff; a sheet of tokens
wants a table, because balancing is comparison. That choice is yours per component
type, not the tool's.

**Exact output.** A 63x88mm card at 300dpi comes out 744x1039 pixels, not
747x1041. Chromium clips screenshots on whole CSS pixels, so components are zoomed
into an exact pixel frame instead of being screenshotted at a fractional size.

**Reproducible builds.** Outbound network requests are blocked during rendering,
fonts must be vendored into the project, and the renderer pins colour profile,
locale, timezone and font hinting. A build that works on your laptop works in CI.

**Machine-readable everything.** Every command takes `--json` and returns a stable
envelope with diagnostics carrying error codes. Exit codes distinguish a crash (1)
from a project that failed validation (2).

## Commands

    deck init [dir]        scaffold a project
    deck validate          config, data, assets and templates, without rendering
    deck cards             list the components, filtered by type, id or field value
    deck build             render everything, write a manifest
    deck export            render a selection to PNG
    deck print-plan        lay the PNGs onto sheets for printing
    deck watch             rebuild on change
    deck doctor            check the toolchain

See [docs/cli.md](docs/cli.md) for the full surface and
[docs/project-format.md](docs/project-format.md) for `deck.yaml`.

## Printing

PNGs are the output. Putting them on paper is a separate job with its own
constraints, so it belongs to a separate tool:
[print-cards](https://github.com/mandaloriat/print-cards), which arranges images on
a page, adds a bleed border and targets pre-cut sheets.

`deck print-plan` writes the handoff: it groups components by size, fits a grid to
the page, expands `copies`, mirrors back sheets on the flip axis so duplex printing
lines up, and emits a runnable script.

    deck build
    deck print-plan --page A4 --bleed-width 2
    sh dist/print/print-cards.sh

Nothing is coupled: the plan is also written as `plan.json` if you would rather
drive something else with it.

## Examples

`examples/starter-deck` is what `deck init` writes: a card type and a token
type, to show that a component is only a size, a template and some rows.

`examples/briscola` is a complete 40-card Italian deck with original artwork,
built to put weight on the tool rather than to demonstrate it. Loops, masks,
a vendored font, two render batches, ten print sheets.

## A project

    deck.yaml            component sizes, fields, fonts
    templates/           Liquid templates and CSS
    data/                CSV, YAML or JSON rows
    assets/              artwork; assets/icons/ are addressable as [[token]]
    fonts/               vendored font files
    dist/                build output, including manifest.json

## Requirements

Node 20.11+ and a Chromium binary. Playwright's is used when present; otherwise set
`DECK_CHROMIUM_PATH`. `deck doctor` reports what it found.

## Status

Early. The project format and the CLI surface may still change before 1.0; the
manifest and the print plan carry schema versions so downstream tooling can pin to
them.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
