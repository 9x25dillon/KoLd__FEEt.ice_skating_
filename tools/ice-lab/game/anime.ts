import type { Skin } from "./appearance.ts";

const INK = "#172039";
/** Hand-inked head at gameplay scale; face visibility follows the body's heading. */
export function animeHead(ctx: CanvasRenderingContext2D, x: number, y: number,
  scale: number, skin: Skin, facing: number, turn: number) {
  const r = scale * .165;
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = .095;
  const shape = (points: number[][], fill: string) => {
    ctx.beginPath(); points.forEach(([px,py],i) => i ? ctx.lineTo(px,py) : ctx.moveTo(px,py));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  };
  // Angular hair silhouette and pointed chin replace the circular mannequin head.
  shape([[-.95,.45],[-1.02,-.28],[-.7,-1.05],[-.2,-1.22],[.35,-1.12],
    [.79,-.74],[.99,-.1],[.88,.62],[.52,.83],[-.5,.78]], skin.hair);
  if (facing > -.3) {
    const offset = turn * .23;
    ctx.save(); ctx.translate(offset, 0);
    shape([[-.65,-.45],[.63,-.48],[.74,.28],[.45,.72],[.02,.96],[-.46,.69],[-.72,.23]], skin.skin);
    ctx.fillStyle = "#cc8a94"; ctx.beginPath(); ctx.moveTo(.44,-.42);
    ctx.lineTo(.72,.25); ctx.lineTo(.43,.71); ctx.lineTo(.02,.95); ctx.lineTo(.22,.42); ctx.closePath(); ctx.fill();
    for (const side of [-1,1]) {
      if (Math.abs(turn) > .8 && side !== Math.sign(turn)) continue;
      const ex = side * .32;
      shape([[ex-.2,.06],[ex+.16,.025],[ex+.14,.29],[ex-.12,.3]], "#fff9ed");
      ctx.fillStyle = skin.bun ? "#198b90" : "#875ac9";
      ctx.fillRect(ex-.04,.07,.12,.22);
      ctx.fillStyle = INK; ctx.fillRect(ex,.11,.055,.15);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(ex-.025,.09,.045,.065);
      ctx.strokeStyle = INK; ctx.lineWidth = .07;
      ctx.beginPath(); ctx.moveTo(ex-.21,-.12); ctx.lineTo(ex+.13,-.15); ctx.stroke();
    }
    ctx.strokeStyle = "#8f5864"; ctx.lineWidth = .045;
    ctx.beginPath(); ctx.moveTo(.04,.34); ctx.lineTo(.10,.45); ctx.lineTo(.02,.48); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-.12,.65); ctx.lineTo(.10,.65); ctx.stroke();
    shape([[-.81,-.16],[-.62,-.83],[.13,-1.01],[.69,-.63],[.82,.34],
      [.46,-.13],[.31,-.47],[.12,.02],[-.06,-.44],[-.34,.08],[-.4,-.32],[-.72,.44]], skin.hair);
    ctx.restore();
  } else {
    // Back hair is still articulated into cel-shaded locks, never a floating face.
    shape([[-.73,-.5],[-.4,-.95],[.2,-1.04],[.6,-.72],[.4,-.35],[-.16,-.57],[-.5,-.2]], skin.bun ? "#5a535b" : "#625779");
    ctx.strokeStyle = "#9792b5"; ctx.lineWidth = .055;
    for (const px of [-.4,0,.4]) {
      ctx.beginPath(); ctx.moveTo(px,-.35); ctx.quadraticCurveTo(px+.18,.1,px*.6,.56); ctx.stroke();
    }
  }
  // Graphic hair ornament reads even from the chase camera.
  if (skin.bun) {
    ctx.fillStyle = skin.hair; ctx.strokeStyle = INK; ctx.lineWidth = .1;
    ctx.beginPath(); ctx.ellipse(.15,-1.05,.47,.36,-.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = skin.trim; ctx.beginPath(); ctx.moveTo(-.2,-.96); ctx.lineTo(.45,-1.06); ctx.stroke();
  } else if (facing < .3) {
    shape([[-.1,.23],[-.62,.02],[-.5,.46],[-.06,.4],[.4,.54],[.52,.08]], skin.skirt);
    ctx.fillStyle = skin.trim; ctx.fillRect(-.09,.22,.17,.18);
  }
  ctx.restore();
}
