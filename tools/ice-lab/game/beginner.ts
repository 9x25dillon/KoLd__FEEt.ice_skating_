import type { Params } from "../sim/params.ts";
import type { SkaterState, SkatingInput } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import { JUMP_PHASE, JUMP } from "../sim/jump.ts";
import { GAME_PARAMS } from "./controls.ts";

// Explicit game assists; the lab preset and solver remain unchanged.
export const BEGINNER_PARAMS: Params = {
  ...GAME_PARAMS, fallError: 0.6, fallErrorTime: 0.9,
  landingShock: 0.3, strokePower: 4.4, jumpImpulse: 3.8,
};

/** Predict rotation using the same fixed-step inertia and ballistic equations as the solver. */
function touchdown(s: SkaterState, p: Params, carriage: number) {
  let z=s.jump.z, vz=s.jump.vz, inertia=s.jump.inertia, angle=s.jump.rotation;
  const dt=1/120, wanted=p.jumpInertiaTucked+(p.inertiaOpen-p.jumpInertiaTucked)*carriage;
  for(let i=0;i<240;i++) {
    inertia += Math.sign(wanted-inertia)*Math.min(Math.abs(wanted-inertia),p.inertiaPullRate*dt);
    angle += s.jump.angMomentum/inertia*dt;
    vz -= p.gravity*dt; z += vz*dt;
    if(z<=0) break;
  }
  return angle;
}

/** Owns an input sequence, never writes skater state or injects momentum. */
export class BeginnerCoach {
  private loading = -1;
  private wasAir = false;
  private target = 0;
  message = "Build speed, then tap J / D-pad up for a spin jump";
  apply(raw: SkatingInput, s: SkaterState, p: Params, trick: boolean, dt: number): SkatingInput {
    const input={...raw}, speed=Math.hypot(s.vel.x,s.vel.y);
    if(s.fallen) { this.loading=-1; this.wasAir=false; this.message="Tap Space / A to get straight back up"; return input; }
    if(trick && this.loading<0 && s.move===MOVE.None && s.jump.phase===JUMP_PHASE.None) {
      if(speed>=2.5) { this.loading=0; this.message="Loading your spin jump…"; }
      else this.message="A little more speed — hold Space / A";
    }
    if(this.loading>=0 && s.jump.phase!==JUMP_PHASE.Air) {
      this.loading+=dt;
      input.knee=this.loading<0.32 ? 0.95 : 0;
      input.carriage=Math.min(0.95,0.28+speed*0.065);
      input.lean=0; input.pitch=0; input.weight=0.5;
      input.push=false; input.turn=false; input.spin=false; input.twizzle=false; input.inaBauer=false; input.toe=false;
      if(this.loading>=0.32) this.loading=-1;
    }
    const air=s.jump.phase===JUMP_PHASE.Air;
    if(air) {
      if(!this.wasAir) {
        const min=touchdown(s,p,1), max=touchdown(s,p,0);
        const unit=s.jump.kind<0 ? Math.PI : 2*Math.PI;
        const offset=s.jump.kind===JUMP.Axel ? Math.PI : 0;
        this.target=Math.floor((max-offset)/unit)*unit+offset;
        if(this.target<min) this.target=Math.round(((min+max)/2-offset)/unit)*unit+offset;
      }
      // Bisection picks arms-open amount that brings rotation onto a landing angle.
      let lo=0,hi=1;
      for(let i=0;i<12;i++) {
        const mid=(lo+hi)/2;
        if(touchdown(s,p,mid)>this.target) lo=mid; else hi=mid;
      }
      input.carriage=(lo+hi)/2; input.knee=0.9; input.weight=1; input.lean=0; input.pitch=0;
      this.message="Flying! Landing assist is checking your rotation";
    } else if(this.wasAir) this.message=s.landed.fall ? "You went for it. Tap Space / A and try again" : "Stuck the landing — build speed for another!";
    else if(this.loading<0) {
      // Reduce excessive digital lean demands while retaining the blade's real carve.
      const limit=Math.min(0.38,0.12+speed*0.032);
      input.lean=Math.max(-limit,Math.min(limit,input.lean));
      if(input.push) input.knee=Math.max(input.knee,0.55);
    }
    this.wasAir=air;
    return input;
  }
}
