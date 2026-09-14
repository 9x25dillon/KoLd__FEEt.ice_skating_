import type { SkaterState } from "../sim/types.ts";
export const ROOKIE_GATES = Array.from({length:8},(_,i)=>{
  const angle=(i+1)*Math.PI/12;
  return {x:18*Math.sin(angle),y:18-18*Math.cos(angle),angle,jump:i===2 || i===6};
});
export class RookieCourse {
  index=0;
  cleared=0;
  score=0;
  knocked=ROOKIE_GATES.flatMap(()=>[0,0]);
  results: boolean[]=[];
  message="Follow the curved lane. Start steering before each gate.";
  toast=0;
  get done(){return this.index===ROOKIE_GATES.length;}
  get target(){return ROOKIE_GATES[Math.min(this.index,7)];}
  get title(){return this.done ? `Course complete · ${this.cleared}/8` : this.target.jump ? "Jump the foam bar" : this.index<2 ? "Carving lesson" : "Hold the curved edge";}
  get hint(){return this.done ? "R to try for a clean run. You can keep skating." : this.target.jump ? "Tap J / D-pad up about 6 metres before the bar. Manual: hold Shift briefly, then release." : this.index<2 ? "Let Cruise push. Hold A / left gently to follow the curve; release to straighten. Start turning early." : "Keep a smooth left curve through the cones. X / LT slows you down if the turn runs wide.";}
  sample(s:SkaterState,dt:number){
    this.toast=Math.max(0,this.toast-dt);
    this.knocked=this.knocked.map(v=>Math.max(0,v-dt));
    if(s.fallen || this.done)return;
    ROOKIE_GATES.forEach((g,i)=>{
      for(let side=0;side<2;side++){
        const offset=side ? 3.8 : -3.8;
        const x=g.x+Math.sin(g.angle)*offset,y=g.y-Math.cos(g.angle)*offset;
        const k=i*2+side;
        if(!this.knocked[k] && s.jump.z<.3 && Math.hypot(s.pos.x-x,s.pos.y-y)<.65){
          this.knocked[k]=4;this.score=Math.max(0,this.score-25);this.message="Soft cone down · keep going!";this.toast=2;
        }
      }
    });
    const distance=Math.hypot(s.pos.x-this.target.x,s.pos.y-this.target.y);
    const airborne=s.jump.z>=.18;
    if(distance<(this.target.jump ? airborne ? 2.6 : 1.2 : 3.3)){
      const success=!this.target.jump || airborne;
      this.results.push(success);this.index++;
      if(success){this.cleared++;this.score+=airborne?500:200;this.message=airborne ? "CLEARED! +500" : "Smooth carve +200";}
      else this.message="Missed the jump bonus — the next gate is ahead";
      this.toast=3;
    }
  }
}
