# 4. No play simulator

Status: accepted

## Context

Playtesting is the feature most likely to be asked for next, and the one that
most enlarges the surface area: it needs a rules model, a game state model, a UI,
and multiplayer or hot-seat handling. It would drag the project toward being an
application rather than a build tool.

## Decision

Out of scope. This tool turns structured data into rendered components.

## Consequences

- The renderer stays headless, which is what makes it work in CI and under an
  agent.
- Playtesting happens where it already works: a virtual tabletop, or printed
  proofs. `deck atlas` feeds the first and `deck print-plan` the second, and
  both are handoffs rather than features that grow.
- If a simulator is ever wanted, it belongs in a separate package consuming
  `manifest.json`, with its own release cycle. Nothing here blocks that.
