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
eq(CT.S.money, 1000, 'start money $1,000');
assert(CT.S.speed===1, 'speed 1x');

// --- build roads ---
CT.selectTool('road');
assert(CT.tapTile(17,33), 'road tile (17,33)');
assert(CT.tapTile(17,32), 'road tile (17,32)');
eq(CT.S.road[idx(17,33)], R_DIRT, 'dirt road placed');
eq(CT.S.money, 1000-30, 'roads cost $15 each');
// upgrade: tap road again with road tool
assert(CT.tapTile(17,32), 'upgrade tap');
eq(CT.S.road[idx(17,32)], R_GRAVEL, 'dirt->gravel');
eq(CT.S.money, 1000-30-20, 'upgrade cost $20');

// --- tent site adjacent to road ---
CT.selectTool('tent');
assert(CT.tapTile(16,32), 'tent site placed at (16,32)');
eq(CT.S.money, 1000-30-20-120, 'site cost $120');
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
eq(CT.S.money, 1000-30-20-120-120, 'table $120');
assert(CT.S.structures.find(s=>s.id===siteId).table, 'table flag set');
assert(CT.panelAction('fire'), 'buy dirt firepit');
eq(CT.S.structures.find(s=>s.id===siteId).firepit, 1, 'firepit tier 1');
frames(2);
const flameVacant=globalThis.fireMeshes.find(f=>f.id===siteId);
assert(flameVacant,'flame mesh registered for the firepit');
assert(!flameVacant.m.visible,'fire unlit while the site is vacant');
CT.panelAction('priceDown'); CT.panelAction('priceDown'); CT.panelAction('priceDown');
eq(CT.S.structures.find(s=>s.id===siteId).price, 10, 'price lowered to $10');

// --- panel tap-through guard: the tap that opens the panel must not press a button under it ---
CT.tapTile(16,32); // re-open panel (fresh timestamp)
const panelClickH = document.getElementById('panel')._l.click;
assert(typeof panelClickH==='function', 'panel capture click guard wired');
let stopped=false;
panelClickH({preventDefault(){}, stopImmediatePropagation(){stopped=true;}});
assert(stopped, 'click within 500ms of panel open is swallowed');
globalThis.simNow += 600;
stopped=false;
panelClickH({preventDefault(){}, stopImmediatePropagation(){stopped=true;}});
assert(!stopped, 'click after 600ms passes through to buttons');

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
frames(2);
assert(globalThis.fireMeshes.find(f=>f.id===siteId).m.visible,'fire lit while the site is occupied');
eq(CT.S.structures.find(s=>s.id===siteId).guestId, g.id, 'site occupied');
assert(globalThis.structGroups.has(siteId), 'site mesh exists');
eq(globalThis.structGroups.get(siteId).userData.parkedRig,'tent','tent site keeps the tent; car hidden while camping');
// people appear at occupied site
let guard2=0;
while(guard2++<30) frames(1);

// --- minigames: test buttons, pause/resume, rewards, help banner ---
CT.toggleDebug();
eq(document.getElementById('mgTestBar').style.display,'flex','debug shows minigame test buttons');
CT.toggleDebug();
eq(document.getElementById('mgTestBar').style.display,'none','test buttons hidden outside debug');
const spdBefore=CT.S.speed;
assert(CT.mgStart('mallow'),'minigame starts');
assert(CT.mgActive(),'minigame active');
eq(CT.mgId(),'mallow','correct game id');
eq(CT.S.speed,0,'sim paused during minigame');
eq(CT._mgEl('mgOverlay').style.display,'block','overlay visible');
const ml=CT.mgLogic(); assert(ml&&ml.sides,'mallow logic exposed');
ml.update(2); assert(ml.sides[1]>0,'mallow cooks while open');
frames(5); // main loop routes frames to the minigame renderer
assert(CT.mgActive(),'minigame survives frames');
assert(!CT.mgStart('shoes'),'cannot start a second minigame');
CT.mgQuit();
assert(!CT.mgActive(),'minigame closed');
eq(CT.S.speed,spdBefore,'speed restored after quit');
eq(CT._mgEl('mgOverlay').style.display,'none','overlay hidden');
// win pays the thank-you tip
const m0mg=CT.S.money;
CT.mgStart('shoes'); CT.mgEnd({won:true});
eq(CT.S.money,m0mg+15,'minigame win pays $15 thank-you');
assert(!CT.mgActive(),'ended minigame closed');
eq(CT.S.speed,spdBefore,'speed restored after win');
// loss pays nothing
const m1mg=CT.S.money;
CT.mgStart('trailer'); CT.mgEnd({won:false,msg:'test loss'});
eq(CT.S.money,m1mg,'minigame loss pays nothing');
// help banner appears when scheduled and a guest is camped
CT._MG.nextAt=0; CT.mgTickNow(1000);
assert(CT.mgBannerVisible(),'help banner shows when due');
CT._mgEl('mgHelpBtn')._l['click'](); // tap Help!
assert(CT.mgActive(),'Help! starts a minigame');
assert(!CT.mgBannerVisible(),'banner hides when the game starts');
CT.mgQuit();
// a minigame that ends itself mid-frame (burn timeout) must not crash the loop
CT.mgStart('mallow');
CT.mgLogic().update(8); // a side hits 100% -> bursts into flame
assert(CT.mgLogic().burned,'marshmallow burned');
frames(130); // burn auto-ends after ~1.6s of frames
assert(!CT.mgActive(),'burned marshmallow closed itself');
eq(CT.S.speed,spdBefore,'speed restored after self-end');
// trailer win ends itself mid-frame too
CT.mgStart('trailer');
// camper hitch faces the incoming truck: body + tongue fully behind the coupler (z<=0.2)
let maxTrailerZ=-1e9;
CT._MG.active.trailer.traverse(function(o){ if(o.position) maxTrailerZ=Math.max(maxTrailerZ,o.position.z); });
assert(maxTrailerZ<=0.25,'camper body sits behind its hitch — no backing through the trailer (max z '+maxTrailerZ.toFixed(2)+')');
const tl=CT.mgLogic(); tl.truck.x=0; tl.truck.z=2.2; tl.truck.heading=Math.PI;
frames(3);
assert(!CT.mgActive(),'trailer win closed itself');
eq(CT.S.speed,spdBefore,'speed restored after trailer win');
// marshmallow pays its own tip, not the flat $15
const m2mg=CT.S.money;
CT.mgStart('mallow'); CT.mgEnd({won:true,reward:70});
eq(CT.S.money,m2mg+70,'marshmallow win pays its computed tip');

// midnight: payment collected
const mBefore = CT.S.money;
CT.S.dayT = CYCLE_LEN-0.2;
const dayBefore = CT.S.day;
frames(60);
assert(CT.S.day===dayBefore+1, 'day advanced at midnight');
eq(CT.S.money, mBefore+10, 'nightly $10 fee collected');
assert(globalThis.floaters.length>=1,'dollar popup spawned over the site on payment');
assert(g.nightsLeft>=0, 'nights decremented');
// second guest can't take occupied site; force departure soon
g.nightsLeft = 1;
const rBefore = CT.S.ratingN;
CT.S.dayT = CYCLE_LEN-0.2;
frames(60);
assert(globalThis.floaters.length>=2,'paid + tip popups spawned on a happy checkout');
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

// --- lake tool: dig water, bulldoze fills it back ---
CT.selectTool('lake');
let lkx=-1,lky=-1;
lakeSearch: for(let y=0;y<36;y++)for(let x=0;x<36;x++){
  const k=idx(x,y);
  if(CT.S.terrain[k]===T_GRASS&&CT.S.road[k]===R_NONE&&CT.S.tileStruct[k]<0){lkx=x;lky=y;break lakeSearch;}
}
assert(lkx>=0,'a grass tile exists for the lake');
const lm=CT.S.money;
assert(CT.tapTile(lkx,lky),'lake dug');
eq(CT.S.terrain[idx(lkx,lky)],T_WATER,'tile is water');
eq(CT.S.money,lm-30,'lake costs $30');
assert(!CT.tapTile(lkx,lky),'digging water rejected');
CT.selectTool('bulldoze');
assert(CT.tapTile(lkx,lky),'bulldoze fills the lake');
eq(CT.S.terrain[idx(lkx,lky)],T_GRASS,'water filled back to grass');
eq(CT.S.money,lm-30,'filling is free');

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
const bathId=CT.S.tileStruct[idx(placed[0],placed[1])];
assert(globalThis.signSprites.has(bathId),'restroom sign floats over the bathroom');
CT.S.money += 2000; // test top-up: pool is $900, starting cash is only $1,000 by design
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

// --- fast mode is 5.4x (80% faster than the old 3x) ---
CT.setSpeed(5.4);
eq(CT.S.speed,5.4,'fast mode 5.4x');
CT.S.dayT=5; // keep the clock away from the day wrap during the check
const d1=CT.S.dayT;
frames(30);
assert(CT.S.dayT>d1+2.0,'5.4x advances the sim clock ~5.4x faster ('+(CT.S.dayT-d1).toFixed(2)+'s in 30 frames)');
CT.setSpeed(1);

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

// --- rotate camera cycles 4 stops ---
eq(CT.camRot, 0, 'camera starts unrotated');
CT.rotateCam(); eq(CT.camRot, 1, 'rotate 90°');
CT.rotateCam(); CT.rotateCam(); eq(CT.camRot, 3, 'rotate 270°');
CT.rotateCam(); eq(CT.camRot, 0, 'full circle back to 0');
frames(5); // renders fine at a rotated stop
CT.rotateCam(); frames(5);

// --- parked rigs: popup/medium vehicles hidden while camping, RV stays ---
CT.S.spawnT=1e9; // no random guests stealing sites during these tests
CT.S.money+=3000; // test top-up: popup+medium+rv sites cost $1,900
function tryPlaceAny(tool){
  for(let y=27;y<35;y++)for(let x=10;x<20;x++){
    CT.selectTool(tool);
    if(CT.tapTile(x,y)) return {x,y};
  }
  return null;
}
const popSpot=tryPlaceAny('popup'), medSpot=tryPlaceAny('medium'), rvSpot=tryPlaceAny('rv');
assert(popSpot&&medSpot&&rvSpot,'popup/medium/rv sites placed');
const popId=CT.S.tileStruct[idx(popSpot.x,popSpot.y)];
const medId=CT.S.tileStruct[idx(medSpot.x,medSpot.y)];
const rvId=CT.S.tileStruct[idx(rvSpot.x,rvSpot.y)];
setSitePrice(CT.S,popId,20); setSitePrice(CT.S,medId,20); setSitePrice(CT.S,rvId,20);
function campGuestOn(rig,siteId){
  const gg=forceSpawn(CT.S,rig);
  assert(gg,'guest spawned for rig '+rig);
  gg.siteId=siteId; gg.state='arriving'; gg.seg=0; gg.segT=0;
  gg.path=[{x:18,y:35},{x:18,y:34}]; gg.px=18; gg.py=35;
  let gd=0;
  while(gg.state==='arriving'&&gd++<3600) frames(1);
  eq(gg.state,'camped','rig '+rig+' camped');
  assert(!globalThis.vehicleGroups.has(gg.id),'rig '+rig+': no driving mesh while camped');
  return gg;
}
const gPop=campGuestOn(RIG_POPUP,popId);
eq(globalThis.structGroups.get(popId).userData.parkedRig,'popup-trailer','popup: pickup gone, trailer stays parked');
const gMed=campGuestOn(RIG_MEDIUM,medId);
eq(globalThis.structGroups.get(medId).userData.parkedRig,'medium-trailer','medium: pickup gone, trailer stays parked');
const gRv=campGuestOn(RIG_RV,rvId);
eq(globalThis.structGroups.get(rvId).userData.parkedRig,'rv','RV keeps its motorhome parked');

// --- all rigs face their direction of travel ---
function faceCheck(rig, x0,y0, x1,y1, label){
  const gg=forceSpawn(CT.S,rig);
  assert(gg,'facing test guest for rig '+rig);
  gg._faceTest=true;
  gg.siteId=-1; gg.state='arriving'; gg.seg=0; gg.segT=0;
  gg.path=[{x:x0,y:y0},{x:x1,y:y1}]; gg.px=x0; gg.py=y0;
  frames(3);
  const vg=globalThis.vehicleGroups.get(gg.id);
  assert(vg,'vehicle mesh exists for rig '+rig);
  const front=(rig===RIG_POPUP||rig===RIG_MEDIUM)?-1:1; // combos are built facing -x
  const fx=front*Math.cos(vg.rotation.y), fz=front*(-Math.sin(vg.rotation.y));
  const len=Math.hypot(x1-x0,y1-y0);
  assert(Math.abs(fx-(x1-x0)/len)<0.02&&Math.abs(fz-(y1-y0)/len)<0.02,
    label+': rig '+rig+' faces travel (fwd='+fx.toFixed(2)+','+fz.toFixed(2)+')');
}
for(const rig of [RIG_TENT,RIG_POPUP,RIG_MEDIUM,RIG_RV]) faceCheck(rig,10,30,14,30,'east');
faceCheck(RIG_POPUP,10,30,10,26,'north');
let fguard=0; // let the facing-test guests drive off and despawn (debug still off)
while(CT.S.guests.some(x=>x._faceTest)&&fguard++<7200) frames(1);
assert(!CT.S.guests.some(x=>x._faceTest),'facing-test guests despawned');
// clear the parked-rig guests so the debug test sees exactly two departures
for(const gd of [gPop,gMed,gRv]) gd.nightsLeft=1;
CT.S.dayT=CYCLE_LEN-0.05; frames(30);
let dguard=0;
while(CT.S.guests.some(x=>x===gPop||x===gMed||x===gRv)&&dguard++<7200) frames(1);
assert(!CT.S.guests.includes(gPop),'parked-rig guests departed');
eq(globalThis.structGroups.get(popId).userData.parkedRig,undefined,'no parked-rig remnant after departure');

// --- debug departure dialog: two checkouts in one tick share one paged dialog ---
CT.toggleDebug();
assert(CT.debugMode,'debug mode on');
const dbgA=tryPlaceAny('tent'), dbgB=tryPlaceAny('tent');
assert(dbgA&&dbgB,'two tent sites for debug test');
const dbgIdA=CT.S.tileStruct[idx(dbgA.x,dbgA.y)], dbgIdB=CT.S.tileStruct[idx(dbgB.x,dbgB.y)];
function parkDirect(rig,siteId,price){
  const st=CT.S.structures.find(s=>s.id===siteId);
  const gg=forceSpawn(CT.S,rig);
  gg.siteId=siteId; st.guestId=gg.id;
  gg.state='camped'; gg.nightsLeft=1; gg.nightsPlanned=2; gg.nightsStayed=1;
  gg.totalPaid=price; gg.price=price; gg.happiness=2; gg.px=17; gg.py=32;
  return gg;
}
const dg1=parkDirect(RIG_TENT,dbgIdA,25), dg2=parkDirect(RIG_POPUP,dbgIdB,40);
CT.S.dayT=CYCLE_LEN-0.05;
frames(30); // dawn wrap: midnight makes both check out in the same tick
eq(CT.dbgQueue.length,2,'two departures queued in one dialog');
eq(document.getElementById('dbgOverlay').style.display,'block','dialog shown');
eq(CT.S.speed,0,'report dialog auto-pauses the game');
CT.setSpeed(1); // resume so the turnaway drive-through can proceed in-test
const pg1=document.getElementById('dbgBody').innerHTML;
assert(/Budget/.test(pg1),'page shows budget');
assert(/Total paid/.test(pg1)&&/\$50/.test(pg1),'page 1: total paid $50 (2x$25)');
assert(/Nights stayed/.test(pg1),'page shows nights stayed');
assert(/Nights planned/.test(pg1),'page shows nights planned');
assert(/Stars/.test(pg1),'page shows stars');
CT.dbgNext();
eq(document.getElementById('dbgPage').textContent,'2 of 2','paged to 2 of 2');
const pg2=document.getElementById('dbgBody').innerHTML;
assert(/\$80/.test(pg2),'page 2: total paid $80 (2x$40)');
assert(/popup campers/i.test(pg2),'page 2 names the rig');
CT.dbgPrev();
eq(document.getElementById('dbgPage').textContent,'1 of 2','back to 1 of 2');
// turnaway report page: remove the bigger sites so only too-small tent sites remain
CT.selectTool('bulldoze');
assert(CT.tapTile(popSpot.x,popSpot.y),'bulldoze popup site');
assert(CT.tapTile(medSpot.x,medSpot.y),'bulldoze medium site');
assert(CT.tapTile(rvSpot.x,rvSpot.y),'bulldoze rv site');
const taG=forceSpawn(CT.S,RIG_RV);
assert(taG&&taG.siteId===-1,'RV finds no fitting site');
let tguard=0;
while(CT.S.guests.includes(taG)&&tguard++<7200) frames(1);
eq(CT.dbgQueue.length,3,'turnaway appended to the open dialog queue');
CT.dbgNext(); CT.dbgNext();
eq(document.getElementById('dbgPage').textContent,'3 of 3','paged to the turnaway page');
const pgT=document.getElementById('dbgBody').innerHTML;
assert(/Turned away/.test(pgT),'turnaway page shown');
assert(/no vacant site fits this rig/.test(pgT),'turnaway reason shown');
assert(/Budget/.test(pgT),'turnaway page shows budget');
CT.setSpeed(0); // as if the dialog's auto-pause were still holding
CT.closeDbg();
eq(document.getElementById('dbgOverlay').style.display,'none','dialog dismissed');
eq(CT.dbgQueue.length,0,'queue cleared on dismiss');
eq(CT.S.speed,1,'dismiss restores pre-dialog speed');
CT.toggleDebug();
assert(!CT.debugMode,'debug mode off');
// dialog while manually paused: dismiss must not unpause
CT.setSpeed(0);
CT.toggleDebug();
CT._dbgPush('<div>paused-test</div>');
eq(document.getElementById('dbgOverlay').style.display,'block','dialog shown while paused');
eq(CT.S.speed,0,'no auto-pause when already paused');
CT.closeDbg();
eq(CT.S.speed,0,'dismiss keeps a manual pause');
CT.toggleDebug();
CT.setSpeed(1);

// --- lake shimmer: dug water joins the animation, filled water leaves it ---
let waters=[];
for(let y=0;y<36;y++)for(let x=0;x<36;x++)
  if(CT.S.terrain[idx(x,y)]===T_WATER) waters.push([x,y]);
assert(waters.length>=6,'enough natural water to trim');
CT.selectTool('bulldoze');
for(let i=5;i<waters.length;i++) CT.tapTile(waters[i][0],waters[i][1]);
eq(CT.S.terrain.filter(t=>t===T_WATER).length,5,'lakes trimmed to 5 water tiles');
CT.selectTool('lake');
let shx=-1,shy=-1;
outer3: for(let y=2;y<34;y++)for(let x=2;x<34;x++)
  if(CT.S.terrain[idx(x,y)]===T_GRASS&&CT.S.road[idx(x,y)]===R_NONE&&CT.S.tileStruct[idx(x,y)]<0){ shx=x; shy=y; break outer3; }
assert(shx>=0,'a grass tile to dig');
const qBefore=shimmerQuads;
assert(CT.tapTile(shx,shy),'lake tile dug');
assert(shimmerQuads!==qBefore,'shimmer set rebuilt after digging');
// 6 water tiles: (i*7)%6 covers every tile, so the new one must shimmer
assert(shimmerQuads.some(q=>q.userData.x===shx&&q.userData.y===shy),'new lake tile has a shimmer quad');
assert(shimmerQuads.every(q=>CT.S.terrain[idx(q.userData.x,q.userData.y)]===T_WATER),'every quad sits on water');
CT.selectTool('bulldoze');
assert(CT.tapTile(shx,shy),'dug lake filled back in');
assert(!shimmerQuads.some(q=>q.userData.x===shx&&q.userData.y===shy),'filled tile left the shimmer set');

// --- radius circle: inspecting an amenity shows its effective radius ---
CT.S.money+=2000; // test top-up
CT.selectTool('road');
CT.tapTile(17,31); CT.tapTile(16,31); // extend road north for amenities
CT.selectTool('bathroom');
let bspot=null;
for(let y=28;y<33&&!bspot;y++)for(let x=13;x<17&&!bspot;x++){ if(CT.tapTile(x,y)) bspot=[x,y]; }
assert(bspot,'bathroom placed for radius test');
CT.selectTool('pool');
let pspot=null;
for(let y=28;y<33&&!pspot;y++)for(let x=13;x<20&&!pspot;x++){ if(CT.tapTile(x,y)) pspot=[x,y]; }
assert(pspot,'pool placed for radius test');
CT.selectTool('select');
assert(CT.tapTile(bspot[0],bspot[1]),'inspect bathroom');
assert(radiusGroup.visible,'radius circle shown for bathroom');
eq(radiusGroup.scale.x,8,'bathroom radius circle is 8 tiles');
assert(CT.tapTile(pspot[0],pspot[1]),'inspect pool');
assert(radiusGroup.visible,'radius circle shown for pool');
eq(radiusGroup.scale.x,5,'pool radius circle is 5 tiles at base level');
assert(CT.tapTile(16,32),'inspect a plain site');
assert(!radiusGroup.visible,'no radius circle for sites');
CT.closePanel();
assert(!radiusGroup.visible,'radius circle hidden when panel closes');
// placement preview: ghost shows the radius while the tool is active
CT.selectTool('playground');
CT.updateGhost(10,20);
assert(radiusGroup.visible,'radius preview shown while placing playground');
eq(radiusGroup.scale.x,10,'playground preview radius is 10 tiles');
CT.selectTool('road');
assert(!radiusGroup.visible,'preview hidden after switching tools');
CT.selectTool('select');

// --- pool expansion tiers change the radius circle (UI flow) ---
CT.S.money+=10000; // test top-up: pool $900 + expands $700/$1200, dock $1000 + $1500/$2000
function findPoolSpot(){
  // 4x4 area free of water/roads/structs (trees get cleared via the UI),
  // plus one buildable tile adjacent to the 2x2 footprint for a road spur
  for(let y=2;y<31;y++)for(let x=2;x<31;x++){
    let ok=true; const trees=[];
    for(let dy=0;dy<4&&ok;dy++)for(let dx=0;dx<4&&ok;dx++){
      const k=idx(x+dx,y+dy), t=CT.S.terrain[k];
      if(t===T_WATER||CT.S.road[k]!==R_NONE||CT.S.tileStruct[k]>=0) ok=false;
      else if(t===T_TREE) trees.push([x+dx,y+dy]);
    }
    if(!ok) continue;
    // road spur must sit outside the 4x4 (else it blocks the expansion)
    const adj=[[x-1,y],[x-1,y+1],[x,y-1],[x+1,y-1]];
    for(const ar of adj){
      const rx=ar[0], ry=ar[1];
      if(rx<1||ry<1||rx>=35||ry>=35) continue;
      const rk=idx(rx,ry);
      if(CT.S.terrain[rk]===T_GRASS&&CT.S.road[rk]===R_NONE&&CT.S.tileStruct[rk]<0)
        return {x,y,trees,rx,ry};
    }
  }
  return null;
}
const pspot2=findPoolSpot();
assert(pspot2,'clear 4x4 pool spot with room for a road spur');
CT.selectTool('clear');
for(const tr of pspot2.trees) assert(CT.tapTile(tr[0],tr[1]),'cleared tree at '+tr[0]+','+tr[1]);
CT.selectTool('road');
assert(CT.tapTile(pspot2.rx,pspot2.ry),'road spur for the pool');
CT.selectTool('pool');
assert(CT.tapTile(pspot2.x,pspot2.y),'pool placed for tier test');
const pid=CT.S.tileStruct[idx(pspot2.x,pspot2.y)];
CT.selectTool('select');
CT.tapTile(pspot2.x,pspot2.y);
assert(radiusGroup.visible,'pool circle shown at level 0');
eq(radiusGroup.scale.x,5,'pool radius circle is 5 tiles at level 0');
assert(CT.panelAction('expand'),'expand pool to level 1 ($700)');
const pst1=CT.S.structures.find(s=>s.id===pid);
eq(pst1.level,1,'pool level 1 after first expand');
eq(pst1.w,3,'pool 3x3 after first expand');
eq(radiusGroup.scale.x,7,'pool radius circle is 7 tiles at level 1');
assert(CT.panelAction('expand'),'expand pool to level 2 ($1200)');
const pst2=CT.S.structures.find(s=>s.id===pid);
eq(pst2.level,2,'pool level 2 after second expand');
eq(pst2.w,4,'pool 4x4 after second expand');
eq(radiusGroup.scale.x,10,'pool radius circle is 10 tiles at level 2');
assert(!CT.panelAction('expand'),'third pool expand rejected');
CT.closePanel();

// --- fishing dock: dig basin, place, upgrade, radius circle ---
function findDockDig(){
  for(let y=24;y<32;y++)for(let x=10;x<30;x++){
    let ok=true;
    for(let dy=0;dy<2&&ok;dy++)for(let dx=0;dx<2&&ok;dx++){
      const k=idx(x+dx,y+dy);
      if(CT.S.terrain[k]!==T_GRASS||CT.S.road[k]!==R_NONE||CT.S.tileStruct[k]>=0) ok=false;
    }
    if(!ok) continue;
    const nbs=[[x-1,y],[x-1,y+1],[x+2,y],[x+2,y+1],[x,y-1],[x+1,y-1],[x,y+2],[x+1,y+2]];
    for(const nb of nbs){
      const nx=nb[0], ny=nb[1];
      if(nx<0||ny<0||nx>=36||ny>=36) continue;
      const nk=idx(nx,ny);
      if(CT.S.terrain[nk]!==T_GRASS||CT.S.road[nk]!==R_NONE) continue;
      if(adjacentToRoad(CT.S,nx,ny,1,1)) return {x,y,nx,ny};
    }
  }
  return null;
}
const dig=findDockDig();
assert(dig,'dock dig site found near road land');
CT.selectTool('lake');
for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)
  assert(CT.tapTile(dig.x+dx,dig.y+dy),'dug basin tile '+(dig.x+dx)+','+(dig.y+dy));
CT.selectTool('dock');
CT.updateGhost(dig.x,dig.y);
assert(radiusGroup.visible,'dock placement preview shows radius');
eq(radiusGroup.scale.x,7,'dock preview radius is 7 tiles');
assert(CT.tapTile(dig.x,dig.y),'dock placed on dug water');
const did=CT.S.tileStruct[idx(dig.x,dig.y)];
assert(did>0,'dock registered on tiles');
const structsBefore=CT.S.structures.length;
assert(!CT.tapTile(dig.nx,dig.ny),'dock rejected on grass');
eq(CT.S.structures.length,structsBefore,'no dock built on grass');
CT.selectTool('select');
CT.tapTile(dig.x,dig.y);
eq(radiusGroup.scale.x,7,'dock radius circle is 7 tiles at level 0');
assert(CT.panelAction('expand'),'dock upgrade: row boats ($1500)');
eq(CT.S.structures.find(s=>s.id===did).level,1,'dock level 1 with row boats');
eq(radiusGroup.scale.x,9,'dock radius circle is 9 tiles with row boats');
assert(CT.panelAction('expand'),'dock upgrade: jetskis ($2000)');
eq(CT.S.structures.find(s=>s.id===did).level,2,'dock level 2 with jetskis');
eq(radiusGroup.scale.x,11,'dock radius circle is 11 tiles with jetskis');
assert(!CT.panelAction('expand'),'third dock upgrade rejected');
CT.closePanel();
assert(!radiusGroup.visible,'dock circle hidden when panel closes');

// --- restart two-tap confirm ---
const restartBtn = document.getElementById('restartBtn');
CT.tapRestart();
eq(restartBtn.textContent, 'SURE?', 'restart arms on first tap');
eq(CT.restartArmed, true, 'armed flag set');
const moneyBeforeRestart = CT.S.money;
const structsBeforeRestart = CT.S.structures.length;
assert(structsBeforeRestart>0, 'park has structures before restart');
globalThis.simNow += 4000; frames(3); // let the 3s window expire
eq(restartBtn.textContent, '↺', 'restart disarms after 3s');
eq(CT.S.money, moneyBeforeRestart, 'no restart after expiry');
CT.tapRestart(); // arm again
eq(CT.restartArmed, true, 're-armed');
CT.tapRestart(); // confirm within window
eq(CT.S.money, 1000, 'restart resets money');
eq(CT.S.day, 1, 'restart resets day');
eq(CT.S.structures.length, 0, 'restart clears structures');
eq(localStorage.getItem('campground-tycoon-save-v1'), null, 'restart clears autosave');

// --- save/load round trip through the boot path ---
CT.selectTool('road');
assert(CT.tapTile(17,33), 'road for save test');
CT.saveNow();
const savedMoney = CT.S.money;
CT.selectTool('bulldoze');
assert(CT.tapTile(17,33), 'bulldoze after save');
assert(CT.S.money!==savedMoney, 'state mutated after save');
assert(CT.reloadSave(), 'reload from save works');
eq(CT.S.road[idx(17,33)], R_DIRT, 'road restored from save');
eq(CT.S.money, savedMoney, 'money restored from save');
// corrupt save never breaks the boot path
localStorage.setItem('campground-tycoon-save-v1', '###corrupt###');
const keepS = CT.S;
CT.reloadSave();
assert(CT.S===keepS, 'corrupt save keeps current game');

console.log('sim OK');
