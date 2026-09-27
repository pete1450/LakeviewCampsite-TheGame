# Lakeview Campsite — The Game

A campground simulator in a single HTML file. Three.js, 45° isometric voxel view, phone-friendly tap controls.

**Play it:** open `index.html` (or enable GitHub Pages on `main` — see below).

## The game

You start with **$12,000** on a random 36×36 plot (1–3 lakes, tree clusters) with a paved entrance road from the south. Build dirt/gravel/asphalt roads, clear trees, and place 4 tiers of campsites (tent → popup → medium → big RV; smaller rigs fit bigger sites). Set nightly prices, add picnic tables and 3-tier firepits, build an expandable pool, bathrooms, a camp store, and a playground. Campers drive in with rig-matched vehicles, hunt for a site that fits their rig and budget, stay 1–4 nights, pay at midnight, and leave star ratings that drive future traffic.

Full mechanics documentation: [HOW_TO_PLAY.md](HOW_TO_PLAY.md)

## Repo layout

- `index.html` — the playable game (assembled, three.js r147 inlined). Built by CI; don't edit by hand.
- `build/` — the real sources:
  - `head.html` — HTML shell + CSS + UI
  - `logic.js` — pure game logic (map gen, economy, placement rules, customer AI, day cycle). No DOM, no THREE — fully node-testable.
  - `game.js` — rendering, input, HUD wiring (three.js)
  - `three.min.js` — pinned three.js r147
  - `build.py` — assembles the single file: `python3 build.py [output]`
  - `test_logic.js` — 143 node asserts over the rules/economy
  - `test_sim.js` — headless playthrough of the real game code (THREE/DOM stubs)
  - `harness.js` — the stub harness used by `test_sim.js`
- `HOW_TO_PLAY.md` — comprehensive player documentation

## Local development

```bash
cd build
node test_logic.js   # rules/economy tests
node test_sim.js     # headless playthrough
python3 build.py ../index.html
```

## GitHub Pages

Settings → Pages → Deploy from branch → `main` / root. The game is then live at `https://<user>.github.io/LakeviewCampsite-TheGame/`.
