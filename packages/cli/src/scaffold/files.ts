/** Files written by `deck init`. Kept as data so the CLI has no runtime asset lookup. */
export const SCAFFOLD: Record<string, string> = {
  'deck.yaml': `version: 1
name: Starter Deck
description: A minimal deck-designer project. Edit and re-run \`deck build\`.
units: mm

card:
  width: 63
  height: 88
  bleed: 3
  safe: 4
  cornerRadius: 3

render:
  dpi: 300
  background: transparent

styles:
  - templates/base.css

icons:
  dir: assets/icons

cardTypes:
  - id: creature
    name: Creature
    template: templates/creature.liquid
    back: templates/back.liquid
    styles:
      - templates/creature.css
    data: data/creatures.csv
    fields:
      name: { type: text, required: true, maxLength: 28 }
      cost: { type: integer, min: 0, max: 20, default: 0 }
      faction: { type: enum, values: [order, chaos, wild], default: order }
      attack: { type: integer, min: 0, default: 0 }
      health: { type: integer, min: 0, default: 1 }
      rules: { type: richtext }
      flavour: { type: text }
      art: { type: image }

  # Components are not only cards: a type is just a size, a template and rows.
  - id: token
    name: Token
    template: templates/token.liquid
    styles:
      - templates/token.css
    data: data/tokens.csv
    idFrom: label
    card:
      width: 25
      height: 25
      bleed: 2
      cornerRadius: 12.5
    fields:
      label: { type: text, required: true, maxLength: 12 }
      value: { type: integer, default: 1 }
      icon: { type: enum, values: [attack, health, energy], default: energy }
      tint: { type: color, default: '#2f5f8f' }
`,

  'templates/base.css': `/*
 * Deck-wide styles. The engine only defines the card box and the
 * --dd-* geometry variables; everything visual lives here.
 */
:root {
  --ink: #14171c;
  --paper: #f4f1ea;
  --order: #2f5f8f;
  --chaos: #8f2f3f;
  --wild: #3f7a45;
}

.dd-card {
  font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
  color: var(--ink);
  --dd-card-background: var(--paper);
}

.frame {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  padding: 3mm;
  gap: 1.5mm;
}
`,

  'templates/creature.css': `.frame { --accent: var(--order); }
.frame[data-faction='chaos'] { --accent: var(--chaos); }
.frame[data-faction='wild'] { --accent: var(--wild); }

.bg {
  position: absolute;
  inset: calc(-1 * var(--dd-bleed));
  background:
    radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%),
    var(--paper);
}

.title {
  display: flex;
  align-items: center;
  gap: 1.5mm;
  font-size: 4.2mm;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.title .name {
  flex: 1;
  min-width: 0;
  height: 6mm;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.cost {
  flex: none;
  width: 7mm;
  height: 7mm;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 4mm;
  font-weight: 700;
}

.art {
  position: relative;
  overflow: hidden;
  border-radius: 1mm;
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 35%, #fff), color-mix(in srgb, var(--accent) 5%, #fff));
  box-shadow: inset 0 0 0 0.3mm color-mix(in srgb, var(--accent) 45%, transparent);
}

/* .bg is positioned, so in-flow siblings need a stacking context to sit above it. */
.bg { z-index: 0; }
.frame > :not(.bg):not(.stats) { position: relative; z-index: 1; }
.art img { width: 100%; height: 100%; object-fit: cover; }

.typeline {
  font-size: 2.8mm;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--ink) 65%, transparent);
}

.rules {
  height: 20mm;
  overflow: hidden;
  font-size: 3mm;
  line-height: 1.25;
}
.rules .flavour {
  display: block;
  margin-top: 1mm;
  font-style: italic;
  color: color-mix(in srgb, var(--ink) 60%, transparent);
}

.stats {
  position: absolute;
  right: 3mm;
  bottom: 3mm;
  z-index: 2;
  display: flex;
  gap: 1mm;
  font-size: 3.4mm;
  font-weight: 700;
}
.stat {
  min-width: 7mm;
  padding: 0.6mm 1.2mm;
  border-radius: 1mm;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8mm;
}
.stat .dd-icon { filter: brightness(0) invert(1); }
`,

  'templates/creature.liquid': `<div class="frame" data-faction="{{ card.faction }}">
  <div class="bg"></div>
  <header class="title">
    <span class="name" data-autofit data-autofit-max="4.6mm" data-autofit-min="2.6mm">{{ card.name }}</span>
    <span class="cost">{{ card.raw.cost }}</span>
  </header>

  <div class="art">
    {% if card.art %}<img src="{{ card.art }}" alt="" />{% endif %}
  </div>

  <div class="typeline">{{ type.name }} &middot; {{ card.faction }}</div>

  <div class="rules" data-autofit data-autofit-max="3mm" data-autofit-min="1.9mm">
    {{ card.rules }}
    {% if card.flavour %}<span class="flavour">{{ card.flavour }}</span>{% endif %}
  </div>

  <div class="stats">
    <span class="stat">{% if icons.attack %}<img class="dd-icon" src="{{ icons.attack }}" alt="attack" />{% endif %}{{ card.raw.attack }}</span>
    <span class="stat">{% if icons.health %}<img class="dd-icon" src="{{ icons.health }}" alt="health" />{% endif %}{{ card.raw.health }}</span>
  </div>
</div>
`,

  'templates/back.liquid': `<div class="back">
  <div class="back-mark">{{ deck.name }}</div>
</div>
<style>
  .back {
    position: absolute;
    inset: calc(-1 * var(--dd-bleed));
    display: grid;
    place-items: center;
    background:
      repeating-linear-gradient(45deg, #1d2733 0 2mm, #223041 2mm 4mm);
    color: #e8e2d2;
  }
  .back-mark {
    font-size: 4mm;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border: 0.4mm solid currentColor;
    padding: 2mm 3mm;
    border-radius: 1mm;
  }
</style>
`,

  'data/creatures.csv': `name,cost,faction,attack,health,rules,flavour
Dawn Sentinel,2,order,2,3,"**Guard.** While this is on the field, adjacent allies take 1 less damage.",They stand so others need not.
Ember Whelp,1,chaos,2,1,"When this enters play, deal [[attack]] 1 damage to any target.",
Thicket Warden,4,wild,3,6,"**Rooted.** Cannot be moved. Heals [[health]] 1 at the start of your turn.",Older than the road beside it.
Tidecaller,3,order,1,4,"Draw a card when an ally leaves play.",
`,

  'assets/icons/attack.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3l7.5 7.5-2 2L2 5V3h2zm14.5 0H21v2.5L9.7 16.8l2.1 2.1-1.4 1.4-1.4-1.4-1.8 1.8-1.4-1.4 1.8-1.8-1.4-1.4 1.4-1.4 2.1 2.1L18.5 3z"/></svg>`,

  'assets/icons/health.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-4.9-8-10.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8 3.7C20 16.1 12 21 12 21z"/></svg>`,

  'assets/icons/energy.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>`,

  'templates/token.liquid': `<div class="token" style="--tint: {{ card.tint }}">
  <img class="glyph" src="{{ icons[card.icon] }}" alt="{{ card.icon }}" />
  <span class="value">{{ card.raw.value }}</span>
  <span class="label" data-autofit data-autofit-max="2.2mm" data-autofit-min="1.4mm">{{ card.label }}</span>
</div>
`,

  'templates/token.css': `.token {
  position: absolute;
  inset: calc(-1 * var(--dd-bleed));
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.4mm;
  background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--tint) 70%, #fff), var(--tint));
  color: #fff;
  text-align: center;
}
.token .glyph {
  height: 5mm;
  filter: brightness(0) invert(1);
  opacity: 0.9;
}
.token .value {
  font-size: 5mm;
  font-weight: 700;
  line-height: 1;
}
.token .label {
  max-width: 18mm;
  font-size: 2.2mm;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.85;
}
`,

  'data/tokens.csv': `label,value,icon,tint
Damage,1,attack,#8f2f3f
Shield,2,health,#2f5f8f
Energy,3,energy,#3f7a45
`,

  '.gitignore': `dist/
node_modules/
`,

  'README.md': `# Starter Deck

A deck-designer project: a card type and a token type, to show that a component
is just a size, a template and some rows.

    deck validate        # schema, data and template checks
    deck cards           # what is in the project
    deck build           # PNGs at 300dpi plus dist/manifest.json
    deck export --type token --dpi 600 --out /tmp/tokens
    deck print-plan      # sheet layout handed to print-cards

Data lives in \`data/\`, layout in \`templates/\`, artwork in \`assets/\`.
Everything is plain text, so \`git diff\` shows exactly what changed.
`,
};
