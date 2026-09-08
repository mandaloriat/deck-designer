# 7. Several data formats, one field schema

Status: accepted

## Context

The first version took CSV. That is the right default for balancing — a table is
what you want when comparing costs across forty cards — and the wrong default for
writing. Rules text is prose, and prose in a spreadsheet cell means quoting
commas, escaping quotes and no line breaks.

The deciding argument is the diff. A CSV row is one line, so rewording one
sentence marks the whole component as changed and two people editing different
cards in the same file conflict. Neither is true with a file per component.

But a directory of files is genuinely worse for balancing: you cannot see all the
costs at once, and reordering means renaming. Neither format wins outright, so
picking one as *the* format would be picking a side in a trade-off that belongs
to the person doing the work, and that changes between component types in the
same project.

## Decision

The field schema is the model. Formats are workflow.

CSV, TSV, JSON, YAML and Markdown-with-front-matter all produce the same typed
rows, validated identically. A component type can draw from several at once, and
different types in one project can use different formats: prose-heavy cards as a
file each, tokens as a table.

`data:` accepts a directory, meaning every data file inside it in filename order.
A directory is enough to make one-file-per-component practical, and it avoids
inventing a glob dialect to learn.

For Markdown, the filename is the id. A display name changes during development;
a filename is a deliberate act, and ids end up in manifests, artwork references
and print plans.

## Consequences

- Adding a format costs one reader function, because everything downstream sees
  `RawRow`.
- Front matter is YAML, so a Markdown file and a YAML file express exactly the
  same field values. Converting between the two is mechanical.
- The body is rich text, not full Markdown. Headings, tables and links have no
  meaning on a card, and supporting them would mean shipping a Markdown parser
  and then explaining which parts of it do nothing.
- `body:` is explicit, falling back to the type's sole `richtext` field. A type
  with two rich-text fields has no obvious target, and guessing there would be a
  silent wrong answer.
