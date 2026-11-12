import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine,emptyControls} from '../bridge/engine.mjs';
import {CareerState} from '../runtime/game/career.js';
import {STYLES} from '../runtime/game/styles.js';

const idle=()=>({...emptyControls(),hardware:{connected:true,axes:[0,0,0,0],buttons:Array(16).fill(0),keys:[]}});
const run=(e,limit=60*400)=>{for(let k=0;k<limit&&!e.finished;k++)e.advance(idle(),12);return e;};

test('the catalog carries the modes, career first, and every backstory',()=>{
 const c=new IceEngine().catalog();
 assert.equal(c.modes[0].id,'career');
 assert.equal(Object.keys(c.backstories).length,c.rivals.length);
 assert.ok(c.creator.origins.length>=6);
 assert.equal(c.arcade.ladder.length,6);
});

test('create a skater: an origin, a trade, a name, kept, then a career that is theirs',()=>{
 const e=new IceEngine();
 let f=e.sheetEdit({action:'new',origin:'gymnast'});
 assert.equal(f.sheet.origin,'gymnast');
 assert.ok(f.sheet.overall>=49.7&&f.sheet.overall<=50.3);
 f=e.sheetEdit({action:'trade',from:'stamina',to:'strength'});
 assert.equal(f.sheet.stats.strength,51);
 assert.throws(()=>e.sheetEdit({action:'trade',from:'spring',to:'spring'}),/different/);
 f=e.sheetEdit({action:'set',field:'name',value:'Wren'});
 assert.throws(()=>e.sheetEdit({action:'set',field:'heightM',value:3}),/off the lists/);
 // A new origin keeps the name.
 f=e.sheetEdit({action:'new',origin:'ballet'});assert.equal(f.sheet.name,'Wren');
 f=e.sheetEdit({action:'save',slot:0});
 assert.equal(f.studio.skaters[0].name,'Wren');
 assert.ok(f.characters.some(c=>c.id==='created:0'&&c.name==='Wren'));
 f=e.newCareer(0);
 assert.equal(f.career.skater.name,'Wren');
 assert.equal(STYLES[f.career.style].id,'finesse');
 // The career run bakes their style: Finesse's free leg is stronger than the reference's.
 e.start({mode:'career',event:0});
 const plain=new IceEngine();plain.start({mode:'career',event:0});
 assert.ok(e.params.freeLegTorqueMax>plain.params.freeLegTorqueMax,'Finesse at a week drilled');
});

test('a native career with no style skates exactly as before',()=>{
 const a=new IceEngine(),b=new IceEngine(new CareerState().serialize());
 a.start({mode:'career',event:0});b.start({mode:'career',event:0});
 assert.deepEqual(a.params,b.params);
 assert.equal(a.career.style,-1);
});

test('an arcade round: the rival\'s measured target, no wear, a life for an unfinished program',()=>{
 const e=new IceEngine();
 let f=e.arcadeStart('rival:Katya Vell');
 assert.equal(f.arcade.rounds.length,5,'Katya never skates herself');
 assert.equal(f.who.name,'Katya Vell');
 const wear={...e.career.wear};
 run(e);
 assert.ok(e.finished);
 const a=e.result.arcade;
 assert.ok(a&&!a.won&&a.lives===2,'standing still loses the round');
 assert.equal(e.result.title,'Ansa Merrow holds');
 assert.deepEqual(e.career.wear,wear,'arcade costs the career nothing');
 assert.throws(()=>e.arcadeStart('rival:Nobody'),/Unknown skater/);
});

test('an exhibition places nobody; a showcase is the computer skating, and says what it left out',()=>{
 const e=new IceEngine();
 e.start({mode:'exhibition',character:'rival:Remi Castellan',program:['glide','pose']});
 run(e);
 assert.ok(e.finished&&e.result.standings===null);
 const f=e.start({mode:'showcase',character:'rival:Noor Ashdown',program:['glide','step','edge','pose'],dance:{style:'tango',track:0,seed:3}});
 assert.deepEqual(f.showcase.left,['step']);
 assert.deepEqual(f.routine.sequence,['glide','edge','pose']);
 assert.equal(f.runDance,'tango');
 run(e);
 assert.ok(e.finished);
 assert.match(e.result.story,/Step sequence/);
 assert.ok(e.result.protocol,'scored like any program');
 assert.throws(()=>e.start({mode:'showcase',program:['step','spiral']}),/none/);
});

test('studio shelves keep programs and dances; a bad one is refused',()=>{
 const e=new IceEngine();
 let f=e.studioEdit({action:'program',slot:0,value:{name:'Mine',elements:['glide','jump','pose']}});
 assert.deepEqual(f.studio.programs[0].elements,['glide','jump','pose']);
 f=e.studioEdit({action:'dance',slot:1,value:{name:'Waltz',style:'waltz',track:0,seed:5}});
 assert.equal(f.studio.dances[1].style,'waltz');
 assert.throws(()=>e.studioEdit({action:'program',slot:1,value:{name:'x',elements:['fly']}}));
 f=e.studioEdit({action:'clear',shelf:'programs',slot:0});
 assert.equal(f.studio.programs[0],null);
 const back=new IceEngine(null,null,e.studio.serialize());
 assert.equal(back.studio.dances[1].name,'Waltz');
});

test('a showcase sends the computer\'s pad and what it is doing, for the on-screen controller; other runs send none',()=>{
 const e=new IceEngine();
 let f=e.start({mode:'showcase',character:'career',program:['glide','crossover','edge','pose']});
 let pressed=0,leaned=0,said=new Set();
 for(let k=0;k<600&&!e.finished;k++){f=e.advance(idle(),2);const p=f.pilotPad;assert.ok(p);
  if(p.buttons.some(b=>b>0))pressed++;if(Math.abs(p.axes[0])>.05)leaned++;said.add(p.doing);}
 assert.ok(pressed>0&&leaned>0,`buttons ${pressed}, sticks ${leaned}`);
 assert.ok([...said].some(d=>/tap A/.test(d)),[...said].join(' | '));
 assert.equal(e.start({mode:'free'}).pilotPad,null);
});
