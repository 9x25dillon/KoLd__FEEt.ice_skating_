import type { SkaterState } from "../sim/types.ts";
import { JUMP_PHASE } from "../sim/jump.ts";
import { MOVE } from "../sim/types.ts";
import type { RewardEvent } from "./rewards.ts";

export const SNOWFLAKES = [{x:4,y:0},{x:9,y:1},{x:14,y:4},{x:18,y:9},{x:16,y:15},{x:10,y:19},{x:3,y:21},{x:-4,y:18},{x:-9,y:12},{x:-9,y:5},{x:-5,y:0}];
export const PUCK_STARTS=[{x:7,y:-3},{x:3,y:9},{x:-12,y:15}];
export const TARGETS=[{x:19,y:-3},{x:3,y:25},{x:-20,y:15}];
export class Playground {
  readonly rewards: RewardEvent[] = [];
  flakes=SNOWFLAKES.map(()=>0);
  pucks=PUCK_STARTS.map(p=>({...p,vx:0,vy:0,cooldown:0,touch:0}));
  score=0;
  flow=0;
  bestSpeed=0;
  message="Collect snowflakes. Knock pucks into the gold targets.";
  toast=0;
  private landed=-1;
  private spinning=false;
  sample(s: SkaterState,dt:number) {
    this.rewards.length=0;
    const speed=Math.hypot(s.vel.x,s.vel.y), ground=!s.fallen && s.jump.phase!==JUMP_PHASE.Air;
    this.bestSpeed=Math.max(this.bestSpeed,speed);
    this.toast=Math.max(0,this.toast-dt);
    this.flow=Math.max(0,Math.min(100,this.flow+(s.fallen ? -25 : speed>3 ? speed*0.6 : -1)*dt));
    this.flakes=this.flakes.map((cool,i)=> {
      if(cool>0) return Math.max(0,cool-dt);
      if(ground && Math.hypot(s.pos.x-SNOWFLAKES[i].x,s.pos.y-SNOWFLAKES[i].y)<2) {
        this.reward(100,"Snowflake +100",{...SNOWFLAKES[i],kind:"snowflake"});this.flow=Math.min(100,this.flow+8);return 18;
      }
      return 0;
    });
    this.pucks.forEach((p,i)=> {
      p.touch=Math.max(0,p.touch-dt);
      if(p.cooldown>0) {p.cooldown-=dt;if(p.cooldown<=0) Object.assign(p,PUCK_STARTS[i],{vx:0,vy:0});return;}
      if(ground && speed>.5 && p.touch===0 && Math.hypot(s.pos.x-p.x,s.pos.y-p.y)<1.2) {
        p.vx=s.vel.x*1.3;p.vy=s.vel.y*1.3;p.touch=.5;
        this.message="Puck away! Aim for a gold target";this.toast=2;
      }
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      const v=Math.hypot(p.vx,p.vy), drag=Math.max(0,1-0.65*dt/Math.max(v,.001));p.vx*=drag;p.vy*=drag;
      const goal=TARGETS.find(t=>Math.hypot(t.x-p.x,t.y-p.y)<2.4);
      if(goal) {this.reward(500,"GOAL! +500",{...goal,kind:"goal"});p.cooldown=5;}
      if(Math.abs(p.x)>27 || p.y< -9 || p.y>45) {p.cooldown=3;}
    });
    if(s.landed.tick>=0 && this.landed!==s.landed.tick) {
      this.landed=s.landed.tick;
      if(!s.landed.fall) this.reward(300+Math.round(s.landed.turned)*150,`LANDED · ${s.landed.turned.toFixed(1)} rotations`,{...s.pos,kind:"jump"});
    }
    if(s.move===MOVE.Spin && s.spin.swept>=Math.PI*4 && !this.spinning) {this.reward(300,"SICK SPIN! +300",{...s.pos,kind:"spin"});this.spinning=true;}
    if(s.move!==MOVE.Spin) this.spinning=false;
  }
  private reward(points:number,message:string,event:Omit<RewardEvent,"points">) {
    this.score+=points;this.message=message;this.toast=3;this.rewards.push({...event,points});
  }
}
