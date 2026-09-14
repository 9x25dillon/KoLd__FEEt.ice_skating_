import { bodyPoints } from "../app/draw.ts";
import type { V3 } from "../app/draw.ts";
import type { SkaterState } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import { LIGHTS, LIGHT_RADIUS } from "./run.ts";
import { SNOWFLAKES, TARGETS } from "./playground.ts";
import type { Playground } from "./playground.ts";
import { ROOKIE_GATES } from "./rookie.ts";
import type { RookieCourse } from "./rookie.ts";
import { Camera, VIEW } from "../app/camera.ts";

export class SkateScene {
  overview = false;
  zoom = 1;
  readonly camera = new Camera();
  private map = new Camera();
  constructor() { this.camera.view = VIEW.Chase; this.camera.chaseElevation = 36; }
  reset(s: SkaterState) { this.camera.snap(s); }
  update(s: SkaterState, dt: number) { this.camera.update(s, dt); }
  /** A screen-space stick must rotate with the camera, not the spinning body. */
  worldAim(x: number, y: number) {
    const yaw = this.overview ? Math.PI / 2 : this.camera.yaw;
    return { x: x * Math.sin(yaw) + y * Math.cos(yaw), y: -x * Math.cos(yaw) + y * Math.sin(yaw) };
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: SkaterState, p: Params,
    trail: Array<Array<{x:number; y:number; contact:boolean}>>, low: boolean, target: number | null, playground: Playground | null = null, rookie: RookieCourse | null = null) {
    const scale = this.overview ? Math.max(5, Math.min(w / 67, h / 45)) : Math.min(78, Math.max(42, h / 10)) * this.zoom;
    const cam = this.overview ? this.map : this.camera;
    if(this.overview) { cam.cx=0; cam.cy=18; }
    cam.zoom = scale / 26;
    const matrix = cam.groundMatrix(w,h);
    const cx = cam.cx, cy = cam.cy;
    const project = (v: V3): [number, number] => cam.project(v.x,v.y,v.z);
    const ice = ctx.createLinearGradient(0, 0, 0, h);
    ice.addColorStop(0, "#b8d0dd"); ice.addColorStop(0.6, "#e0eff0"); ice.addColorStop(1, "#a9cbd5");
    ctx.fillStyle = ice; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.transform(...matrix);
    // Ice etchings, centre circle and boards establish scale and direction.
    ctx.lineWidth = 0.015; ctx.strokeStyle = "#739daa25";
    const radius = Math.max(w, h * 2) / scale;
    for (let x = Math.floor(cx - radius); x < cx + radius; x += 2) {
      ctx.beginPath(); ctx.moveTo(x, cy - radius); ctx.lineTo(x + 8, cy + radius); ctx.stroke();
    }
    ctx.strokeStyle = "#618d9c35"; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(0, 18, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([0.3, 0.8]); ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(0, 18, 22, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = "#839ab34a"; ctx.lineWidth = 0.12;
    for (const y of [0, 18, 36]) { ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(26, y); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 18, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#526c8866"; ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.roundRect(-28, -10, 56, 56, 9); ctx.stroke();
    ctx.strokeStyle = "#f9ffff"; ctx.lineWidth = 0.15; ctx.stroke();
    if(rookie) {
      ctx.beginPath();ctx.arc(0,18,18,-Math.PI/2,Math.PI/6);ctx.strokeStyle="#9f7acc20";ctx.lineWidth=7.2;ctx.stroke();
      ctx.setLineDash([.4,.6]);ctx.strokeStyle="#85659a88";ctx.lineWidth=.045;ctx.stroke();ctx.setLineDash([]);
      if(!rookie.done){const g=rookie.target;ctx.beginPath();ctx.arc(g.x,g.y,3.3,0,Math.PI*2);ctx.fillStyle="#62bf8b28";ctx.fill();ctx.strokeStyle="#4a987b";ctx.lineWidth=.06;ctx.stroke();}
    }
    if(playground) for(const goal of TARGETS){
      ctx.beginPath();ctx.arc(goal.x,goal.y,2.4,0,Math.PI*2);ctx.fillStyle="#f4c45c25";ctx.fill();ctx.strokeStyle="#b78735";ctx.lineWidth=.1;ctx.stroke();
      ctx.beginPath();ctx.arc(goal.x,goal.y,1.8,0,Math.PI*2);ctx.lineWidth=.025;ctx.stroke();
    }
    for (const blade of trail) {
      let touching = false;
      ctx.beginPath();
      for (const v of blade) {
        if (v.contact && touching) ctx.lineTo(v.x,v.y); else ctx.moveTo(v.x,v.y);
        touching = v.contact;
      }
      ctx.strokeStyle = "#458baf65"; ctx.lineWidth = 0.035; ctx.stroke();
      ctx.strokeStyle = "#ffffff99"; ctx.lineWidth = 0.012; ctx.stroke();
    }
    if (target !== null) LIGHTS.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(v.x, v.y, i === target ? LIGHT_RADIUS : 0.2, 0, Math.PI * 2);
      ctx.fillStyle = i === target ? "#e8ab4433" : "#7085a780"; ctx.fill();
      if (i === target) { ctx.strokeStyle = "#b77b28"; ctx.lineWidth = 0.08; ctx.stroke(); }
    });
    ctx.restore();
    const line = (points: V3[], color: string, thickness: number) => {
      ctx.beginPath(); points.forEach((v, i) => { const [x,y] = project(v); if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, thickness * scale); ctx.stroke();
    };
    const dot=(v:V3,r:number,color:string)=>{const [x,y]=project(v);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r*scale,0,Math.PI*2);ctx.fill();};
    const polygon=(points:V3[],color:string)=>{ctx.beginPath();points.forEach((v,i)=>{const [x,y]=project(v);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle=color;ctx.fill();};
    // Lit boards, benches and little spectators make the rink a place with a scale.
    for(const side of [-1,1]) {
      for(let y=-5;y<=40;y+=5){
        polygon([{x:side*28,y,z:0},{x:side*28,y:y+5,z:0},{x:side*28,y:y+5,z:1.05},{x:side*28,y,z:1.05}],"#f1f3ec");
        line([{x:side*28,y,z:1.08},{x:side*28,y:y+5,z:1.08}],"#557386",.09);
        line([{x:side*28,y,z:.15},{x:side*28,y:y+5,z:.15}],"#d4a361",.12);
        line([{x:side*28,y,z:1.1},{x:side*28,y,z:2.2}],"#7cabb766",.035);
      }
      for(const y of [2,18,34]) {
        line([{x:side*30,y:y-1.5,z:.5},{x:side*30,y:y+1.5,z:.5}],"#97734e",.4);
        for(const dy of [-.8,.8]) {const x=side*30;line([{x,y:y+dy,z:.6},{x,y:y+dy,z:1.2}],side<0?"#ac7370":"#6f82a3",.3);dot({x,y:y+dy,z:1.46},.13,"#debda3");}
      }
      for(const y of [-5,42]){
        const x=side*25;
        line([{x,y,z:0},{x,y,z:.9}],"#766446",.15);
        for(let layer=0;layer<3;layer++){
          const z=.6+layer*.45,size=.75-layer*.15;
          polygon([{x:x-size,y,z},{x:x+size,y,z},{x,y,z:z+1.1}],layer%2?"#477c73":"#3d6e68");
        }
      }
    }
    // Low, soft cones and foam bars can be missed without ending the session.
    if(rookie) ROOKIE_GATES.forEach((g,i)=>{
      for(let side=0;side<2;side++){
        const offset=side?3.8:-3.8,x=g.x+Math.sin(g.angle)*offset,y=g.y-Math.cos(g.angle)*offset;
        const tipped=rookie.knocked[i*2+side]>0;
        polygon([{x:x-.3,y:y-.3,z:.02},{x:x+.3,y:y-.3,z:.02},{x:x+.3,y:y+.3,z:.02},{x:x-.3,y:y+.3,z:.02}],"#715f58");
        polygon([{x:x-.23,y,z:.06},{x:x+.23,y,z:.06},{x:x+(tipped?.5:0),y,z:tipped?.18:.65}],"#e3934e");
        line([{x:x-.1,y,z:.3},{x:x+.1,y,z:.3}],"#fff4d6",.08);
      }
      if(g.jump) {
        line([{x:g.x-Math.sin(g.angle)*2.7,y:g.y+Math.cos(g.angle)*2.7,z:.17},{x:g.x+Math.sin(g.angle)*2.7,y:g.y-Math.cos(g.angle)*2.7,z:.17}],rookie.results[i]?"#7bad91":"#b48ed3",.22);
      }
    });
    if(playground){
      SNOWFLAKES.forEach((flake,i)=>{
        if(playground.flakes[i]>0)return;
        const z=.6+Math.sin(s.tick/30+i)*.1, q={...flake,z};
        const [x,y]=project(q);ctx.save();ctx.translate(x,y);ctx.rotate(s.tick/180+i);ctx.shadowColor="#50b5d6";ctx.shadowBlur=14;
        ctx.strokeStyle="#ffffff";ctx.lineWidth=2;
        for(let j=0;j<3;j++){ctx.rotate(Math.PI/3);ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(10,0);ctx.moveTo(5,-3);ctx.lineTo(8,0);ctx.lineTo(5,3);ctx.stroke();}
        ctx.restore();
      });
      for(const puck of playground.pucks){if(puck.cooldown>0)continue;
        const [x,y]=project({...puck,z:.06});ctx.fillStyle="#1c30485c";ctx.beginPath();ctx.ellipse(x+3,y+3,.3*scale,.14*scale,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#283f58";ctx.beginPath();ctx.ellipse(x,y,.27*scale,.14*scale,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#87b6c4";ctx.lineWidth=2;ctx.stroke();
      }
    }
    const b = bodyPoints(s, p);
    if (low) {
      // Pose overlay only: actual blade contacts and knee compression remain physical.
      b.shoulder = { x:b.hip.x - s.heading.x * 0.48, y:b.hip.y - s.heading.y * 0.48, z:b.hip.z + 0.05 };
      b.head = { x:b.shoulder.x - s.heading.x * 0.2, y:b.shoulder.y - s.heading.y * 0.2, z:b.shoulder.z + 0.07 };
      for (let i = 0; i < 2; i++) {
        const side = i ? -1 : 1;
        b.shoulders[i] = { x:b.shoulder.x - s.heading.y * side * 0.18, y:b.shoulder.y + s.heading.x * side * 0.18, z:b.shoulder.z };
        b.hands[i] = { x:b.shoulders[i].x - s.heading.y * side * 0.45, y:b.shoulders[i].y + s.heading.x * side * 0.45, z:b.shoulder.z - 0.1 };
      }
    }
    if (s.fallen) {
      const flatten = (v: V3) => { v.x += s.heading.x * v.z * 0.6; v.y += s.heading.y * v.z * 0.6; v.z *= 0.12; };
      for (const v of [b.hip,b.shoulder,b.head,...b.hips,...b.shoulders,...b.hands,...b.knees]) flatten(v);
    }
    const [sx,sy] = project({ ...s.pos, z: 0 });
    ctx.fillStyle = "#213d5630"; ctx.beginPath(); ctx.ellipse(sx,sy,scale * 0.55,scale * 0.13,0,0,Math.PI*2); ctx.fill();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const far = cam.depth(b.feet[0].x,b.feet[0].y) > cam.depth(b.feet[1].x,b.feet[1].y) ? 0 : 1;
    const leg = (i: number) => {
      line([b.hips[i], b.knees[i], b.feet[i]], i === far ? "#253859" : "#3e5279", 0.13);
      const f = b.feet[i], t = s.blade[i].tangent;
      line([{x:f.x-t.x*0.13,y:f.y-t.y*0.13,z:f.z+0.045},{x:f.x+t.x*0.18,y:f.y+t.y*0.18,z:f.z+0.045}], "#f9fbff", 0.11);
      line([{x:f.x-t.x*0.17,y:f.y-t.y*0.17,z:f.z},{x:f.x+t.x*0.22,y:f.y+t.y*0.22,z:f.z}], "#5a6c83", 0.026);
    };
    leg(far); line([b.shoulders[far],b.hands[far]], "#7563a4", 0.09);
    line([b.hip,b.shoulder], "#6953a0", 0.32);
    line([b.hips[0],b.hips[1]], "#403761", 0.18);
    leg(1-far); line([b.shoulders[1-far],b.hands[1-far]], "#9583c7", 0.09);
    for (const hand of b.hands) { const [x,y] = project(hand); ctx.fillStyle="#ecc1a7";ctx.beginPath();ctx.arc(x,y,scale*.044,0,Math.PI*2);ctx.fill(); }
    const [hx,hy] = project(b.head);
    ctx.fillStyle="#342e46";ctx.beginPath();ctx.arc(hx,hy-2,scale*.13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f0c7ab";ctx.beginPath();ctx.arc(hx+s.heading.x*scale*.025,hy+scale*.025,scale*.10,0,Math.PI*2);ctx.fill();
    if (target !== null || (rookie && !rookie.done)) {
      const dest=rookie && !rookie.done ? rookie.target : LIGHTS[target!], [tx,ty]=project({...dest,z:.4});
      const ax=Math.max(35,Math.min(w-35,tx)), ay=Math.max(140,Math.min(h-160,ty));
      ctx.fillStyle="#95601b";ctx.textAlign="center";ctx.font="700 13px system-ui";
      ctx.fillText(`◆ ${Math.round(Math.hypot(dest.x-s.pos.x,dest.y-s.pos.y))} m`,ax,ay);
    }
    // Fixed rink map keeps bearings while the close camera follows the skater.
    const mx=w-104,my=h-190;
    if(w>700){
      ctx.fillStyle="#13243bdb";ctx.beginPath();ctx.roundRect(mx-74,my-66,148,132,16);ctx.fill();
      ctx.strokeStyle="#91b4c266";ctx.lineWidth=1;ctx.beginPath();ctx.arc(mx,my,42,0,Math.PI*2);ctx.stroke();
      if(playground){for(let i=0;i<SNOWFLAKES.length;i++){if(playground.flakes[i]>0)continue;const t=SNOWFLAKES[i];ctx.fillStyle="#a8edfa";ctx.fillRect(mx+t.x*2-1,my-(t.y-18)*2-1,3,3);}}
      if(rookie){ROOKIE_GATES.forEach((g,i)=>{ctx.fillStyle=i<rookie.index?"#7bccaa":g.jump?"#d9a5f3":"#9cadc4";ctx.beginPath();ctx.arc(mx+g.x*2,my-(g.y-18)*2,3,0,Math.PI*2);ctx.fill();});}
      if(target!==null){const t=LIGHTS[target];ctx.fillStyle="#ffd082";ctx.beginPath();ctx.arc(mx+t.x*2,my-(t.y-18)*2,4,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle="#d4c3ff";ctx.beginPath();ctx.arc(mx+Math.max(-65,Math.min(65,s.pos.x*2)),my-Math.max(-53,Math.min(53,(s.pos.y-18)*2)),4,0,Math.PI*2);ctx.fill();
    }
  }
}
