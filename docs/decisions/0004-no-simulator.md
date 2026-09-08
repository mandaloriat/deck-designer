# 4. No play simulator

Status: accepted

## Context

Cider ships a playtest simulator. It is the feature that most enlarges the
surface area: it needs a rules model, a game state model, a UI, multiplayer or
hot-seat handling, and it drags the whole project toward being an application
rather than a build tool.

## Decision

Out of scope. This tool turns card data into card images and print files.

## Consequences

- The renderer stays headless, which is what makes it work in CI and under an
  agent.
- Playtesting happens where it already works: exported images loaded into a
  virtual tabletop, or printed proofs. `--rounded` exists for the first case and
  the sheet profile for the second.
- If a simulator is ever wanted, it belongs in a separate package consuming
  `manifest.json`, with its own release cycle. Nothing here blocks that.
