# 8. Theme variables, not a visual editor

Status: accepted

## Context

Editing a deck is not one activity. Laying out a card is structural work — where
the title sits relative to the art, what happens when the rules text is long —
and it happens a handful of times per deck. Choosing the ink, the paper, the four
suit colours, how far the rule sits from the trim edge: that happens twenty times
in an evening, and every round costs a save and a glance at the preview.

The obvious answer is to embed a visual editor. There are good open-source ones,
and they all work the same way: they own the document. You hand them markup, they
hand you back markup they generated. That round-trip is the problem. A template is
not a document — it has Liquid tags, loops over pip positions, and conditionals
for court cards — and no WYSIWYG editor round-trips those. It would rewrite the
one file the tool exists to keep readable, and the first time it reformatted
`card.css` the tool would stop being trustworthy.

A second option is a full property inspector: click an element, edit its computed
styles. That is a real editor with a real ambition, and it needs to answer which
rule to write to, what to do about specificity, and how a change to one card
generalises to forty. Those are weeks of work and a permanent source of
surprising diffs.

## Decision

A deck declares which of its custom properties are knobs, and the preview shows
them as controls that write back into the stylesheet.

The write is a value substitution inside one declaration. Formatting, comments
and ordering survive, because a tool that reformats your stylesheet on every
colour tweak is one you stop using. Nothing else in the file is read or
rewritten, so a template with the most convoluted Liquid in it is untouched by
construction.

The scope is deliberately narrow. Structure stays in the files, edited in an
editor. What the panel covers is the part of design that is genuinely a list of
key-value pairs, which is also the part you iterate on.

## Consequences

- The stylesheet stays the source of truth. The panel has no state of its own
  beyond an in-flight drag; the write triggers the watcher and the page reloads
  from the file, so what you see after a change is what a build would produce.
- The control is inferred from the current value rather than declared. A colour
  gets a picker because it looks like a colour. That keeps the config a list of
  names, and it means changing `#f4efe1` to `oklch(...)` in CSS changes the
  control without touching `deck.yaml`.
- A slider needs `min` and `max` in the config, because no honest range can be
  guessed from a single value.
- Writing is loopback-only. `deck preview --host` already serves the project
  directory read-only, which is a choice the command warns about; letting anyone
  on the network change files is not the same choice, so off loopback the panel
  is read-only and the endpoint refuses.
- Values are rejected if they contain anything that could close the declaration.
  The knob is a value slot, not an opening into the stylesheet.
- This does not scale to structural editing, and it is not meant to. If moving
  the title box ever needs a GUI, that is a different feature with a different
  answer, not a bigger version of this one.
