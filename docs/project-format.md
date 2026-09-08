# Project format

A project is a directory containing `deck.yaml` (or `deck.yml` / `deck.json`).
Every path in it is resolved from that directory and may not escape it.

## deck.yaml

```yaml
version: 1
name: Starter Deck
description: Optional.
units: mm            # mm | cm | in | pt | px — how bare numbers are read

card:                # deck-wide default geometry
  width: 63
  height: 88
  bleed: 3           # added on every side for print
  safe: 4            # inset used by the guide overlay
  cornerRadius: 3    # only drawn when a target asks for rounded corners

render:
  dpi: 300
  background: transparent
  concurrency: 4
  timeoutMs: 30000
  strict: true       # unknown template variables are an error

fonts:               # vendored files only; remote URLs are rejected
  - family: Inter
    src: fonts/Inter-Variable.woff2
    weight: 100 900
    style: normal

styles:              # CSS applied to every card type
  - templates/base.css

icons:
  dir: assets/icons  # files here become [[token]] in rich text
  extensions: [svg, png, webp]

output:
  dir: dist

profiles:            # named exports, all rendered by `deck build`
  print:
    kind: sheet
    page: A4         # or LETTER, A3, or { width: 210, height: 297 }
    orientation: portrait
    margin: 10
    gutter: 0
    bleed: true
    marks: true
    duplex: long-edge   # none | long-edge | short-edge
  proofs:
    kind: single
    bleed: false
    backs: interleave   # none | interleave | append

cardTypes:
  - id: creature
    name: Creature
    template: templates/creature.liquid
    back: templates/back.liquid
    styles: [templates/creature.css]
    data: data/creatures.csv        # or a list of files
    card: { width: 70 }             # overrides the deck default
    defaults: { faction: order }    # merged into every row
    fields:
      name: { type: text, required: true, maxLength: 28 }
      cost: { type: integer, min: 0, default: 0 }
```

Lengths accept a bare number in the project `units`, or an explicit suffix:
`3`, `"3mm"`, `"0.125in"`, `"9pt"`.

## Field types

| Type | Accepts | Notes |
|---|---|---|
| `text` | any scalar | HTML-escaped before rendering; `maxLength`, `pattern` |
| `richtext` | any scalar | `**bold**`, `*italic*`, line breaks, `[[icon]]`, a small tag allowlist |
| `number` / `integer` | number or numeric string | `min`, `max` |
| `boolean` | `true/false/yes/no/1/0/x` | |
| `enum` | one of `values` | anything else is an error |
| `image` | project-relative path | existence is checked; `base` prefixes a directory |
| `color` | CSS colour | warns on something that is not one |
| `list` | array, or a string split on `separator` | `of: text \| number \| integer` |

Shorthand: `cost: integer` is the same as `cost: { type: integer }`.

Three names are reserved and must not be declared as fields:

- `id` — an explicit card id. Without it, an id is derived from the `name` field
  (`creature-dawn-sentinel`) or, failing that, from the row number.
- `copies` — print-run multiplier. The card is still listed once; `--copies` and
  sheet profiles expand it.
- `type` — the card type id.

## Data files

CSV, TSV, JSON and YAML. Structured files hold an array of objects, or an object
with a `cards` array. Column names are matched to field names after trimming;
a column that matches no field produces a warning and is ignored.

Small decks can skip the file entirely and inline rows under `cards:` in
`deck.yaml`.

## Templates

Templates are [Liquid](https://liquidjs.com). Liquid cannot execute arbitrary
code, so cloning a deck and building it does not run someone else's JavaScript.

Context:

- `card` — render-ready values (text escaped, rich text sanitised, images turned
  into URLs), plus `card.id`, `card.type`, `card.index`, `card.copies`, and
  `card.raw` with the unescaped values for arithmetic and comparisons.
- `deck` — `name`, `description`, `units`.
- `type` — `id`, `name`.
- `face` — `front` or `back`.
- `geometry` — `width`, `height`, `bleed`, `safe`, `cornerRadius`, in millimetres.
- `icons` — token to URL map.

Filters: `asset`, `icon`, `rich`, `mm`, `slug`, `pad`, `repeat`, `round`, `json`,
plus everything Liquid ships with. `{% render %}` resolves partials from
`templates/` and `templates/partials/`.

## Styling

The engine's stylesheet defines only the card box. It exposes the geometry as
custom properties — `--dd-w`, `--dd-h`, `--dd-bleed`, `--dd-safe`, `--dd-radius`,
`--dd-bleed-w`, `--dd-bleed-h` — and these classes:

- `.dd-card` — the outer box, including bleed. Clips its contents.
- `.dd-trim` — the trim area, inset by the bleed. Template output goes here.
- `.dd-fill` — stretches a child across the trim area and into the bleed.
- `.dd-safe` — a box inset by the safe margin.
- `.dd-icon` — inline icon sized to the current font.

Because several card types can share one rendered page, scope type-specific rules
(`.dd-card[data-type='creature'] .title`) rather than styling bare element names.

### Text that fits

Any element with `data-autofit` is shrunk until its content fits, by binary
search over the font size after fonts have loaded. `data-autofit-max` and
`data-autofit-min` accept any CSS length:

```html
<span class="name" data-autofit data-autofit-max="4.6mm" data-autofit-min="2.6mm">
  {{ card.name }}
</span>
```

If the text still overflows at the minimum, the build reports a
`layout/overflow` warning naming the card.

## Output

`deck build` writes:

    dist/cards/<type>/<card-id>.<face>.png
    dist/<profile>.pdf
    dist/manifest.json

`manifest.json` carries `schema: "deck-designer/manifest@1"`, every card with its
resolved values and image paths, and the outputs that were produced.
