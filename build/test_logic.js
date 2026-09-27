'use strict';
const L = require('./logic.js');
let n=0;
function assert(c,msg){ n++; if(!c){ console.error('FAIL:',msg); process.exit(1); } }
function eq(a,b,msg){ assert(a===b, msg+' (got '+a+', want '+b+')'); }
// force a footprint to plain grass (test helper — placement rules still apply)
function flatten(s,x,y,w,h){
  for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){
    const k=L.idx(x+dx,y+dy);
    s.terrain[k]=L.T_GRASS; s.road[k]=L.R_NONE; s.roadLocked[k]=0; s.tileStruct[k]=-1;
  }
  s.structures=s.structures.filter(st=>{
    for(let dy=0;dy<st.h;dy++)for(let dx=0;dx<st.w;dx++)
      if(st.x+dx>=x&&st.x+dx<x+w&&st.y+dy>=y&&st.y+dy<y+h) return false;
    return true;
  });
}

// ---------- map gen ----------
{
  const m = L.genMap(42);
  eq(m.terrain.length, 36*36, 'map size');
  eq(m.nLakes>=1&&m.nLakes<=3, true, '1-3 lakes');
  let water=0, trees=0;
  for(const t of m.terrain){ if(t===L.T_WATER)water++; if(t===L.T_TREE)trees++; }
  assert(water>20, 'lakes have water ('+water+')');
  assert(trees>50, 'trees scattered ('+trees+')');
  // entrance zone clear of water/trees
  for(let y=28;y<36;y++)for(let x=15;x<=21;x++){
    const t=m.terrain[L.idx(x,y)];
    assert(t===L.T_GRASS, 'entrance zone clear at '+x+','+y);
  }
  // deterministic
  const m2=L.genMap(42);
  assert(m.terrain.every((t,i)=>t===m2.terrain[i]), 'genMap deterministic');
}

// ---------- newGame / entrance road ----------
{
  const s=L.newGame(7);
  eq(s.money, L.START_MONEY, 'start money');
  for(let y=L.ENTRANCE_TOP;y<36;y++){
    const k=L.idx(L.ENTRANCE_X,y);
    eq(s.road[k], L.R_ASPHALT, 'entrance asphalt '+y);
    eq(s.roadLocked[k], 1, 'entrance locked '+y);
  }
}

// ---------- roads ----------
{
  const s=L.newGame(7);
  const m0=s.money;
  // find a clear grass tile adjacent to entrance road
  const r=L.buildRoad(s,17,33);
  assert(r.ok&&r.cost===15, 'dirt road built');
  eq(s.road[L.idx(17,33)], L.R_DIRT, 'road tile set');
  eq(s.money, m0-15, 'money deducted');
  const u1=L.buildRoad(s,17,33);
  assert(u1.ok&&u1.upgraded&&s.road[L.idx(17,33)]===L.R_GRAVEL, 'dirt->gravel $20');
  const u2=L.buildRoad(s,17,33);
  assert(u2.ok&&s.road[L.idx(17,33)]===L.R_ASPHALT, 'gravel->asphalt $35');
  const u3=L.buildRoad(s,17,33);
  assert(!u3.ok, 'asphalt->nothing fails');
  const lock=L.buildRoad(s,18,33);
  assert(!lock.ok&&/fixed/.test(lock.msg), 'entrance road locked');
  // road on water fails
  let wk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_WATER){wk=i;break;}
  if(wk>=0){ const wr=L.buildRoad(s,wk%36,(wk/36)|0); assert(!wr.ok&&/water/.test(wr.msg),'no road on water'); }
  // road on tree fails
  let tk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_TREE){tk=i;break;}
  if(tk>=0){ const tr=L.buildRoad(s,tk%36,(tk/36)|0); assert(!tr.ok&&/tree/i.test(tr.msg),'no road on tree'); }
}

// ---------- clear trees ----------
{
  const s=L.newGame(7);
  let tk=-1;
  for(let i=0;i<36*36;i++) if(s.terrain[i]===L.T_TREE){tk=i;break;}
  assert(tk>=0,'tree exists');
  const m0=s.money, x=tk%36, y=(tk/36)|0;
  const r=L.clearTree(s,x,y);
  assert(r.ok&&r.cost===25,'tree cleared $25');
  eq(s.terrain[tk],L.T_GRASS,'tree -> grass');
  eq(s.money,m0-25,'money -25');
  const r2=L.clearTree(s,x,y);
  assert(!r2.ok,'clearing grass fails');
}

// ---------- lake tool ----------
{
  const s=L.newGame(4244);
  flatten(s,10,10,3,3);
  const m0=s.money;
  const r=L.digLake(s,10,10);
  assert(r.ok&&r.cost===30,'lake dug $30');
  eq(s.terrain[L.idx(10,10)],L.T_WATER,'tile is water');
  eq(s.money,m0-30,'money -30');
  assert(!L.digLake(s,10,10).ok,'digging water fails');
  assert(!L.placeSite(s,'tent',10,10).ok,'no site on water');
  L.buildRoad(s,11,10);
  assert(!L.digLake(s,11,10).ok,'no lake on road');
  s.terrain[L.idx(12,10)]=L.T_TREE;
  assert(!L.digLake(s,12,10).ok,'no lake on tree');
  const ps=L.placeSite(s,'tent',10,11);
  assert(ps.ok,'tent site for lake test');
  assert(!L.digLake(s,10,11).ok,'no lake on occupied tile');
  assert(!L.digLake(s,-1,0).ok,'out of bounds fails');
  // bulldoze fills a lake back to grass: free, no refund
  const m1=s.money;
  const b=L.bulldoze(s,10,10);
  assert(b.ok&&b.refund===0,'bulldoze fills lake');
  eq(s.terrain[L.idx(10,10)],L.T_GRASS,'water -> grass');
  eq(s.money,m1,'fill is free');
}

// ---------- sites ----------
{
  const s=L.newGame(7);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  // site with no adjacent road fails
  flatten(s,5,5,1,1);
  const bad=L.placeSite(s,'tent',5,5);
  assert(!bad.ok&&/road access/.test(bad.msg),'site needs road access');
  // ok adjacent
  const m0=s.money;
  const ok=L.placeSite(s,'tent',16,32);
  assert(ok.ok&&ok.cost===120,'tent site placed $120');
  eq(s.money,m0-120,'money -120');
  const st=L.structById(s,ok.id);
  eq(st.price,25,'default price');
  eq(L.structAt(s,16,32),st.id,'tileStruct set');
  // occupied tile fails
  const dup=L.placeSite(s,'tent',16,32);
  assert(!dup.ok,'dup placement fails');
  // 2x2 popup
  const p=L.placeSite(s,'popup',16,30);
  assert(p.ok,'popup placed');
  const pst=L.structById(s,p.id);
  eq(pst.w,2,'popup w=2'); eq(pst.h,2,'popup h=2');
  // price adjust
  L.setSitePrice(s,ok.id,33);
  eq(L.structById(s,ok.id).price,35,'price rounds to 5s');
  L.setSitePrice(s,ok.id,999);
  eq(L.structById(s,ok.id).price,200,'price clamped');
  // upgrades
  const t=L.buyTable(s,ok.id);
  assert(t.ok&&L.structById(s,ok.id).table,'table bought');
  assert(!L.buyTable(s,ok.id).ok,'table twice fails');
  const f1=L.buyFirepit(s,ok.id);
  assert(f1.ok&&f1.tier===1&&f1.cost===25,'firepit tier1 $25');
  const f2=L.buyFirepit(s,ok.id);
  assert(f2.ok&&f2.tier===2&&f2.cost===70,'firepit tier2 $70');
  const f3=L.buyFirepit(s,ok.id);
  assert(f3.ok&&f3.tier===3&&f3.cost===160,'firepit tier3 $160');
  assert(!L.buyFirepit(s,ok.id).ok,'firepit tier4 fails');
}

// ---------- buildings / pool ----------
{
  const s=L.newGame(7);
  s.money+=3000; // test top-up: starting cash is $1,000 by design; this block tests placement rules, not economy
  L.buildRoad(s,17,33); L.buildRoad(s,17,32); L.buildRoad(s,17,31);
  flatten(s,15,30,2,2);
  const b=L.placeBuilding(s,'bathroom',15,30);
  assert(b.ok,'bathroom placed');
  flatten(s,5,5,3,2);
  const st=L.placeBuilding(s,'store',5,5);
  assert(!st.ok&&/road access/.test(st.msg),'store needs road access');
  flatten(s,17,29,7,7); // room for two expansions
  L.buildRoad(s,18,32); // road access in the pool's ring
  const pl=L.placePool(s,19,31);
  assert(pl.ok,'pool placed');
  const pst2=L.structById(s,pl.id);
  eq(pst2.level,0,'pool starts at level 0');
  eq(L.poolRadius(pst2),5,'pool base radius 5');
  // first expansion: 3x3, radius 7
  const ex=L.expandPool(s,pl.id);
  assert(ex.ok&&ex.cost===700,'pool expands once ($700)');
  eq(L.structById(s,pl.id).level,1,'pool level 1');
  eq(L.structById(s,pl.id).w,3,'pool 3x3 after first expand');
  eq(L.poolRadius(L.structById(s,pl.id)),7,'pool radius 7 at level 1');
  // second expansion: 4x4, radius 10
  const ex2=L.expandPool(s,pl.id);
  assert(ex2.ok&&ex2.cost===1200,'pool expands twice ($1200)');
  eq(L.structById(s,pl.id).level,2,'pool level 2');
  eq(L.structById(s,pl.id).w,4,'pool 4x4 after second expand');
  eq(L.poolRadius(L.structById(s,pl.id)),10,'pool radius 10 at level 2');
  const ex3=L.expandPool(s,pl.id);
  assert(!ex3.ok&&/fully expanded/.test(ex3.msg),'third expand fails');
}

// ---------- pool expansion picks a clear direction ----------
{
  const s=L.newGame(7);
  s.money+=3000; // test top-up
  flatten(s,17,29,6,5); // x17..22, y29..33 work area
  L.buildRoad(s,17,33); L.buildRoad(s,17,32); L.buildRoad(s,17,31);
  const pl=L.placePool(s,18,31); // ring touches the road at x=17
  assert(pl.ok,'pool placed for direction test');
  // block the default (right+bottom) growth ring with a tree at (19,33)
  s.terrain[L.idx(19,33)]=L.T_TREE;
  const ex=L.expandPool(s,pl.id);
  assert(ex.ok,'expansion routes around the blocked side');
  const pst=L.structById(s,pl.id);
  eq(pst.y,30,'expanded upward instead of right');
  eq(pst.w,3,'3x3 after rerouted expand');
  // box it in: (right+bottom) already blocked, block (right+top) too;
  // left side is blocked by the road at x=17
  s.terrain[L.idx(21,33)]=L.T_TREE; // (0,0) row y=33
  s.terrain[L.idx(19,29)]=L.T_TREE; // (0,-1) row y=29
  const ex2=L.expandPool(s,pl.id);
  assert(!ex2.ok&&/No room to expand/.test(ex2.msg),'fully boxed-in pool cannot expand');
}

// ---------- fishing dock ----------
{
  const s=L.newGame(7);
  s.money+=9000; // test top-up: dock $1000 + upgrades $1500 + $2000
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  // carve a 2x2 basin next to road-served grass
  L.buildRoad(s,18,30);
  flatten(s,20,30,2,2);
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)
    s.terrain[L.idx(20+dx,30+dy)]=L.T_WATER;
  const ok=L.placeDock(s,20,30);
  assert(ok.ok,'dock placed on water next to road land');
  const dst=L.structById(s,ok.id);
  eq(dst.level,0,'dock starts at level 0');
  eq(L.dockRadius(dst),7,'dock base radius 7');
  // placement rules
  flatten(s,15,30,2,2);
  const gr=L.placeDock(s,15,30);
  assert(!gr.ok&&/must go on water/.test(gr.msg),'dock rejected on grass');
  flatten(s,1,1,2,2);
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)
    s.terrain[L.idx(1+dx,1+dy)]=L.T_WATER;
  const fr=L.placeDock(s,1,1);
  assert(!fr.ok&&/road access nearby/.test(fr.msg),'dock rejected far from road land');
  // radius-limited happiness: site at (16,32) is ~4.2 tiles from the dock
  flatten(s,16,32,1,1);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'site near dock');
  const g={siteId:ps.id,rig:L.RIG_TENT};
  const hp=L.happinessParts(s,g);
  eq(hp.dock,1,'dock +1 happiness within radius');
  eq(hp.final,3,'happiness = base 2 + dock 1');
  // far site gets nothing
  flatten(s,30,30,1,1); L.buildRoad(s,30,29);
  const ps2=L.placeSite(s,'tent',30,30);
  assert(ps2.ok,'far site');
  eq(L.happinessParts(s,{siteId:ps2.id,rig:L.RIG_TENT}).dock,0,'no dock bonus far away');
  eq(L.dockNear(s,20,30,2,2),true,'dockNear true on the dock itself');
  // upgrades
  const u1=L.upgradeDock(s,ok.id);
  assert(u1.ok&&u1.cost===1500&&/Row boats/.test(u1.msg),'dock -> row boats ($1500)');
  eq(L.dockRadius(L.structById(s,ok.id)),9,'dock radius 9 with row boats');
  const u2=L.upgradeDock(s,ok.id);
  assert(u2.ok&&u2.cost===2000&&/Jetskis/.test(u2.msg),'dock -> jetskis ($2000)');
  eq(L.dockRadius(L.structById(s,ok.id)),11,'dock radius 11 with jetskis');
  const u3=L.upgradeDock(s,ok.id);
  assert(!u3.ok&&/fully upgraded/.test(u3.msg),'third dock upgrade fails');
}

// ---------- amenity bonuses are radius-limited ----------
{
  const s=L.newGame(4243);
  s.money+=9000; // test top-up: pool x2 + playground + bathroom
  s.spawnT=1e9;  // no random spawns stealing the test site
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  flatten(s,16,32,1,1);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'site for radius test');
  const st=L.structById(s,ps.id);
  // far pool (~32 tiles away): no bonus
  flatten(s,1,1,2,2); flatten(s,3,1,1,1); L.buildRoad(s,3,1);
  const pl=L.placePool(s,1,1); assert(pl.ok,'far pool placed');
  eq(L.siteAppeal(s,st,L.RIG_TENT),1,'no pool bonus beyond 10 tiles');
  // near pool (~1.6 tiles): +2 appeal
  flatten(s,14,29,2,2); flatten(s,16,30,1,1); L.buildRoad(s,16,30);
  const pl2=L.placePool(s,14,29); assert(pl2.ok,'near pool placed');
  eq(L.siteAppeal(s,st,L.RIG_TENT),3,'pool bonus within 10 tiles (+2)');
  // near playground (~3.8 tiles): +1 for tent/popup, nothing for bigger rigs
  flatten(s,20,29,2,2); flatten(s,22,29,1,1); L.buildRoad(s,22,29);
  const pg=L.placeBuilding(s,'playground',20,29); assert(pg.ok,'near playground placed');
  eq(L.siteAppeal(s,st,L.RIG_TENT),4,'playground bonus within 10 tiles (+1)');
  eq(L.siteAppeal(s,st,L.RIG_MEDIUM),3,'no playground bonus for medium rigs');
  // near bathroom (~0.7 tiles): +1 appeal (was already radius-limited at 8)
  flatten(s,14,33,2,2); flatten(s,14,35,1,1); L.buildRoad(s,14,35);
  const ba=L.placeBuilding(s,'bathroom',14,33); assert(ba.ok,'near bathroom placed');
  eq(L.siteAppeal(s,st,L.RIG_TENT),5,'bathroom bonus within 8 tiles (+1)');
  // nightly happiness follows the same radii
  const g=L.forceSpawn(s,L.RIG_TENT);
  let gd=0;
  while(g.state==='arriving'&&gd++<900) L.tickSim(s,1/60);
  eq(g.state,'camped','camped for radius happiness test');
  L.midnight(s,[]);
  eq(g.happiness,4,'happiness = 2 base + 1 pool + 1 playground (both in radius)');
}

// ---------- bulldoze ----------
{
  const s=L.newGame(7);
  L.buildRoad(s,17,33);
  const m0=s.money;
  const r=L.bulldoze(s,17,33);
  assert(r.ok&&r.refund===7,'dirt refund $7');
  eq(s.money,m0+7,'refund added');
  eq(s.road[L.idx(17,33)],L.R_NONE,'road gone');
  const lock=L.bulldoze(s,18,33);
  assert(!lock.ok,'entrance bulldoze fails');
  L.buildRoad(s,17,33);
  const ps=L.placeSite(s,'tent',16,33);
  const m1=s.money;
  const bs=L.bulldoze(s,16,33);
  assert(bs.ok&&bs.refund===60,'site refund 50% = $60');
  eq(s.money,m1+60,'site refund added');
  // occupied site protected
  L.buildRoad(s,17,32);
  const ps2=L.placeSite(s,'tent',16,32);
  const st=L.structById(s,ps2.id); st.guestId=999;
  assert(!L.bulldoze(s,16,32).ok,'occupied site protected');
}

// ---------- customers: spawn, choose, pay, depart ----------
{
  const s=L.newGame(1234);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'tent site for guest test');
  const g=L.forceSpawn(s,L.RIG_TENT);
  assert(g,'guest spawned');
  assert(g.rig===L.RIG_TENT,'rig tent');
  assert(g.budget>=20&&g.budget<=40,'tent budget range');
  assert(g.siteId>0,'guest chose the tent site');
  assert(g.path.length>1,'has a path');
  // drive until camped
  let guard=0;
  while(g.state==='arriving'&&guard++<600) L.tickSim(s,1/60);
  eq(g.state,'camped','guest camped');
  const st=L.structById(s,ps.id);
  eq(st.guestId,g.id,'site occupied');
  eq(g.price,25,'locked price');
  const m0=s.money, n0=g.nightsLeft;
  // midnight: charge
  L.midnight(s,[]);
  eq(s.money,m0+25,'nightly payment collected');
  eq(g.nightsLeft,n0-1,'one night consumed');
  eq(g.happiness>=1&&g.happiness<=5,true,'happiness in range');
  // run until departure
  guard=0;
  while(s.guests.includes(g)&&guard++<20000){
    if(s.dayT>=L.DAY_LEN-0.01){ /* let tickSim handle */ }
    L.tickSim(s,1/60);
    if(g.state==='camped'&&g.nightsLeft<=0) break;
  }
  // force final departure path completion
  guard=0;
  while(s.guests.includes(g)&&guard++<5000) L.tickSim(s,1/60);
  assert(!s.guests.includes(g),'guest left');
  eq(st.guestId,-1,'site vacant');
  assert(s.ratingN===1,'one rating recorded');
  assert(s.rating>=1&&s.rating<=5,'rating in range');
  assert(s.stats.visitors===1,'visitor counted');
}

// ---------- stay accounting fields + departure report ----------
{
  const s=L.newGame(4321);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'tent site for accounting test');
  L.buyTable(s,ps.id); L.buyFirepit(s,ps.id); // table + tier-1 firepit
  const g=L.forceSpawn(s,L.RIG_TENT);
  let guard=0;
  while(g.state==='arriving'&&guard++<600) L.tickSim(s,1/60);
  eq(g.state,'camped','camped for accounting');
  eq(g.nightsPlanned,g.nightsLeft,'nightsPlanned set on arrival');
  assert(g.nightsPlanned>=1&&g.nightsPlanned<=4,'nightsPlanned in range');
  eq(g.totalPaid,0,'totalPaid starts at 0');
  eq(g.nightsStayed,0,'nightsStayed starts at 0');
  g.nightsLeft=2; // deterministic: exactly two paid nights
  const ev1=[]; L.midnight(s,ev1);
  eq(g.totalPaid,25,'totalPaid after 1 night');
  eq(g.nightsStayed,1,'nightsStayed after 1 night');
  const ev2=[]; L.midnight(s,ev2);
  eq(g.totalPaid,50,'totalPaid accumulates across midnights');
  eq(g.nightsStayed,2,'nightsStayed increments per midnight');
  const dep=ev2.find(e=>e.t==='depart');
  assert(dep&&dep.report,'depart event carries report');
  const r=dep.report;
  eq(r.rig,L.RIG_TENT,'report rig');
  assert(r.budget>=20&&r.budget<=40,'report budget in tent range');
  eq(r.siteCls,'Tent site','report site class');
  eq(r.sitePrice,25,'report site price');
  eq(r.nightsPlanned,g.nightsPlanned,'report nightsPlanned');
  eq(r.nightsStayed,2,'report nightsStayed');
  eq(r.totalPaid,50,'report totalPaid');
  eq(r.happy.base,2,'happy base 2');
  eq(r.happy.table,1,'happy table +1');
  eq(r.happy.firepit,1,'happy firepit tier 1');
  eq(r.happy.pool,0,'happy pool 0');
  eq(r.happy.playground,0,'happy playground 0 (none built)');
  eq(r.happy.final,4,'happy final = 2+1+1');
  eq(r.stars,4,'report stars = rounded happiness');
  eq(r.tip,15,'report tip for happiness 4');
  assert(typeof r.ratingBefore==='number'&&typeof r.ratingAfter==='number','report ratings before/after');
  const hp=L.happinessParts(s,g);
  eq(hp.final,L.guestHappiness(s,g),'happinessParts consistent with guestHappiness');
}

// ---------- turnawayReason branches ----------
{
  const s=L.newGame(31337);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const {visited}=L.bfsRoads(s);
  eq(L.turnawayReason(s,L.RIG_TENT,30,visited),'no vacant sites','reason: nothing vacant');
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'tent site for reason test');
  eq(L.turnawayReason(s,L.RIG_RV,140,visited),'no vacant site fits this rig','reason: rig too big');
  L.setSitePrice(s,ps.id,200);
  eq(L.turnawayReason(s,L.RIG_TENT,30,visited),'no fitting site within budget','reason: over budget');
  L.setSitePrice(s,ps.id,25);
  L.bulldoze(s,17,32); L.bulldoze(s,17,33);
  const v2=L.bfsRoads(s).visited;
  eq(L.turnawayReason(s,L.RIG_TENT,30,v2),'no affordable site reachable by road','reason: unreachable');
}

// ---------- drive-through when no site fits ----------
{
  const s=L.newGame(555);
  const ev=[];
  const g=L.forceSpawn(s,L.RIG_RV);
  assert(g.siteId===-1,'no site -> drive-through');
  let guard=0;
  while(s.guests.includes(g)&&guard++<3000){
    const e=L.tickSim(s,1/60); ev.push(...e);
  }
  assert(ev.some(e=>e.t==='turnedAway'),'turnedAway event');
  const ta=ev.find(e=>e.t==='turnedAway');
  assert(ta&&typeof ta.reason==='string'&&ta.reason.length>0,'turnedAway carries a reason');
  assert(/no vacant sites/.test(ta.reason),'reason names the cause (got "'+ta.reason+'")');
  assert(typeof ta.budget==='number','turnedAway carries budget');
  eq(s.stats.turnedAway,1,'turnedAway counted');
  assert(!s.guests.includes(g),'drive-through guest gone');
}

// ---------- price filter: overpriced site rejected ----------
{
  const s=L.newGame(999);
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  const ps=L.placeSite(s,'tent',16,32);
  L.setSitePrice(s,ps.id,200); // way over tent budget
  const g=L.forceSpawn(s,L.RIG_TENT);
  eq(g.siteId,-1,'overpriced site rejected');
}

// ---------- smaller rig fits larger site ----------
{
  const s=L.newGame(1000);
  s.money+=500; // test top-up: starting cash is $1,000 by design; rv site alone costs $1,000
  L.buildRoad(s,17,32); L.buildRoad(s,17,33); // spur off the entrance road
  flatten(s,15,29,3,3);
  const ps=L.placeSite(s,'rv',15,29); // 3x3 at 15..17 x 29..31, road-adjacent at (17,32)
  assert(ps.ok,'rv site placed');
  L.setSitePrice(s,ps.id,20); // min tent budget — always affordable
  const g=L.forceSpawn(s,L.RIG_TENT);
  eq(g.siteId,ps.id,'tent rig fits rv site');
}

// ---------- store revenue ----------
{
  const s=L.newGame(2000);
  s.money+=1000; // test top-up: starting cash is $1,000 by design; store alone costs $1,400
  L.buildRoad(s,17,33); L.buildRoad(s,17,32); L.buildRoad(s,17,31); L.buildRoad(s,19,31);
  flatten(s,16,32,1,1);
  L.placeSite(s,'tent',16,32);
  flatten(s,19,29,3,2);
  const bs=L.placeBuilding(s,'store',19,29); // 3x2 at 19..21,29..30 adjacent to road 19,31
  assert(bs.ok,'store placed');
  const g=L.forceSpawn(s,L.RIG_TENT);
  let guard=0;
  while(g.state==='arriving'&&guard++<600) L.tickSim(s,1/60);
  const m0=s.money;
  L.midnight(s,[]);
  assert(s.money===m0+33,'store pays $8/guest/night ($25 site fee + $8 store), got '+(s.money-m0));
}

// ---------- day/night cycle ----------
{
  const s=L.newGame(3000);
  s.dayT=0; s.spawnT=1e9;
  const d0=s.day;
  L.tickSim(s,44);
  eq(s.day,d0,'day does not roll over during the 45s day portion');
  L.tickSim(s,17); // through dusk + night + dawn wrap
  eq(s.day,d0+1,'day rolls over at cycle wrap (60s)');
  // midnight economy fires at the wrap
  const s2=L.newGame(3001);
  s2.spawnT=1e9;
  L.buildRoad(s2,17,33); L.buildRoad(s2,17,32);
  flatten(s2,16,32,1,1);
  const ps=L.placeSite(s2,'tent',16,32);
  assert(ps.ok,'site for midnight test');
  L.setSitePrice(s2,ps.id,20); // min tent budget — always affordable
  const g=L.forceSpawn(s2,L.RIG_TENT);
  let guard=0;
  while(g.state==='arriving'&&guard++<900) L.tickSim(s2,1/60);
  eq(g.state,'camped','guest camped');
  const m0=s2.money, d1=s2.day;
  s2.dayT=L.CYCLE_LEN-0.05;
  L.tickSim(s2,0.1);
  eq(s2.day,d1+1,'wrap advances day');
  eq(s2.money,m0+g.price,'wrap collects nightly payment');
}

// ---------- lightingFor phases ----------
{
  eq(L.lightingFor(0).dayness,1,'midday = full day');
  eq(L.lightingFor(0.74).dayness,1,'day until f=0.75');
  eq(L.lightingFor(0.75).dayness,1,'dusk starts at full day');
  eq(L.lightingFor(0.82).dayness,0,'full night at f=0.82');
  eq(L.lightingFor(0.9).dayness,0,'night at f=0.9');
  const dusk=L.lightingFor(0.785).dayness;
  assert(dusk>0.3&&dusk<0.7,'dusk is mid-transition ('+dusk+')');
  const dawn=L.lightingFor(0.965).dayness;
  assert(dawn>0.3&&dawn<0.7,'dawn is mid-transition ('+dawn+')');
  assert(L.lightingFor(1).dayness>0.99,'dayness ~1 right at wrap');
  assert(L.lightingFor(0.999).dayness>0.99,'dayness ~1 just before wrap');
  assert(L.lightingFor(0.9).sunI<L.lightingFor(0.2).sunI,'sun dimmer at night');
  assert(L.lightingFor(0.9).hemiI<L.lightingFor(0.2).hemiI,'hemi dimmer at night');
  assert(L.lightingFor(0.9).sky!==L.lightingFor(0.2).sky,'sky color differs night/day');
  assert(L.lightingFor(0.9).sunColor!==L.lightingFor(0.2).sunColor,'sun color differs night/day');
}

// ---------- rng state get/set ----------
{
  const r=L.makeRng(99);
  r(); r();
  const st=r.get();
  const a=r(), b=r();
  r.set(st);
  eq(r(),a,'rng resumes after set (1)');
  eq(r(),b,'rng resumes after set (2)');
}

// ---------- save/load round trip ----------
{
  const s=L.newGame(4242);
  s.spawnT=1e9; // no random spawns during the test
  L.buildRoad(s,17,33); L.buildRoad(s,17,32);
  flatten(s,16,32,1,1);
  const ps=L.placeSite(s,'tent',16,32);
  assert(ps.ok,'site for save test');
  L.buyTable(s,ps.id); L.buyFirepit(s,ps.id); L.setSitePrice(s,ps.id,30);
  const g=L.forceSpawn(s,L.RIG_TENT);
  let guard=0;
  while(g.state==='arriving'&&guard++<900) L.tickSim(s,1/60);
  eq(g.state,'camped','guest camped before save');
  s.money=9876; s.day=5; s.rating=4.2; s.ratingN=7; s.dayT=33.3;
  const json=L.saveState(s);
  const s2=L.loadState(json);
  eq(s2.money,9876,'money survives');
  eq(s2.day,5,'day survives');
  eq(s2.dayT,33.3,'dayT survives');
  eq(s2.structures.length,s.structures.length,'structures survive');
  eq(s2.guests.length,1,'guest survives');
  eq(s2.guests[0].state,'camped','guest state survives');
  eq(s2.guests[0].siteId,g.siteId,'guest siteId survives');
  assert(s2.guests[0].path.length>1,'guest path survives');
  eq(s2.rating,4.2,'rating survives');
  eq(s2.ratingN,7,'ratingN survives');
  eq(s2.rng.get(),s.rng.get(),'rng state survives');
  eq(L.structAt(s2,16,32),ps.id,'tileStruct rebuilt');
  const st2=L.structById(s2,ps.id);
  eq(st2.table,true,'table flag survives');
  eq(st2.firepit,1,'firepit tier survives');
  eq(st2.price,30,'price survives');
  // the loaded game keeps simulating
  const d0=s2.day;
  L.tickSim(s2,L.CYCLE_LEN-s2.dayT+0.1);
  eq(s2.day,d0+1,'loaded game rolls over');
  // corrupt saves throw (game.js catches these and boots fresh)
  let threw=false;
  try{ L.loadState('not json'); }catch(e){ threw=true; }
  assert(threw,'corrupt save throws');
  threw=false;
  try{ L.loadState('{"v":999}'); }catch(e){ threw=true; }
  assert(threw,'wrong version throws');
}

// ---------- spawn interval scales with rating ----------
{
  const s=L.newGame(4000);
  s.rating=5;
  assert(L.spawnInterval(s)<L.spawnInterval(Object.assign({},s,{rating:1})),'higher rating -> faster spawns');
}

console.log('logic OK — '+n+' asserts');
