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

cardTypes:           # one entry per component type
  - id: creature
    name: Creature
    template: templates/creature.liquid
    back: templates/back.liquid
    styles: [templates/creature.css]
    data: data/creatures            # a file, a list of files, or a directory
    body: rules                     # field a Markdown body fills
    card: { width: 70 }             # overrides the deck default
    defaults: { faction: order }    # merged into every row
    idFrom: name                    # field an id is derived from
    fields:
      name: { type: text, required: true, maxLength: 28 }
      cost: { type: integer, min: 0, default: 0 }

  # A component type is only a size, a template and some rows, so this is a
  # 25mm round token rather than a card.
  - id: token
    template: templates/token.liquid
    data: data/tokens.csv
    idFrom: label
    card: { width: 25, height: 25, bleed: 2, cornerRadius: 12.5 }
    fields:
      label: { type: text, required: true }
      value: { type: integer, default: 1 }
```

Component types with different sizes render in the same pass, and
`deck print-plan` groups them into separate sheets automatically.

Lengths accept a bare number in the project `units`, or an explicit suffix:
`3`, `"3mm"`, `"0.125in"`, `"9pt"`.

## Field types

| Type | Accepts | Notes |
|---|---|---|
| `text` | any scalar | HTML-escaped before rendering; `maxLength`, `pattern` |
| `richtext` | any scalar | `**bold**`, `*italic*`, line breaks, `[[icon]]`, a small tag allowlist; `paragraphs` |
| `number` / `integer` | number or numeric string | `min`, `max` |
| `boolean` | `true/false/yes/no/1/0/x` | |
| `enum` | one of `values` | anything else is an error |
| `image` | project-relative path | existence is checked; `base` prefixes a directory |
| `color` | CSS colour | warns on something that is not one |
| `list` | array, or a string split on `separator` | `of: text \| number \| integer` |

Shorthand: `cost: integer` is the same as `cost: { type: integer }`.

Three names are reserved and must not be declared as fields:

- `id` — an explicit id. Without it, one comes from the source's own identity (a
  Markdown file's basename), then from the field named by `idFrom`, then from the
  row number.
- `copies` — print-run multiplier. The component is still listed once;
  `deck print-plan` is what expands it.
- `type` — the component type id.

## Data sources

Component rows can come from CSV, TSV, JSON, YAML or Markdown, and one component
type can draw from several at once. They all feed the same field schema, so the
format is a workflow choice, not a modelling one.

`data:` takes a file, a list of files, or a directory. A directory means every
data file inside it, in filename order, which is what makes one file per
component practical without a glob syntax.

```yaml
data: data/creatures          # a directory
data: data/creatures.csv      # one file
data: [data/base.csv, data/expansion.csv]
```

Small sets can skip the file entirely and inline rows under `cards:` in
`deck.yaml`.

### Which format

| Shape of the component | Use |
|---|---|
| Prose-heavy, a few dozen to a few hundred | one Markdown file each |
| Mostly numbers, balanced by comparison | CSV |
| In between, or generated | YAML / JSON |

The deciding question is what a change looks like in `git diff`. In a CSV every
row is one line, so rewording one sentence marks the whole component as changed.
With a file per component the same edit is a one-line diff, and two people
editing different cards never conflict. Against that, a table is far easier to
scan when you are balancing costs against each other, which a directory of files
is not.

### Markdown

One component per file: YAML front matter for the typed fields, everything after
it as the body.

```markdown
---
name: Thicket Warden
cost: 4
faction: wild
attack: 3
health: 6
flavour: Older than the road beside it.
---
**Rooted.** Cannot be moved.

Heals [[health]] 1 at the start of your turn.
```

The body fills the field named by `body:` on the component type, or, if that is
omitted, the type's only `richtext` field. `body:` has to name a `richtext`
field; pointing it at a number or an enum is a config error rather than a pile
of coercion failures on every row. Setting the same field in both places
is a warning and the body wins. The body is rich text, not full Markdown: bold,
italics, line breaks, `[[icon]]` tokens and the inline tag allowlist, nothing
else. Give the field `paragraphs: true` to turn blank-line separated blocks into
`<p>` instead of `<br>`.

The **filename is the id**. `dawn-sentinel.md` becomes `creature-dawn-sentinel`,
and it stays that id when the `name` in the front matter changes, which is the
main reason to prefer a file per component once artwork and manifests start
referring to ids.

### CSV, TSV, JSON, YAML

CSV and TSV keep their header names verbatim, matched to field names after
trimming. JSON and YAML hold an array of objects, or an object with a `cards`
array.

A column or key that matches no declared field produces a warning and is
ignored, which is how a typo gets caught instead of silently doing nothing.

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

Because several component types can share one rendered page, scope type-specific
rules (`.dd-card[data-type='creature'] .title`) rather than styling bare element
names.

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

    dist/cards/<type>/<id>.<face>.png
    dist/manifest.json

`manifest.json` carries `schema: "deck-designer/manifest@1"`, the geometry of
every component type, and every component with its resolved values, its rendered
image paths and pixel sizes, and the data file and row it came from.

The filename layout comes from `--name`, whose default is
`{type}/{id}.{face}.png`. Available tokens are `{id}`, `{type}`, `{face}`,
`{name}` (the slugified `idFrom` field) and `{index}`, which is 1-based within a
type and zero-padded so a directory listing sorts in project order.
