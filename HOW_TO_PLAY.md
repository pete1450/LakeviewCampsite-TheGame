# CAMPGROUND TYCOON — How the Game Works

**Version:** v2026.09.26g · Single-file browser game (three.js, 45° isometric view)

## The idea

You're building and running a campground, RollerCoaster-Tycoon style. You start with **$1,000** on a randomly generated 36×36 plot with 1–3 lakes and scattered tree clusters. A paved entrance road comes in from the south — everything you build branches off of it. Campers drive in, look for a site that fits their rig and their wallet, stay a few nights, pay you as each day rolls over at dawn, and leave a star rating. Grow your rating, grow your traffic, grow your cash. Days run on a 60-second day/night cycle, and campfires glow after dark.

## Controls

- **Phone/tablet:** tap a tool in the bottom toolbar, then tap the map. Drag to pan, pinch to zoom. A green/red ghost shows whether the tile is valid before you commit.
- **Desktop:** mouse works the same way; mouse wheel zooms. Keyboard shortcuts: `1` Inspect, `2` Road, `3` Clear, `4` Tent, `5` Popup, `6` Medium, `7` RV, `8` Pool, `9` Bathroom, `0` Bulldoze, `M` mute, `P` or `Space` pause.
- **Top bar:** cash, day, current guests, star rating, plus ⟳ rotate view, ↺ restart, pause / 1× / 5.4× speed, a mute button, and a 🐛 debug toggle (see below).
- **⟳ Rotate:** each tap spins the isometric camera 90° (4 stops, full circle). Panning and zooming keep working at every angle — handy for seeing behind buildings and checking road layouts.

## Day/night cycle

Each game day is a **60-second cycle** at 1× speed (the 45-second day pacing is unchanged):

| Phase | Cycle fraction | What happens |
|---|---|---|
| ☀️ Day | 0–75% (45s) | Full daylight — build, manage, watch guests arrive |
| 🌇 Dusk | 75–82% | Sun fades through a warm orange horizon |
| 🌙 Night | 82–93% | Dark blue sky, stars fade in, campfires glow |
| 🌇 Dawn | 93–100% | Morning fades back in |

**The day rolls over right as morning fades in after night** — that's when nightly payments are collected, the camp store pays out, stays end, and departures happen. The sky and lighting show the phase; no indicator needed.

**Campfires are the centerpiece of the night.** An occupied site with a firepit gets a warm radial glow that ramps up as darkness falls, with a gentle flicker — higher firepit tiers glow bigger. Vacant sites stay dark (the firepit ring is still there, just unlit). The camp store gets a faint warm glow too, and a starfield fades in overhead. Higher-tier firepits aren't just appeal points anymore; they're what make your park beautiful after dark.

## Autosave & restart

- **Autosave is silent and automatic.** Your park saves to the browser every ~5 seconds and whenever the tab is hidden or closed. Reopen the page and you pick up exactly where you left off — money, day, buildings, guests mid-stay, even the random-number stream. There are no save/load buttons by design.
- If a save is ever missing or corrupt, the game just starts a fresh park instead of breaking.
- **↺ Restart** (top bar): tap once and the button shows **SURE?** for 3 seconds; tap again within the window to wipe the save and start a brand-new random park. If the window expires it disarms silently — no accidental wipes.

## The map

- **Lakes:** 1–3 irregular blobs. You can't build on water.
- **Trees:** grow in clusters plus a few loners. Clear any tree for **$25** before building on its tile (use the 🪓 Clear tool).
- **Entrance road:** 5 tiles of permanent asphalt at the south edge center. It can't be bulldozed or changed — it's your lifeline.

## Building

Every structure except roads must sit on clear grass and be **orthogonally adjacent to at least one road tile** ("Site needs road access" otherwise). Roads themselves can go anywhere, but only sites connected to the entrance via the road network will ever get guests.

### Roads (🛣️)

Tap an empty tile to lay **dirt road ($15)**. Tap an existing road again with the road tool to upgrade it: **dirt → gravel ($20) → asphalt ($35)**. Upgrades aren't just cosmetic — sites next to asphalt get +1 appeal.

### Campsites

Four sizes. A smaller rig can always use a bigger site, never the reverse.

| Site | Footprint | Cost | Fits rigs | Default price/night |
|---|---|---|---|---|
| ⛺ Tent site | 1×1 | $120 | tent | $25 |
| 🚐 Popup site | 2×2 | $300 | tent, popup | $40 |
| 🚚 Medium site | 2×3 | $600 | tent, popup, medium | $65 |
| 🏕️ RV site | 3×3 | $1,000 | all | $95 |

### Site management (🔍 Inspect → tap a site)

- **Nightly price:** adjustable in $5 steps from **$5 to $200**. Price too high and campers drive past; price too low and you leave money on the table.
- **Picnic table ($120):** +1 appeal, +1 happiness.
- **Firepit tiers:** bare dirt spot **$25** → wheel ring **$70** → fancy stone ring **$160**. Each tier adds +1 appeal and +1 happiness (full price each step, no trade-in).

### Pool (🏊 $900)

2×2, expandable twice: to 3×3 for **$700**, then to 4×4 for **$1,200**. The effective radius grows with each level — **5 tiles** at base, **7 tiles** at 3×3, **10 tiles** at 4×4. Expansion is smart: if one side is blocked (trees, roads, buildings, map edge) the pool tries the other directions before giving up. A pool gives **+2 appeal** to site choices and **+1 happiness** to guests — but only for sites within its current radius. Location matters: build pools in the middle of your site clusters, not off in a corner.

### Lake (🌊 $30/tile)

Dig your own water: tap any clear grass tile (no road, no structure, no trees) to turn it into water for **$30**. Lakes are decorative — a nice spot for a future site cluster to gather around. They're also where you put a **fishing dock**. Changed your mind? **Bulldoze a water tile to fill it back to grass, free.** The ghost preview shows blue for valid digs. New water shimmers with the same wind animation as natural lakes.

### Buildings

| Building | Footprint | Cost | Effect |
|---|---|---|---|
| 🚻 Bathroom | 2×2 | $550 | +1 appeal for sites within ~8 tiles (look for the floating 🚻 sign) |
| 🏪 Camp store | 3×2 | $1,400 | earns **$8 per guest per night, per store** at midnight (look for the floating 🏪 sign) |
| 🛝 Playground | 2×2 | $750 | +1 appeal and +1 happiness for tent/popup guests (families) within ~10 tiles |
| 🎣 Fishing dock | 2×2 | $1,000 | **on water**, next to road-served land. +1 happiness within 7 tiles; upgrades: row boats **$1,500** → 9 tiles, jetskis **$2,000** → 11 tiles |

### Bulldoze (💥)

Refunds **50% of everything invested** in a structure (build cost + upgrades). Roads refund $7 / $17 / $35 by tier. Bulldozing a water tile (natural or dug) fills it back to grass — free, no refund. You can't bulldoze the entrance road or an occupied site, and clearing trees is not refundable.

## Customers

### Who shows up

| Rig | Vehicle | Share of traffic | Nightly budget |
|---|---|---|---|
| Tent | car | 40% | $20–$40 |
| Popup | pickup + small trailer | 25% | $35–$60 |
| Medium | pickup + big trailer | 20% | $55–$90 |
| Big RV | motorhome | 15% | $80–$140 |

Guests spawn at the entrance on a timer that shrinks as your rating rises (about every 16s at 1 star, ~9s at 3 stars, ~5s at 5 stars, ±30% jitter). Max 20 guests at once.

### How they pick a site

1. The game pathfinds over your road network from the entrance.
2. A site is eligible if it's **vacant**, its **size fits the rig**, its **price is within the camper's budget**, and it's **adjacent to a reachable road**.
3. Among eligible sites, the camper picks the one with the highest score: **appeal × 100 − price** (appeal first, cheaper wins ties).
4. No eligible site → they cruise down the entrance road and leave (a "turned away" stat, sad honk).

### Appeal scoring (what makes a site attractive)

Start at 1, then: +1 picnic table, +firepit tier (0–3), +2 pool within its radius (5/7/10 by level), +1 playground within 10 tiles (tent/popup rigs only), +1 bathroom within 8 tiles, +1 if the site touches asphalt. **All amenity bonuses are radius-limited** — a pool on the far side of the park does nothing for a site. Tap a bathroom, pool, playground, or fishing dock to see its effective radius drawn as a circle (you also get a preview circle while placing one).

### The stay

- They drive to the site (0.6 tiles/sec at 1× — a leisurely roll, not a teleport), park, and stay **1–4 nights**.
- **While camping, the pulling vehicle disappears** — the car/pickup drives off, but the camper itself stays: tent sites keep their tent, popup and medium sites keep their trailer parked, and the big RV keeps its motorhome (an RV site without the RV would look wrong).
- **When the day rolls over at dawn** (end of the 60s cycle) they pay the site's current nightly price — a green **$25** popup floats up over the site. Happiness is computed: base 2, +1 table, +firepit tier, +1 pool (within its radius), +1 playground (tent/popup, within 10 tiles), +1 fishing dock (within its radius), clamped 1–5.
- The camp store pays out $8/guest/night per store at the same time.
- On checkout they leave a **1–5 star rating** (rounded happiness) that feeds your running average, and a **tip** if they're happy: (happiness − 3) × $15 for 4–5 stars — shown as a gold **+$15 tip** popup.
- If a site gets taken or bulldozed while a camper is en route, they re-pick; if nothing's left, they leave.

## Debug departure reports (🐛)

Tap the 🐛 button in the top bar to toggle debug mode. While it's on, every group that leaves pops a **departure report dialog** with the full accounting of their stay:

- **Group:** rig type, budget, site class + nightly price
- **Stay:** nights planned vs nights actually stayed, total paid across all midnights
- **Happiness breakdown:** base 2, +picnic table, +firepit tier, +pool, +playground, +fishing dock — each component shown, then the final value clamped to 1–5
- **Checkout:** stars given (rounded happiness), tip paid, and your campground rating before → after

Groups turned away without a site get a report too: rig, budget, and the reason (e.g. "no vacant site fits this rig", "no fitting site within budget", "no affordable site reachable by road").

If several groups check out on the same dawn rollover, they queue into **one dialog** with ◀ ▶ page controls ("2 of 5") instead of stacking. New departures while the dialog is open append to the queue; ✕ dismisses it and clears the queue. **The game auto-pauses when a report opens** so you can read it in peace — dismissing the dialog resumes your previous speed (if you paused manually first, it stays paused). Debug mode lasts for the session — it doesn't persist across reloads, and with it off the game behaves exactly as before.

## Camper minigames (🆘)

Every few minutes of play (only while guests are camped), a **"A camper needs help!"** banner pops up. Tap **Help!** to pause the park and play a 3D minigame — **win and the camper tips you $15**. Ignore it and it goes away after ~25 seconds. For testing, the 🐛 debug toggle shows three buttons (🔥 🐴 🚚) that start each game directly.

- **🔥 Roast a marshmallow:** drag sideways to spin the marshmallow over the campfire — only the side facing the fire cooks. White → golden-brown at **75%** (perfect) → black past that; at 100% it bursts into flame and you're done. Cook all 4 sides evenly, then **swipe UP** to pull it off — the tip starts at **$100** and loses 2× each side's distance from 75% (any positive tip wins).
- **🐴 Horseshoes:** tap the sweeping horizontal dial dead-center, then the vertical dial. The shoe launches with your combined offset — land inside the ring for 1 point. 3 tries, 3 points to win; the dial gets faster each try.
- **🚚 Back up the trailer:** rear-view mirror view. **▲** backs up, **▼** pulls forward, **◀ ▶** steer (arrow keys on desktop). Touch your truck's hitch to the camper's hitch within **15 seconds**.

## Strategy notes

- Money is tight at the start ($1,000): a sensible opening is a couple of dirt road tiles off the entrance, one cleared patch, and a single tent site ($120) — that's under $250 and guests start paying on night one. Reinvest every midnight payout.
- Tent campers are your bread and butter early: cheap sites, 40% of traffic, modest budgets. Don't overprice the tent sites.
- RV campers pay the most but need big 3×3 sites and budgets start at $80 — an RV site at the default $95 only catches the upper half of RV budgets.
- Firepits and tables are cheap appeal; a pool near your sites is the single biggest happiness boost — but remember its radius grows only when you expand it, and the playground's is fixed at 10.
- Asphalt roads near your premium sites quietly add appeal.
- Watch the rating: bad stays (overpriced, no amenities) drag down spawn rate; great stays compound it.

## Current limitations (v1)

- Guests are simple — no complaints, no wandering off-site, no weather or seasons. Roads can be built anywhere (only network-connected ones matter). These are the natural next iteration points.
