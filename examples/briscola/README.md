# Briscola

A 40-card Italian deck: four suits of ten, reduced to geometry. All artwork in
this directory is original, drawn as SVG for this project.

    deck validate -p examples/briscola
    deck build -p examples/briscola
    deck print-plan -p examples/briscola --page A4 --margin 6
    sh examples/briscola/dist/print/print-cards.sh

## What it is

Denari, coppe, spade and bastoni, ranks 1 to 10, with the three court ranks as
Fante, Cavallo and Re. Because it is a briscola deck rather than a generic
Italian one, each card carries its scoring value: ace 11, three 10, king 4,
horse 3, knave 2, and nothing for the rest. Four suits of thirty makes the 120
points a hand is played for.

## How it is built

One CSV of forty rows, because the data is entirely numbers and enums and a
table is what you want when checking that the four suits match. Every visible
difference between the suits comes from a single CSS custom property.

Each suit symbol is one SVG used at four sizes and in four colours. They are
applied as CSS masks rather than `<img>`, so the same file serves the gold of
denari and the blue of spade without a second copy:

```css
.mark {
  background: var(--tint);
  mask: var(--mark) center / contain no-repeat;
}
```

The pip layouts are placed by hand into a 3x3 grid, one rule per rank, because
the arrangements a deck needs are not the ones auto-flow produces. Court cards
swap the pip field for an ornament that gains structure with rank: a plain
double ring for the knave, rays for the horse, a beaded crown for the king.

Type is EB Garamond, vendored under the SIL Open Font License (see
`fonts/OFL.txt`), so the deck renders identically wherever it is built.

## What it exercises

This deck exists to put weight on the tool, not only to look like a deck. It is
the first project here to use Liquid loops and `case`, the `asset` filter, an
`image` field with a `base` directory, a variable font weight range, CSS masks,
and forty components across two render batches and ten print sheets.
