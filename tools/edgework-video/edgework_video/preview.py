"""`edgework-video preview` — wireframe preview drawn strictly from an export file.

Blueprint §9 M1 & §11 invariant:
  The wireframe preview reads ONLY the `edgework-wireframe/1` export JSON and
  records the exact SHA-256 of the export file it drew, so the preview can never
  silently drift from the exported coordinates.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any

from . import EXIT_INVALID_INPUT, EdgeworkVideoError
from .intake import sha256_bytes
from .schemas import validate_wireframe_export

BONES: tuple[tuple[str, str], ...] = (
    ("pelvis", "chest"),
    ("chest", "neck"),
    ("neck", "crown"),
    ("pelvis", "hipL"),
    ("pelvis", "hipR"),
    ("hipL", "kneeL"),
    ("kneeL", "ankleL"),
    ("ankleL", "toeL"),
    ("hipR", "kneeR"),
    ("kneeR", "ankleR"),
    ("ankleR", "toeR"),
    ("chest", "shoulderL"),
    ("shoulderL", "elbowL"),
    ("elbowL", "wristL"),
    ("chest", "shoulderR"),
    ("shoulderR", "elbowR"),
    ("elbowR", "wristR"),
)


def _render_html_viewer(export_doc: dict[str, Any], export_sha256: str) -> str:
    title = html.escape(f"EDGEWORK Wireframe Preview — {export_doc['id']}")
    payload = json.dumps(
        {
            "id": export_doc["id"],
            "name": export_doc["name"],
            "fps": export_doc["meta"]["fps"],
            "exportSha256": export_sha256,
            "bones": BONES,
            "frames": export_doc["frames"],
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="edgework-export-sha256" content="{export_sha256}" />
<title>{title}</title>
<style>
  body {{ margin: 0; background: #0c141d; color: #e6edef; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; padding: 16px; }}
  canvas {{ background: #101d29; border: 1px solid #2b4257; border-radius: 6px; }}
  .bar {{ display: flex; gap: 12px; align-items: center; margin-top: 10px; font-size: 13px; }}
  .hash {{ font-family: monospace; color: #9fb6c3; font-size: 12px; margin-top: 6px; }}
</style>
</head>
<body>
  <h3 style="margin:0 0 8px 0;">{title}</h3>
  <canvas id="cv" width="640" height="480"></canvas>
  <div class="bar">
    <button id="play">Pause</button>
    <input id="scrub" type="range" min="0" value="0" step="1" style="width:320px;" />
    <span id="info"></span>
  </div>
  <div class="hash">exportSha256: {export_sha256}</div>
<script>
const DATA = {payload};
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const scrub = document.getElementById('scrub'), info = document.getElementById('info'), btn = document.getElementById('play');
scrub.max = Math.max(0, DATA.frames.length - 1);
let idx = 0, playing = true;
btn.onclick = () => {{ playing = !playing; btn.textContent = playing ? 'Pause' : 'Play'; }};
scrub.oninput = () => {{ idx = Number(scrub.value); draw(); }};
function proj(p) {{
  const scale = 190, cx = cv.width * 0.5, cy = cv.height * 0.82;
  return [cx + p[0] * scale, cy - p[1] * scale];
}}
function draw() {{
  ctx.clearRect(0, 0, cv.width, cv.height);
  const fr = DATA.frames[idx];
  if (!fr) return;
  // Ice plane line (y = 0)
  ctx.strokeStyle = '#2b4257'; ctx.beginPath(); ctx.moveTo(40, cv.height * 0.82); ctx.lineTo(cv.width - 40, cv.height * 0.82); ctx.stroke();
  ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 2.5;
  for (const [a, b] of DATA.bones) {{
    if (!fr.joints[a] || !fr.joints[b]) continue;
    const pa = proj(fr.joints[a]), pb = proj(fr.joints[b]);
    ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
  }}
  for (const [k, p] of Object.entries(fr.joints)) {{
    const pp = proj(p);
    const c = fr.confidence[k] ?? 0;
    ctx.fillStyle = c >= 0.5 ? '#d9bc84' : '#f08a7a';
    ctx.beginPath(); ctx.arc(pp[0], pp[1], 3.5, 0, Math.PI * 2); ctx.fill();
  }}
  scrub.value = String(idx);
  info.textContent = `frame ${{idx + 1}}/${{DATA.frames.length}} · t=${{fr.t.toFixed(4)}}s`;
}}
setInterval(() => {{ if (playing && DATA.frames.length > 1) {{ idx = (idx + 1) % DATA.frames.length; draw(); }} }}, Math.max(16, Math.round(1000 / Math.max(1, DATA.fps))));
draw();
</script>
</body>
</html>
"""


def run_preview(wireframe_path: Path, out_path: Path) -> dict[str, Any]:
    """Generate a self-contained HTML wireframe preview strictly from `wireframe_path`."""
    if not wireframe_path.is_file():
        raise EdgeworkVideoError(f"Wireframe file not found: {wireframe_path}", EXIT_INVALID_INPUT)
    raw_bytes = wireframe_path.read_bytes()
    export_sha256 = sha256_bytes(raw_bytes)
    try:
        doc = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Invalid wireframe JSON: {exc}", EXIT_INVALID_INPUT) from exc
    errors = validate_wireframe_export(doc)
    if errors:
        raise EdgeworkVideoError(f"Wireframe export failed validation: {'; '.join(errors)}", EXIT_INVALID_INPUT)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    html_text = _render_html_viewer(doc, export_sha256)
    out_path.write_text(html_text, encoding="utf-8")
    return {"previewFile": str(out_path), "exportSha256": export_sha256, "frameCount": len(doc["frames"])}
