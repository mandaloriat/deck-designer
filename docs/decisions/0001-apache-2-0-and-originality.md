# 1. Apache-2.0, and an independent implementation

Status: accepted

## Context

The project has to be usable by anyone, including in a hosted service or a
commercial product, without the licence dictating what they do with their own
code. That rules out copyleft, and strong network copyleft in particular.

Separately: functionality, file formats and user-facing concepts are not
copyrightable, but source code, templates, stylesheets and artwork are. A tool
that solves a well-known problem has to be written from the problem, not from
someone else's answer to it.

## Decision

Apache-2.0, over MIT, for the explicit patent grant (§3) and the contribution
terms (§5). The extra length stops mattering once a project takes outside
contributions.

Every line here is original. No code, markup, CSS or assets are copied, adapted
or transliterated from another project, and no copyleft codebase is consulted
while implementing an equivalent feature.

## Consequences

- Dependencies are restricted to permissive licences.
- Reading a format another tool writes, in order to import it, is acceptable: a
  format is not the code that produces it. It has to be implemented from observed
  data.
- Nothing prevents someone from building a hosted service on this. That is the
  point.
