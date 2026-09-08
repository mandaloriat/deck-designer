# Starter Deck

A deck-designer project: a card type and a token type, to show that a component
is just a size, a template and some rows.

    deck validate        # schema, data and template checks
    deck cards           # what is in the project
    deck build           # PNGs at 300dpi plus dist/manifest.json
    deck export --type token --dpi 600 --out /tmp/tokens
    deck print-plan      # sheet layout handed to print-cards

Cards are one Markdown file each in `data/creatures/`: front matter for the
fields, the body for the rules text. Tokens are a CSV, because they are mostly
numbers and a table is easier to balance. Both feed the same field schema.
Everything is plain text, so `git diff` shows exactly what changed.
