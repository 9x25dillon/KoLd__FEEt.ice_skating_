import {createInterface} from 'node:readline';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {IceEngine} from './engine.mjs';
const saveDir=resolve(process.argv[2]??'.');mkdirSync(saveDir,{recursive:true});
const savePath=join(saveDir,'career-v1.json');
let saved=null;try{saved=readFileSync(savePath,'utf8');}catch{}
const engine=new IceEngine(saved);
function save(){const data=engine.career.serialize();if(data===saved)return;writeFileSync(savePath+'.tmp',data);renameSync(savePath+'.tmp',savePath);saved=data;}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{
 let req;
 try{
  if(line.length>64*1024)throw Error('Request too large');
  req=JSON.parse(line);let data;
  switch(req.op){
   case 'hello':data={catalog:engine.catalog(),frame:engine.snapshot()};break;
   case 'start':data=engine.start(req.options);break;
   case 'configure':engine.configure(req.options);data=engine.snapshot();break;
   case 'frame':data=engine.advance(req.controls,req.ticks,req.low);break;
   case 'train':engine.train(req.stat);data=engine.snapshot();break;
   case 'export':{const path=join(saveDir,'ice-run-replay.json');writeFileSync(path,engine.exportReplay());data={path};break;}
   case 'replay':{const path=join(saveDir,'ice-run-replay.json');if(!existsSync(path))throw Error('Save a replay first');data=engine.replay(readFileSync(path,'utf8'));break;}
   case 'metrics':{const path=join(saveDir,'session-metrics.json');writeFileSync(path,JSON.stringify(engine.meter.summary(),null,2));data={path};break;}
   case 'quit':save();process.exit(0);break;
   default:throw Error('Unknown command');
  }
  let saveError=null;try{save();}catch(error){saveError='Could not save career: '+error.message;}
  process.stdout.write(JSON.stringify({id:req.id,ok:true,data,saveError})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({id:req?.id??0,ok:false,error:error.message})+'\n');}
});
lines.on('close',()=>process.exit(0));
