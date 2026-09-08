# 5. Liquid for templates

Status: accepted

## Context

Templates come from the project, and projects get cloned from repositories. A
template language that can evaluate JavaScript means building someone else's
project runs their code. The candidates were Handlebars, Nunjucks, Eta and
Liquid.

## Decision

Liquid (liquidjs). It has no escape hatch to the host language, it is widely
known outside the JavaScript world, its errors name the tag and the line, and
`strictVariables` turns a typo in a field name into a build failure instead of a
blank space on a card.

## Consequences

- Anything a template genuinely cannot express becomes a filter in `core`, which
  keeps the sharp edges in reviewed code. Current set: `asset`, `icon`, `rich`,
  `mm`, `slug`, `pad`, `repeat`, `round`, `json`.
- Data is escaped before it reaches the template, so `{{ card.name }}` is safe by
  default and `card.raw.*` is available when the unescaped value is needed for
  comparison or arithmetic.
- Rich text gets a deliberately small markup set with an allowlisted subset of
  inline HTML, rather than a full Markdown or HTML pipeline.
