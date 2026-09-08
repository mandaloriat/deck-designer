# deck-designer

Design a card game deck as data, render print-ready cards from the command line.

Card text lives in CSV or YAML, layout lives in HTML/CSS templates, and both are
plain files under version control. One command turns them into PNGs at an exact
resolution and into vector PDFs — single cards, or imposed sheets with crop marks
and duplex-aligned backs.

There is no editor, no database and no play simulator. It is a build tool: it runs
in CI, in a container, or under an agent, and it tells you what is wrong instead of
producing a broken deck.

    npx @deck-designer/cli init my-deck
    cd my-deck
    deck validate
    deck build

## Why this exists

[Cider](https://github.com/oatear/cider) proved the model — card data plus HTML
templates plus a print export — and it is licensed AGPL-3.0, which makes it hard to
build on for anything you intend to ship or host. deck-designer is an independent,
clean-room implementation of the same idea under **Apache-2.0**: no code, templates,
stylesheets or assets were taken from it, and none of its internals were consulted.

The design choices are deliberately different where the original leaves room:

| | cider | deck-designer |
|---|---|---|
| Project storage | browser IndexedDB, export/import archives | plain files in a git repository |
| Interface | web editor | CLI, headless by default |
| Templating | in-page interpolation | Liquid, sandboxed, no code execution |
| PDF export | rasterised pages | vector PDF with embedded fonts |
| Validation | at render time | typed field schema, checked before rendering |
| Playtesting | built-in simulator | out of scope |

## What you get

**A typed deck.** Every field has a declared type (`text`, `richtext`, `number`,
`enum`, `image`, `color`, `list`). `deck validate` catches a misspelled column, a
value outside an enum, a missing image, an over-long name and a broken template
before a browser starts.

**Exact output.** A 63x88mm card at 300dpi comes out 744x1039 pixels, not
747x1041. Chromium clips screenshots on whole CSS pixels, so cards are zoomed into
an exact pixel frame rather than screenshotted at a fractional size.

**Vector PDFs.** Text stays text and fonts are embedded, so a print shop gets real
type instead of an upscaled bitmap.

**Reproducible builds.** Outbound network requests are blocked during rendering,
fonts must be vendored into the project, and the renderer pins colour profile,
locale, timezone and font hinting. A build that works on your laptop works in CI.

**Machine-readable everything.** Every command takes `--json` and returns a stable
envelope with diagnostics carrying error codes. Exit codes distinguish a crash (1)
from a deck that failed validation (2).

## Commands

    deck init [dir]        scaffold a project
    deck validate          config, data, assets and templates, without rendering
    deck cards             list the deck, filtered by type, id or field value
    deck build             images, every PDF profile, and a manifest
    deck export png|pdf|sheet
    deck watch             rebuild on change
    deck doctor            check the toolchain

See [docs/cli.md](docs/cli.md) for the full surface, and
[docs/project-format.md](docs/project-format.md) for `deck.yaml`.

## A project

    deck.yaml            card sizes, fields, fonts, output profiles
    templates/           Liquid templates and CSS
    data/                CSV, YAML or JSON card rows
    assets/              artwork; assets/icons/ are addressable as [[token]]
    fonts/               vendored font files
    dist/                build output, including manifest.json

## Requirements

Node 20.11+ and a Chromium binary. Playwright's is used when present; otherwise set
`DECK_CHROMIUM_PATH`. `deck doctor` reports what it found.

## Status

Early. The project format and the CLI surface may still change before 1.0; the
manifest carries a schema version so downstream tooling can pin to it.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
