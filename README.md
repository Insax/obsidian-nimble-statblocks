# Nimble Statblocks

Desktop-only Obsidian plugin to render `nimble` statblocks and export them as:
- Nimble JSON (`Export to foundry`)
- PNG (`Export as PNG`, auto width, transparent background)

## Status

Current implementation focuses on monsters:
- layouts: `normal`, `solo`, `flunky`, `minion`
- solo extras: `saves`, `last_stand`, `bloodied`
- minion override: `hp` and `armor` are hidden from rendered output and removed from export payload
- linked monster/ability images are embedded as base64 in exported JSON

## Nimble block format

```nimble
name: Stone basilisk
layout: solo
level: "3"
size: huge
hp: 90
armor: 14
image: "[[basilisk.png]]"
speed:
  - walk 6
  - burrow 3
features:
  - name: Petrifying gaze
    desc:
      - range/reach: 8
      - flavor: Anyone meeting its stare risks turning to stone.
    image: "[[gaze.png]]"
actions:
  - name: Crushing bite
    desc:
      - damage: "2d8 + 4"
      - flavor: Powerful bite attack.
saves:
  - DEX: 0
  - WIL: 3
  - STR: 2
  - INT: -1
last_stand: Gains two immediate actions.
bloodied: Erupts stone shards in a close burst.
```

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
```

## Install in a vault

Copy release artifacts into:

`<Vault>/.obsidian/plugins/nimble-statblock/`

Required files:
- `main.js`
- `manifest.json`
- `styles.css`
