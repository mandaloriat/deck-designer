# Starter Deck

A deck-designer project.

    deck validate        # schema, data and template checks
    deck cards           # what is in the deck
    deck build           # images + every profile in deck.yaml
    deck export sheet --out dist/print.pdf

Card data lives in `data/`, layout in `templates/`, artwork in `assets/`.
Everything is plain text, so `git diff` shows exactly what changed.
