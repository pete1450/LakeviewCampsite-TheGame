# CAMPGROUND TYCOON — How the Game Works

**Version:** v2026.09.26b · Single-file browser game (three.js, 45° isometric view)

## The idea

You're building and running a campground, RollerCoaster-Tycoon style. You start with **$12,000** on a randomly generated 36×36 plot with 1–3 lakes and scattered tree clusters. A paved entrance road comes in from the south — everything you build branches off of it. Campers drive in, look for a site that fits their rig and their wallet, stay a few nights, pay you at midnight, and leave a star rating. Grow your rating, grow your traffic, grow your cash.

## Controls

- **Phone/tablet:** tap a tool in the bottom toolbar, then tap the map. Drag to pan, pinch to zoom. A green/red ghost shows whether the tile is valid before you commit.
- **Desktop:** mouse works the same way; mouse wheel zooms. Keyboard shortcuts: `1` Inspect, `2` Road, `3` Clear, `4` Tent, `5` Popup, `6` Medium, `7` RV, `8` Pool, `9` Bathroom, `0` Bulldoze, `M` mute, `P` or `Space` pause.
- **Top bar:** cash, day, current guests, star rating, plus pause / 1× / 2× speed and a mute button. One game day = 45 seconds at 1×.

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
- **Picnic table ($60):** +1 appeal, +1 happiness.
- **Firepit tiers:** bare dirt spot **$25** → wheel ring **$70** → fancy stone ring **$160**. Each tier adds +1 appeal and +1 happiness (full price each step, no trade-in).

### Pool (🏊 $900)

2×2, expandable once to 3×3 for **$700** (needs clear tiles around it). A pool anywhere in the park gives **+2 appeal** to every site choice and **+1 happiness** to every guest.

### Buildings

| Building | Footprint | Cost | Effect |
|---|---|---|---|
| 🚻 Bathroom | 2×2 | $550 | +1 appeal and happier tent/popup campers for sites within ~8 tiles |
| 🏪 Camp store | 3×2 | $1,400 | earns **$4 per guest per night, per store** at midnight |
| 🛝 Playground | 2×2 | $750 | +1 appeal and +1 happiness for tent/popup guests (families) |

### Bulldoze (💥)

Refunds **50% of everything invested** in a structure (build cost + upgrades). Roads refund $7 / $17 / $35 by tier. You can't bulldoze the entrance road or an occupied site, and clearing trees is not refundable.

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

Start at 1, then: +1 picnic table, +firepit tier (0–3), +2 if you have a pool, +1 playground (tent/popup rigs only), +1 bathroom within 8 tiles, +1 if the site touches asphalt.

### The stay

- They drive to the site (0.6 tiles/sec at 1× — a leisurely roll, not a teleport), park, and stay **1–4 nights**.
- **At midnight** they pay the site's current nightly price. Happiness is computed: base 2, +1 table, +firepit tier, +1 pool, +1 playground (tent/popup), clamped 1–5.
- The camp store pays out $4/guest/night per store at the same time.
- On checkout they leave a **1–5 star rating** (rounded happiness) that feeds your running average, and a **tip** if they're happy: (happiness − 3) × $15 for 4–5 stars.
- If a site gets taken or bulldozed while a camper is en route, they re-pick; if nothing's left, they leave.

## Strategy notes

- Tent campers are your bread and butter early: cheap sites, 40% of traffic, modest budgets. Don't overprice the tent sites.
- RV campers pay the most but need big 3×3 sites and budgets start at $80 — an RV site at the default $95 only catches the upper half of RV budgets.
- Firepits and tables are cheap appeal; a pool is the single biggest park-wide boost.
- Asphalt roads near your premium sites quietly add appeal.
- Watch the rating: bad stays (overpriced, no amenities) drag down spawn rate; great stays compound it.

## Current limitations (v1)

- Daytime only, no night shading. No save/load yet. Guests are simple — no complaints, no wandering off-site, no weather or seasons. Roads can be built anywhere (only network-connected ones matter). These are the natural next iteration points.
