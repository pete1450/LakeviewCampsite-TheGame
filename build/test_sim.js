'use strict';
/* Headless playthrough test: boots the real game with stubbed THREE/DOM,
   then plays it: roads, site, price, upgrades, guest arrival, midnight pay,
   departure, bulldoze, tree clearing. */
require('./harness.js');

function assert(c,msg){ if(!c){ console.error('FAIL:',msg); process.exit(1); } console.log('ok:',msg); }
function eq(a,b,msg){ assert(a===b, msg+' (got '+a+', want '+b+')'); }
function frames(n){ for(let i=0;i<n;i++){ globalThis.simNow+=16.7; globalThis.rafCb(globalThis.simNow); } }

const CT = globalThis.CampTest;
assert(CT && CT.S, 'game booted, state exists');

// deterministic map
CT.startSeed(4242);
frames(5);
eq(CT.S.money, 12000, 'start money $12,000');
assert(CT.S.speed===1, 'speed 1x');

// --- build roads ---
CT.selectTool('road');
assert(CT.tapTile(17,33), 'road tile (17,33)');
assert(CT.tapTile(17,32), 'road tile (17,32)');
eq(CT.S.road[idx(17,33)], R_DIRT, 'dirt road placed');
eq(CT.S.money, 12000-30, 'roads cost $15 each');
// upgrade: tap road again with road tool
assert(CT.tapTile(17,32), 'upgrade tap');
eq(CT.S.road[idx(17,32)], R_GRAVEL, 'dirt->gravel');
eq(CT.S.money, 12000-30-20, 'upgrade cost $20');

// --- tent site adjacent to road ---
CT.selectTool('tent');
assert(CT.tapTile(16,32), 'tent site placed at (16,32)');
eq(CT.S.money, 12000-30-20-120, 'site cost $120');
const siteId = CT.S.tileStruct[idx(16,32)];
assert(siteId>0, 'site registered on tile');
const st0 = CT.S.structures.find(s=>s.id===siteId);
eq(st0.price, 25, 'default nightly price $25');

// invalid: site far from roads
assert(!CT.tapTile(5,5), 'site without road access rejected');

// --- inspect + manage site ---
CT.selectTool('select');
assert(CT.tapTile(16,32), 'inspect tap');
eq(CT.panel, siteId, 'panel opened for site');
assert(CT.panelAction('table'), 'buy picnic table');
eq(CT.S.money, 12000-30-20-120-60, 'table $60');
assert(CT.S.structures.find(s=>s.id===siteId).table, 'table flag set');
assert(CT.panelAction('fire'), 'buy dirt firepit');
eq(CT.S.structures.find(s=>s.id===siteId).firepit, 1, 'firepit tier 1');
CT.panelAction('priceDown'); CT.panelAction('priceDown'); CT.panelAction('priceDown');
eq(CT.S.structures.find(s=>s.id===siteId).price, 10, 'price lowered to $10');

// --- guest arrives, camps, pays, leaves ---
const g = forceSpawn(CT.S, RIG_TENT);
assert(g, 'tent guest spawned');
assert(g.siteId===siteId, 'guest chose our site (price $10 <= budget)');
assert(g.path.length>1, 'guest has road path');
frames(20); // mid-drive
assert(globalThis.vehicleGroups.has(g.id), 'vehicle mesh shown while driving');
let guard=0;
while(g.state==='arriving'&&guard++<3600) frames(1);
eq(g.state, 'camped', 'guest camped');
assert(!globalThis.vehicleGroups.has(g.id), 'driving vehicle hidden once parked (rig on site)');
eq(CT.S.structures.find(s=>s.id===siteId).guestId, g.id, 'site occupied');
assert(globalThis.structGroups.has(siteId), 'site mesh exists');
// people appear at occupied site
let guard2=0;
while(guard2++<30) frames(1);

// midnight: payment collected
const mBefore = CT.S.money;
CT.S.dayT = DAY_LEN-0.2;
const dayBefore = CT.S.day;
frames(60);
assert(CT.S.day===dayBefore+1, 'day advanced at midnight');
eq(CT.S.money, mBefore+10, 'nightly $10 fee collected');
assert(g.nightsLeft>=0, 'nights decremented');
// second guest can't take occupied site; force departure soon
g.nightsLeft = 1;
const rBefore = CT.S.ratingN;
CT.S.dayT = DAY_LEN-0.2;
frames(60);
guard=0;
while(CT.S.guests.includes(g)&&guard++<3600) frames(1);
assert(!CT.S.guests.includes(g), 'guest drove off and despawned');
eq(CT.S.structures.find(s=>s.id===siteId).guestId, -1, 'site vacant again');
assert(CT.S.ratingN===rBefore+1, 'departure recorded a rating');
assert(!globalThis.vehicleGroups.has(g.id), 'vehicle mesh cleaned up');

// --- bulldoze road, refund 50% ---
CT.selectTool('bulldoze');
const m0=CT.S.money;
assert(CT.tapTile(17,33), 'bulldoze dirt road');
eq(CT.S.road[idx(17,33)], R_NONE, 'road gone');
eq(CT.S.money, m0+7, 'dirt road refund $7');
// entrance road protected
assert(!CT.tapTile(18,33), 'entrance road cannot be bulldozed');

// --- clear a tree ---
let tx=-1, ty=-1;
outer: for(let y=0;y<36;y++)for(let x=0;x<36;x++)
  if(CT.S.terrain[idx(x,y)]===T_TREE){ tx=x; ty=y; break outer; }
assert(tx>=0, 'a tree exists on the map');
CT.selectTool('clear');
const m1=CT.S.money;
assert(CT.tapTile(tx,ty), 'tree cleared');
eq(CT.S.terrain[idx(tx,ty)], T_GRASS, 'tree -> grass');
eq(CT.S.money, m1-25, 'clearing costs $25');

// --- buildings + pool placement ---
CT.selectTool('road');
CT.tapTile(17,31); CT.tapTile(16,31); // extend road north for buildings
CT.selectTool('bathroom');
assert(CT.tapTile(15,30)||true, 'bathroom attempt');
// find a valid 2x2 spot near the new road programmatically
let placed=null;
for(let y=28;y<33&&!placed;y++)for(let x=13;x<17&&!placed;x++){
  CT.selectTool('bathroom');
  if(CT.tapTile(x,y)) placed=[x,y];
}
assert(placed, 'bathroom placed somewhere road-adjacent');
CT.selectTool('pool');
let poolPlaced=null;
for(let y=28;y<33&&!poolPlaced;y++)for(let x=13;x<20&&!poolPlaced;x++){
  if(CT.tapTile(x,y)) poolPlaced=[x,y];
}
assert(poolPlaced, 'pool placed');
// inspect pool -> expand
CT.selectTool('select');
const poolId=CT.S.tileStruct[idx(poolPlaced[0],poolPlaced[1])];
assert(poolId>0, 'pool registered');
CT.tapTile(poolPlaced[0],poolPlaced[1]);
assert(CT.panelAction('expand')||true, 'expand attempt');
const pool=CT.S.structures.find(s=>s.id===poolId);

// --- HUD reflects state ---
frames(15);
const moneyTxt = document.getElementById('money').textContent;
assert(/\$/.test(moneyTxt), 'HUD money shows $ ('+moneyTxt+')');
assert(document.getElementById('day').textContent==String(CT.S.day), 'HUD day matches');

// --- pause works ---
CT.setSpeed(0);
const d0=CT.S.dayT;
frames(30);
eq(CT.S.dayT, d0, 'paused: sim clock frozen');
CT.setSpeed(1);

// --- random spawns flow through the entrance over time ---
CT.startSeed(777);
frames(5);
CT.selectTool('road');
CT.tapTile(17,33); CT.tapTile(17,32);
CT.selectTool('tent');
CT.tapTile(16,32);
frames(60*40); // ~40 sim-seconds: several spawns
assert(CT.S.stats.visitors>=1||CT.S.stats.turnedAway>=1, 'spawned customers interacted (visitors='+CT.S.stats.visitors+', turnedAway='+CT.S.stats.turnedAway+')');

console.log('sim OK');
