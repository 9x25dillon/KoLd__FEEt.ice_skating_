import { animeHead } from "./anime.ts";
import { performancePose, SKINS } from "./appearance.ts";
import type { Skin } from "./appearance.ts";
import { IceEffects } from "./effects.ts";
import { REWARD_LABELS } from "./rewards.ts";
import type { V3 } from "../app/draw.ts";
import type { SkaterState } from "../sim/types.ts";
import { MOVE } from "../sim/types.ts";
import type { Params } from "../sim/params.ts";
import { perpLeft } from "../sim/math.ts";
import { LIGHTS, LIGHT_RADIUS } from "./run.ts";
import { SNOWFLAKES, TARGETS } from "./playground.ts";
import type { Playground } from "./playground.ts";
import { ROOKIE_GATES } from "./rookie.ts";
import type { RookieCourse } from "./rookie.ts";
import { Camera, VIEW } from "../app/camera.ts";

export class SkateScene {
  skin: Skin = SKINS[0];
  readonly effects = new IceEffects();
  overview = false;
  zoom = 1;
  readonly camera = new Camera();
  private map = new Camera();
  constructor() { this.camera.view = VIEW.Chase; this.camera.chaseElevation = 36; }
  reset(s: SkaterState) { this.camera.snap(s); this.effects.reset(s); }
  update(s: SkaterState, dt: number) { this.camera.update(s, dt); this.effects.update(s, dt); }
  /** A screen-space stick must rotate with the camera, not the spinning body. */
  worldAim(x: number, y: number) {
    const yaw = this.overview ? Math.PI / 2 : this.camera.yaw;
    return { x: x * Math.sin(yaw) + y * Math.cos(yaw), y: -x * Math.cos(yaw) + y * Math.sin(yaw) };
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: SkaterState, p: Params,
    trail: Array<Array<{x:number; y:number; contact:boolean}>>, low: boolean, target: number | null, playground: Playground | null = null, rookie: RookieCourse | null = null) {
    const scale = this.overview ? Math.max(5, Math.min(w / 67, h / 45)) : Math.min(94, Math.max(48, h / 9)) * this.zoom;
    const cam = this.overview ? this.map : this.camera;
    if(this.overview) { cam.cx=0; cam.cy=18; }
    cam.zoom = scale / 26;
    const matrix = cam.groundMatrix(w,h);
    const cx = cam.cx, cy = cam.cy;
    const project = (v: V3): [number, number] => cam.project(v.x,v.y,v.z);
    const ice = ctx.createLinearGradient(0, 0, 0, h);
    ice.addColorStop(0, "#536c99"); ice.addColorStop(0.6, "#bedfee"); ice.addColorStop(1, "#7cbacc");
    ctx.fillStyle = ice; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.transform(...matrix);
    // A dark apron frames a luminous sheet; all surface details stay in world space.
    ctx.beginPath(); ctx.roundRect(-32, -14, 64, 64, 12);
    ctx.fillStyle = "#45566f"; ctx.fill();
    ctx.strokeStyle = "#72869f"; ctx.lineWidth = .22; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-28, -10, 56, 56, 9); ctx.clip();
    const surface = ctx.createLinearGradient(-28, -10, 28, 46);
    surface.addColorStop(0, "#d5f5ff"); surface.addColorStop(.45, "#a8d5ef");
    surface.addColorStop(.72, "#e6ddff"); surface.addColorStop(1, "#91cadc");
    ctx.fillStyle = surface; ctx.fillRect(-28, -10, 56, 56);
    for (const x of [-19, 0, 19]) {
      const glow = ctx.createRadialGradient(x, 18, 0, x, 18, 20);
      glow.addColorStop(0, "#ffffff70"); glow.addColorStop(1, "#ffffff00");
      ctx.fillStyle = glow; ctx.fillRect(x - 20, -2, 40, 40);
      ctx.save(); ctx.translate(x, 18); ctx.rotate(-.22);
      ctx.fillStyle = "#ffffff28"; ctx.fillRect(-.3, -26, .6, 52);
      ctx.fillStyle = "#ffffff14"; ctx.fillRect(-1.2, -26, 2.4, 52); ctx.restore();
    }
    // Fixed resurfacing arcs avoid random shimmer as the camera moves.
    ctx.lineWidth = .018; ctx.strokeStyle = "#527f9720";
    for (let i = 0; i < 64; i++) {
      const x = ((i * 17.31) % 56) - 28, y = ((i * 11.73) % 56) - 10;
      ctx.beginPath(); ctx.ellipse(x, y, 2 + i % 5, .5 + i % 3, i * .7, .2, 2.5); ctx.stroke();
    }
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
    ctx.save(); ctx.translate(0, 18); ctx.scale(1, -1);
    ctx.fillStyle = "#476c8a40"; ctx.textAlign = "center";
    ctx.font = "700 1.15px system-ui"; ctx.fillText("E D G E W O R K", 0, .3);
    ctx.font = "500 .35px system-ui"; ctx.fillText("T H E   I C E   R E M E M B E R S", 0, 1.2);
    ctx.restore();
    ctx.restore(); // Ice clipping; objects and blade trails keep their own bounds.
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
    const landing = this.effects.landing;
    for (const reward of this.effects.rewards) {
      if (reward.kind !== "goal" && reward.kind !== "light") continue;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - reward.age / 1.4);
      const radius = reward.kind === "goal" ? 2.4 : LIGHT_RADIUS;
      ctx.beginPath(); ctx.arc(reward.x, reward.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#ffe3a02b"; ctx.fill();
      ctx.lineWidth = .1; ctx.strokeStyle = "#e8b752"; ctx.stroke();
      if (!this.effects.reducedMotion) {
        ctx.beginPath(); ctx.arc(reward.x, reward.y, radius + reward.age * 1.5, 0, Math.PI * 2);
        ctx.lineWidth = .035; ctx.stroke();
      }
      ctx.restore();
    }
    if (landing && landing.age < .7 && !this.effects.reducedMotion) {
      ctx.save(); ctx.globalAlpha = (1 - landing.age / .7) * .65;
      ctx.beginPath(); ctx.arc(landing.x, landing.y, .3 + landing.age * 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = landing.clean ? this.skin.trim : "#b17a64";
      ctx.lineWidth = .055; ctx.stroke(); ctx.restore();
    }
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
    const { body: b, elbows } = performancePose(s, p, this.effects.reducedMotion);
    const skin = this.skin;
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
      for (const v of [b.hip,b.shoulder,b.head,...b.hips,...b.shoulders,...b.hands,...b.knees,...elbows]) flatten(v);
    }
    const [sx,sy] = project({ ...s.pos, z: 0 });
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, .28);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * .7);
    shadow.addColorStop(0, "#26385155"); shadow.addColorStop(1, "#26385100");
    ctx.fillStyle = shadow; ctx.fillRect(-scale, -scale, scale * 2, scale * 2); ctx.restore();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const far = cam.depth(b.feet[0].x,b.feet[0].y) > cam.depth(b.feet[1].x,b.feet[1].y) ? 0 : 1;
    const inkLine = (points: V3[], color: string, thickness: number) => {
      line(points, "#172039", thickness + .035);
      line(points, color, thickness);
    };
    const cel = (points: V3[], color: string) => {
      polygon(points, color); line([...points, points[0]], "#172039", .018);
    };
    const leg = (i: number) => {
      inkLine([b.hips[i], b.knees[i], b.feet[i]], i === far ? skin.tightsShade : skin.tights, 0.13);
      line([b.knees[i], b.feet[i]], i === far ? "#48516f" : "#7185a3", .025);
      const f = b.feet[i], t = s.blade[i].tangent;
      inkLine([{x:f.x-t.x*0.13,y:f.y-t.y*0.13,z:f.z+0.045},{x:f.x+t.x*0.18,y:f.y+t.y*0.18,z:f.z+0.045}], "#f9fbff", 0.11);
      line([{x:f.x-t.x*0.17,y:f.y-t.y*0.17,z:f.z},{x:f.x+t.x*0.22,y:f.y+t.y*0.22,z:f.z}], "#5a6c83", 0.026);
    };
    const arm = (i: number) => inkLine(low ? [b.shoulders[i], b.hands[i]] : [b.shoulders[i], elbows[i], b.hands[i]], i === far ? skin.sleeveShade : skin.sleeve, .09);
    leg(far); arm(far);
    inkLine([b.shoulder, b.head], skin.skin, .075);
    const waist = b.hips.map(v => ({...v, z:v.z+.035}));
    cel([b.shoulders[0], b.shoulders[1], waist[1], waist[0]], skin.bodice);
    cel([b.shoulder, b.shoulders[1], waist[1], b.hip], skin.sleeveShade);
    polygon([b.shoulders[0], b.shoulder, b.hip, waist[0]], skin.highlight);
    const chest = { ...b.shoulder, z:b.shoulder.z-.18 };
    line([b.shoulders[0], chest, b.shoulders[1]], skin.trim, .033);
    line([chest,b.hip], skin.trim, .022);
    line([b.hips[0],b.hips[1]], skin.skirtShade, 0.18);
    leg(1-far);
    // Fabric hangs from the hips, opens with angular speed, and ripples at the hem.
    if (!s.fallen) {
      const speed = Math.hypot(s.vel.x, s.vel.y);
      const spin = s.move === MOVE.Spin ? Math.min(1, Math.abs(s.spin.omega) / 12) : 0;
      const flare = .22 + Math.min(.1, speed * .012) + spin * .22;
      const [hipX, hipY] = project(b.hip);
      const [, hemY] = project({ ...b.hip, z: b.hip.z - .28 + spin * .12 });
      const hem: Array<[number, number]> = [];
      for (let i = 0; i <= 24; i++) {
        const angle = i / 24 * Math.PI;
        const ripple = this.effects.reducedMotion ? 0 : Math.sin(i * 1.8 + s.tick / 10) * .014 * Math.min(1, speed / 3 + spin);
        hem.push([hipX - Math.cos(angle) * flare * scale,
          hemY + Math.sin(angle) * flare * scale * .25 + ripple * scale]);
      }
      const fabric = ctx.createLinearGradient(hipX - flare * scale, hipY, hipX + flare * scale, hemY);
      fabric.addColorStop(0, skin.skirtShade); fabric.addColorStop(.32, skin.skirtShade); fabric.addColorStop(.32, skin.skirt); fabric.addColorStop(.8, skin.skirt); fabric.addColorStop(.8, skin.skirtShade); fabric.addColorStop(1, skin.skirtShade);
      ctx.beginPath(); ctx.moveTo(hipX - scale * .13, hipY);
      for (const [x, y] of hem) ctx.lineTo(x, y);
      ctx.lineTo(hipX + scale * .13, hipY); ctx.closePath(); ctx.fillStyle = fabric; ctx.fill(); ctx.strokeStyle="#172039"; ctx.lineWidth=Math.max(1,scale*.018); ctx.stroke();
      ctx.strokeStyle = skin.trim; ctx.lineWidth = Math.max(1, scale * .018);
      ctx.beginPath(); hem.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke();
      ctx.save(); ctx.globalAlpha = .3;
      for (const i of [4, 8, 12, 16, 20]) {
        ctx.beginPath(); ctx.moveTo(hipX + (hem[i][0] - hipX) * .28, hipY + 2);
        ctx.lineTo(...hem[i]); ctx.stroke();
      }
      ctx.restore();
      line([b.hips[0], b.hips[1]], skin.trim, .035);
    }
    arm(1-far);
    for (const hand of b.hands) { const [x,y] = project(hand); ctx.fillStyle=skin.skin;ctx.beginPath();ctx.arc(x,y,scale*.044,0,Math.PI*2);ctx.fill(); }
    // A ponytail: trails behind the direction of travel, and sways with lean
    // rather than heading, so it reads as the body's own motion rather than
    // just retracing the skate line.
    if (!s.fallen && !skin.bun) {
      const side = perpLeft(s.heading);
      const sway = (this.effects.reducedMotion ? 0 : Math.sin(s.tick / 22) * Math.min(.09, Math.hypot(s.vel.x, s.vel.y) * .012)) + s.lean * 0.14;
      const base = { x: b.head.x - s.heading.x * 0.06, y: b.head.y - s.heading.y * 0.06, z: b.head.z + 0.06 };
      const mid = { x: b.head.x - s.heading.x * 0.22 + side.x * sway, y: b.head.y - s.heading.y * 0.22 + side.y * sway, z: b.head.z - 0.05 };
      const tip = { x: b.head.x - s.heading.x * 0.38 + side.x * sway * 1.6, y: b.head.y - s.heading.y * 0.38 + side.y * sway * 1.6, z: b.head.z - 0.22 };
      const [bx,by] = project(base), [mx,my] = project(mid), [tx2,ty2] = project(tip);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my, tx2, ty2);
      ctx.strokeStyle = "#172039"; ctx.lineWidth = Math.max(1, .15 * scale); ctx.lineCap = "round"; ctx.stroke();
      ctx.strokeStyle = skin.hair; ctx.lineWidth = Math.max(1, .11 * scale); ctx.stroke();
      ctx.strokeStyle = "#776a99"; ctx.lineWidth = Math.max(1, .025 * scale); ctx.stroke();
    }
    const [hx,hy] = project(b.head);
    const facing = -(s.heading.x * Math.cos(cam.yaw) + s.heading.y * Math.sin(cam.yaw));
    const turn = s.heading.x * Math.sin(cam.yaw) - s.heading.y * Math.cos(cam.yaw);
    animeHead(ctx, hx, hy, scale, skin, facing, turn);
    ctx.save();
    for (const particle of this.effects.particles) {
      const [x, y] = project(particle);
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
      ctx.globalAlpha = Math.min(1, (1 - particle.age / particle.life) * 1.4);
      const radius = Math.max(.7, particle.size * scale);
      const [tailX, tailY] = project({ x: particle.x - particle.vx * .018,
        y: particle.y - particle.vy * .018, z: Math.max(0, particle.z - particle.vz * .018) });
      ctx.strokeStyle = "#83b4cbb0"; ctx.lineWidth = Math.max(.7, radius * .6);
      ctx.beginPath(); ctx.moveTo(tailX, tailY + 1); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = "#f4ffff"; ctx.beginPath();
      ctx.moveTo(x, y - radius); ctx.lineTo(x + radius * .7, y);
      ctx.lineTo(x, y + radius); ctx.lineTo(x - radius * .5, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (target !== null || (rookie && !rookie.done)) {
      const dest=rookie && !rookie.done ? rookie.target : LIGHTS[target!], [tx,ty]=project({...dest,z:.4});
      const ax=Math.max(35,Math.min(w-35,tx)), ay=Math.max(140,Math.min(h-160,ty));
      ctx.fillStyle="#95601b";ctx.textAlign="center";ctx.font="700 13px system-ui";
      ctx.fillText(`◆ ${Math.round(Math.hypot(dest.x-s.pos.x,dest.y-s.pos.y))} m`,ax,ay);
    }
    // Short, world-anchored celebrations show the exact points the rules awarded.
    ctx.save();
    const rewardLabels: Array<{ x: number; y: number }> = [];
    for (const reward of this.effects.rewards) {
      const gold = reward.kind === "goal" || reward.kind === "light";
      const color = gold ? "#ffe0a0" : "#cdfaff";
      const [x, y] = project({ ...reward, z: .65 });
      if (x < -100 || x > w + 100 || y < -100 || y > h + 100) continue;
      ctx.globalAlpha = Math.min(1, (1.4 - reward.age) / .4);
      if (!this.effects.reducedMotion && reward.age < .75) {
        ctx.save(); ctx.globalAlpha *= 1 - reward.age / .75;
        for (let i = 0; i < (gold ? 16 : 10); i++) {
          const angle = i * Math.PI * 2 / (gold ? 16 : 10);
          const radius = .12 + reward.age * (gold ? 3 : 1.6);
          const [px, py] = project({ x: reward.x + Math.cos(angle) * radius,
            y: reward.y + Math.sin(angle) * radius, z: .65 + Math.sin(reward.age * Math.PI) * .4 });
          const size = Math.max(1.5, Math.min(4, scale * .04));
          ctx.strokeStyle = gold ? "#b4832e" : "#4e9ab8"; ctx.lineWidth = 1;
          ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(px, py - size);
          ctx.lineTo(px + size * .6, py); ctx.lineTo(px, py + size);
          ctx.lineTo(px - size * .6, py); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      const lift = this.effects.reducedMotion ? 0 : reward.age * 26;
      let labelY = y - 34 - lift;
      // Keep the athlete's silhouette visible during a landing or nearby pickup.
      const labelX = Math.abs(x - sx) < 100 && Math.abs(labelY - sy) < scale * 2.2
        ? sx + (sx < w / 2 + 1 ? 128 : -128) : x;
      while (rewardLabels.some(label => Math.abs(label.x - labelX) < 122 && Math.abs(label.y - labelY) < 50)) labelY -= 50;
      rewardLabels.push({ x: labelX, y: labelY });
      ctx.fillStyle = "#173149ed"; ctx.beginPath(); ctx.roundRect(labelX - 58, labelY - 23, 116, 46, 10); ctx.fill();
      ctx.textAlign = "center"; ctx.fillStyle = color; ctx.font = "750 20px system-ui";
      ctx.fillText(`+${reward.points}`, labelX, labelY - 2);
      ctx.fillStyle = "#d5e4ed"; ctx.font = "600 8px system-ui";
      ctx.fillText(REWARD_LABELS[reward.kind], labelX, labelY + 13);
    }
    ctx.restore();
    // Sparse action strokes at the screen edge, only at speed; never shake the camera.
    const rush = Math.min(1, Math.max(0, (Math.hypot(s.vel.x, s.vel.y) - 6) / 5));
    if (rush > 0 && !s.fallen && !this.overview && !this.effects.reducedMotion) {
      ctx.save(); ctx.strokeStyle = "#f1f6ff"; ctx.globalAlpha = rush * .24; ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) {
        const side = i % 2 ? 1 : -1;
        const y = h * (.22 + (i / 12) * .65);
        const x = w / 2 + side * w * .46;
        const length = 18 + ((s.tick + i * 19) % 70);
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + side * length, y + (y - h * .45) * .09); ctx.stroke();
      }
      ctx.restore();
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
