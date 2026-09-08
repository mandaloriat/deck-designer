# CLI

Every command accepts the global flags:

    --json          machine-readable result on stdout
    -q, --quiet     no progress output
    --no-color      no ANSI escapes

Exit codes: `0` success, `1` the command failed, `2` the deck has validation
errors, `3` bad usage.

With `--json`, stdout carries only the result envelope; progress and diagnostics
go to stderr, so `deck cards --json | jq` works unchanged.

```json
{
  "ok": true,
  "command": "validate",
  "data": { "cards": 4, "cardTypes": [] },
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
`template/*`, `layout/*`, `render/*`, `select/*`, `doctor/*`.

## Selecting cards

Commands that read a deck share these:

    -p, --project <path>       project directory or deck.yaml (default: cwd, then parents)
    -t, --type <id...>         restrict to card types
    -i, --id <cardId...>       restrict to card ids
    -w, --where <field=value>  restrict to rows whose field equals a value
    -n, --limit <count>        take at most this many

## deck init [dir]

Scaffolds a working project: config, two templates, CSS, a CSV, three icons.
`--name` sets the deck name, `--force` overwrites existing files.

## deck validate

Loads the config, resolves and type-checks every row, verifies referenced images
exist, and compiles every template. No browser is started, so it is fast enough
to run on every save.

    --strict          treat warnings as errors
    --no-templates    skip template compilation

## deck cards

Lists the deck. `--fields name cost` picks the columns; `--json` returns each
card's resolved values and its source file and row.

## deck build

The one command CI needs. Renders card images, every profile declared in
`deck.yaml`, and `manifest.json`.

    -o, --out <dir>        output directory
    --dpi <number>         raster resolution
    --face <face...>       front, back, or both
    --no-images            skip PNGs
    --no-profiles          skip PDFs
    --clean                remove the output directory first
    --concurrency <n>      parallel render pages
    --allow-network        let the page make outbound requests

`--allow-network` is off by default: a build that silently depends on a CDN is a
build that renders differently next month.

## deck export png|pdf|sheet

One output, configured by flags rather than by the config file.

    -o, --out <path>       file (pdf, sheet) or directory (png)
    --dpi <number>
    --face <face...>
    --bleed / --no-bleed
    --rounded              round the corners — for virtual tabletops, not for print
    --guides               draw bleed and safe-area guides
    --copies               repeat each card by its copies count

Sheet layout:

    --page <size>          A4, LETTER, A3, or 210x297 / 8.5inx11in
    --orientation <mode>   portrait | landscape
    --margin <length>      default 8
    --gutter <length>      default 0
    --columns <n>          force a grid instead of fitting the largest one
    --rows <n>
    --duplex <mode>        none | long-edge | short-edge
    --no-marks             omit crop marks

Backs are emitted as their own page directly after the matching front, mirrored
on the flip axis, so a duplex printer lands them on the correct side.

Examples:

    deck export png --type creature --dpi 600 --out dist/hi-res
    deck export sheet --copies --page LETTER --margin 12 --out dist/print.pdf
    deck export pdf --id creature-ember-whelp --guides --out proof.pdf

## deck watch

Rebuilds on any change under the project directory, ignoring `dist/`,
`node_modules/` and `.git/`. `--no-profiles` keeps the loop fast.

## deck doctor

Reports the Node version, which Chromium was found and where, whether a project
loads, and whether fonts are vendored. Run it first when output differs between
two machines.

## Using it from an agent

- `deck validate --json` before and after an edit; a non-empty `diagnostics`
  array names the file, the card and the fix.
- `deck cards --json` to read the deck without parsing CSV.
- `deck export png --id <card> --out /tmp/preview` to look at one card.
- `dist/manifest.json` to map card ids to rendered files.

Nothing prompts, nothing writes outside the output directory, and every failure
carries a code.
