# 1. Apache-2.0, and a clean-room implementation

Status: accepted

## Context

The reference tool for this problem space, oatear/cider, is AGPL-3.0. Section 13
extends copyleft to anyone who interacts with a modified version over a network,
so a hosted service built on it must publish its source. That is a legitimate
choice by its authors and it makes the code unusable as a starting point here.

Functionality, file formats and user-facing concepts are not copyrightable.
Source code, templates, stylesheets and artwork are.

## Decision

Apache-2.0. Every line is written from the problem, not from another
implementation: no code, markup, CSS or assets are copied, adapted or
transliterated from any AGPL project, and its internals are not consulted while
building this one.

Apache-2.0 over MIT for the explicit patent grant (§3) and the contribution terms
(§5), which matter more than the extra length once a project takes outside
contributions.

## Consequences

- A compatibility importer for another tool's export format is acceptable, since
  a format is not the code that writes it. It must be written from observed data,
  not from reading that tool's source.
- Dependencies are restricted to permissive licences. `NOTICE` records the
  clean-room claim.
- Nothing prevents someone from building a hosted service on this. That is the
  point.
