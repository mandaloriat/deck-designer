# CLI

Every command accepts the global flags:

    --json          machine-readable result on stdout
    -q, --quiet     no progress output
    --no-color      no ANSI escapes

Exit codes: `0` success, `1` the command failed, `2` the project has validation
errors, `3` bad usage.

With `--json`, stdout carries only the result envelope; progress and diagnostics
go to stderr, so `deck cards --json | jq` works unchanged.

```json
{
  "ok": true,
  "command": "validate",
  "data": { "cards": 7, "cardTypes": [] },
  "diagnostics": [
    {
      "severity": "warning",
      "code": "data/unknown-field",
      "message": "Unknown field \"powerr\" ignored.",
      "file": "data/creatures.csv",
      "cardType": "creature",
      "hint": "Declare it under cardTypes[id=creature].fields to use it in templates."
    }
  ]
}
```

Diagnostic codes are stable and namespaced: `config/*`, `data/*`, `asset/*`,
`template/*`, `layout/*`, `render/*`, `print/*`, `select/*`, `doctor/*`.

## Selecting components

Commands that read a project share these:

    -p, --project <path>       project directory or deck.yaml (default: cwd, then parents)
    -t, --type <id...>         restrict to component types
    -i, --id <componentId...>  restrict to ids
    -w, --where <field=value>  restrict to rows whose field equals a value
    -n, --limit <count>        take at most this many

## Rendering options

`build`, `export` and `watch` share these:

    -o, --out <dir>        output directory
    --dpi <number>         output resolution
    --face <face...>       front, back, or both
    --name <pattern>       filename pattern (default: {type}/{id}.{face}.png)
    --bleed                include the bleed area
    --rounded              round the corners
    --concurrency <n>      parallel render pages
    --allow-network        let the page make outbound requests

`--allow-network` is off by default: a build that silently depends on a CDN is a
build that renders differently next month.

Name pattern tokens: `{id}`, `{type}`, `{face}`, `{name}` (the slugified `idFrom`
field, falling back to the id) and `{index}`, which is 1-based within a component
type and zero-padded to a fixed width so a directory listing sorts in project
order. A pattern with none of `{id}`, `{name}` or `{index}` is rejected, since
every component would overwrite the previous one.

## deck init [dir]

Scaffolds a working project: config, a card type and a token type, templates,
CSS, data and icons. The cards come as one Markdown file each and the tokens as a
CSV, which is the choice [docs/project-format.md](project-format.md#which-format)
argues for. `--name` sets the project name, `--force` overwrites existing files.

## deck validate

Loads the config, resolves and type-checks every row, verifies referenced images
exist, and compiles every template. No browser is started, so it is fast enough
to run on every save.

    --strict          treat warnings as errors
    --no-templates    skip template compilation

## deck cards

Lists the components. `--fields name cost` picks the columns; `--json` returns
each one's resolved values and its source file and row.

## deck build

The one command CI needs. Renders every selected component and writes
`manifest.json` next to the images.

    --clean    remove the output directory first

## deck export

A selection, rendered with ad-hoc flags, to wherever you want it. Same renderer
as `build`, without the manifest.

    --guides    draw bleed and safe-area guides

Examples:

    deck export --type creature --dpi 600 --out dist/hi-res
    deck export --type token --rounded --out /tmp/tokens
    deck export --id creature-ember-whelp --guides --out /tmp/proof
    deck export --where faction=chaos --name '{index}-{name}.png' --out /tmp/chaos

## deck print-plan

Lays the rendered PNGs onto sheets and writes a script that calls
[print-cards](https://github.com/mandaloriat/print-cards).

    -o, --out <dir>          where to write the plan (default: <output.dir>/print)
    --images <dir>           where the PNGs are (default: <output.dir>/cards)
    --name <pattern>         the pattern they were rendered with
    --page <format>          A3 A4 A5 Letter Legal and the L landscape variants
    --margin <length>        smallest acceptable page margin when fitting the grid
    --spacing-h <length>     horizontal gap between components
    --spacing-v <length>     vertical gap between components
    --columns <n>            force a column count
    --rows <n>               force a row count
    --duplex <mode>          none | long-edge | short-edge
    --no-copies              lay out one of each instead of honouring copies
    --bleed-width <length>   solid bleed border print-cards should add
    --bleed-color <hex>      colour of that border
    --image-fit <mode>       fit | fill | stretch | crop
    --command <name>         the print-cards executable to call

It writes `print-cards.sh` and `plan.json` into the output directory:

    deck build
    deck print-plan --page A4 --bleed-width 2 --bleed-color '#1d1d1d'
    sh dist/print/print-cards.sh

What it decides, and print-cards cannot: which component goes in which cell, and
how back sheets mirror so duplex printing lines up. Components are grouped by
size, since one run of print-cards has one element size, so a deck of cards and a
sheet of tokens become separate sheets automatically.

Page formats are the ones print-cards accepts, so the plan needs no translation
on either side. Cells left over on the last sheet of a group are covered with a
transparent placeholder, because print-cards drops to interactive prompts unless
every position is accounted for, and because keeping the grid identical across
sheets is what makes pre-cut stock line up.

## deck preview

A live view of the deck in a browser, reloading on save.

    -p, --project <path>   project directory or deck.yaml
    --port <number>        port to listen on (default 4321)
    --host <host>          interface to bind (default 127.0.0.1)

    deck preview -p examples/briscola

The toolbar controls map to flags `deck export` already has — zoom, faces,
component type, bleed, guides, rounded corners, and a filter by id — so what
you settle on in the preview is what you pass to the exporter.

Two things make it a preview rather than an impression. The deck renders inside
an iframe carrying the same document the exporter composes, so no stylesheet of
yours can reach the toolbar and nothing of the toolbar's leaks into your cards.
And zoom is applied as resolution rather than as a transform, so layout is
recomputed at the new scale exactly as it would be at 600dpi.

The diagnostics drawer shows what `deck validate` would report, live. A broken
`deck.yaml` shows the parser error with its line and column instead of a blank
page.

It is a viewer, not an editor: the files stay the source of truth. Bind it to
loopback unless you mean to expose the project directory, because it serves
that directory over HTTP.

## deck watch

Rebuilds the PNGs on any change under the project directory, ignoring `dist/`,
`node_modules/` and `.git/`. Use it when something downstream consumes the
files; use `deck preview` when you are the one looking.

## deck doctor

Reports the Node version, which Chromium was found and where, whether a project
loads, and whether fonts are vendored. Run it first when output differs between
two machines.

## Using it from an agent

- `deck validate --json` before and after an edit; a non-empty `diagnostics`
  array names the file, the component and the fix.
- `deck cards --json` to read the project without parsing CSV.
- `deck export --id <component> --out /tmp/preview` to look at one thing.
- `dist/manifest.json` to map ids to rendered files and pixel sizes.

Nothing prompts, nothing writes outside the output directory, and every failure
carries a code.
