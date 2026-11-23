import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IceEngine} from '../bridge/engine.mjs';

const idle={hardware:{connected:true,axes:[0,0,0,0],buttons:Array(16).fill(0),keys:[]}};

test("Program elements is offered to every setup and runs on the player's own",()=>{
 const e=new IceEngine();
 const course=e.catalog().courses.find(c=>c.id==='program');
 assert.ok(course,'in the catalog');
 assert.deepEqual([...course.setups].sort(),['diggate','experimental','explorer','repertoire','simulation']);
 for(const setup of course.setups){
  const x=new IceEngine();x.configure({setup});x.start({mode:'lesson',course:'program'});
  const f=x.advance(idle,2);
  assert.equal(f.tutorial.total,5,setup);
  assert.equal(f.tutorial.course,'program',setup);
 }
});

test("its new steps reach the snapshot in the career's words",()=>{
 const e=new IceEngine();e.configure({setup:'explorer'});e.start({mode:'lesson',course:'program'});
 while(e.lesson.step?.id!=='crossover')e.lesson.skip();
 const f=e.advance(idle,2);
 assert.match(f.tutorial.how,/through the curve/);
 assert.match(f.tutorial.how,/Two crossovers/);
 assert.equal(f.tutorial.unproven,'','no unproven-air note: this course has its own jump step');
});
