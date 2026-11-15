// ① 하늘 — 첫 화면: 언제, 어디에 내릴까 · 강민
// 달 남극(80°S~90°S)의 실제 지형(NASA LOLA) 위에, 착륙 날짜마다 "여기 내리면 14일 임무가 전력·교신 기준을 지키는가"를 칠해요.
// 칠하는 값은 pipeline/make_polar_map.py가 미리 계산한 것(data/polar/)이고, 화면은 읽어서 그리기만 해요.
// 그림자는 그 날짜의 실제 해 방향으로, 같은 지형 위에서 해 쪽 지평선을 따라가며 그려요(해 원반이 지평선 위로 보이는 비율).
// 착륙지 8곳의 판정(통과·실패 원인)은 data/outputs/heatmap.json(40 m 지형, 접근로 포함)을 그대로 보여 줘요.

import { t, addStrings, getLang } from '../i18n.js';

const DATA = new URL('../../../data/', import.meta.url);
const R = 1737400, D2R = Math.PI / 180;
const EXAG = 3;                              // relief drawn 3x (lighting and the map use true heights)
const PLAY_DAYS_PER_S = 9;
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

addStrings({
  en: {
    'pm.h1': 'Land where the light stays.',
    'pm.ans': 'On {date}, land at {site}.', 'pm.ans.none': 'On {date}, no candidate site passes.',
    'pm.sub': '{k} of {n} candidate sites pass a 14-day mission landed that day at {hh} UTC; {id} has the largest margin ({m}).', 'pm.p12': '(scatter test: 12:00 UTC landing)',
    'pm.sub.slip': 'It still passes if the landing slips by up to {d} days, to {end}.', 'pm.sub.slip1': 'It still passes if the landing slips by 1 day, to {end}.', 'pm.sub.slip0': 'A slip of one day fails there.',
    'pm.sub.p': 'If the touchdown point scatters, {p} of {n} landers still meet the criteria there (95% {lo}–{hi}).',
    'pm.sub.safer': 'Most tolerant of landing error among the passing sites: {id} ({p}).',
    'pm.date.edit': 'Type the landing date and hour (UTC). Site verdicts are computed for every hour; the map colours and the scatter test are computed for 12:00 UTC landings.',
    'pm.sub.next': 'The next passing landing is {site} on {date}.', 'pm.sub.nonext': 'No later date passes in the data.',
    'pm.sub.hint': 'Click any ground to read that point',
    'pm.pt.h': 'Picked point', 'pm.pt.clear': 'Clear the picked point', 'pm.pt.on': 'On {date}', 'pm.pt.pc': 'Power {p} · Comm {c}',
    'pm.pt.count': 'Passing landing dates', 'pm.pt.of': '{k} of {n}', 'pm.pt.next': 'Next passing date', 'pm.pt.now': 'Passes now, until {date}', 'pm.pt.never': 'none in the data',
    'pm.pt.best': 'Largest margin', 'pm.pt.go': 'Go', 'pm.pt.near': 'Nearest candidate site', 'pm.pt.km': '{site} · {km} km', 'pm.pt.open': 'Open',
    'pm.pt.note': 'One 1.28 km cell (best of 16 points) on 80 m terrain: power + comm only, margins in steps of 0.04. No approach lighting and no landing scatter here; those exist for the candidate sites.',
    'pm.pt.out': 'No computed margin here. The map covers ±174 km around the pole.', 'pm.pt.wait': 'Reading all 778 dates…',
    'pm.strip.pt': 'This point', 'pm.best.map': 'Most ground passes: {date} →', 'pm.best.pt': 'Best for this point: {date} →',
    'pm.loading': 'Reading the south pole: NASA LOLA terrain, JPL Horizons Sun and Earth…',
    'pm.rank': 'Candidate sites on this date', 'pm.rank.note': 'Site verdicts: 40 m terrain, power + comm + approach. %: share of 1,000 landers scattered around the site (assumed 100 m, 1σ) that still meet the criteria; not the chance of a safe touchdown. Map: one point per 320 m on 80 m terrain, power + comm. Criteria are assumed values.',
    'pm.pass': 'Pass', 'pm.fail': 'Fail', 'pm.nc': 'Not computed', 'pm.margin': 'margin',
    'pm.c.power': 'Power', 'pm.c.comm': 'Comm', 'pm.c.approach': 'Approach',
    'pm.legend.pass': 'Keeps power and comm for 14 days', 'pm.legend.more': 'brighter = more margin',
    'pm.legend.near': 'Misses a criterion by less than 40%',
    'pm.legend.power': 'Fails on power (Sun)', 'pm.legend.comm': 'Fails on comm (Earth)',
    'pm.why': 'Show why not', 'pm.play': 'Play the dates', 'pm.pause': 'Pause',
    'pm.strip': 'Landing date, 1 Nov 2026 to 17 Dec 2028. Drag to change it.',
    'pm.strip.map': 'Map that passes', 'pm.strip.sites': 'The 8 sites',
    'pm.open': 'Read the horizon at {site}', 'pm.sun': 'Sun', 'pm.earth': 'Earth',
    'pm.meta': 'LUNAR SOUTH POLE 80–90°S · LANDING {iso} · SUB-SOLAR {slat} {slon} · RELIEF ×3 · {share} OF MAP PASSES · COMPUTED, NOT A PHOTOGRAPH',
    'pm.credit': 'Computed map · NASA LRO LOLA 80 m terrain · JPL Horizons DE441 · assumed criteria',
    'pm.src': 'Sources and limits', 'pm.src.what': 'What it shows', 'pm.src.terrain': 'Terrain', 'pm.src.eph': 'Sun and Earth', 'pm.src.method': 'Method', 'pm.src.limits': 'Limits', 'pm.src.check': 'Check',
    'pm.src.check.v': 'At the 8 site cells the map gives the same power + comm verdict as the 40 m site pipeline on {p} of the {n} dates (per site: {list}).',
    'pm.map': 'Map', 'pm.crumb.map': 'South Pole', 'pm.crumb.date': 'Landing {date}', 'pm.crumb.pick': 'Pick a site',
  },
  ko: {
    'pm.h1': '빛이 머무는 곳에 내려요.',
    'pm.ans': '{date}에는 {site}에 내려요.', 'pm.ans.none': '{date}에는 통과하는 후보 착륙지가 없어요.',
    'pm.sub': '그날 {hh} UTC에 착륙하는 14일 임무를 후보 착륙지 {n}곳 중 {k}곳이 통과해요. 여유 1위: {id} ({m}).', 'pm.p12': '(오차 시험은 12:00 UTC 착륙 기준)',
    'pm.sub.slip': '착륙이 {d}일까지 밀려도({end}까지) 계속 통과해요.', 'pm.sub.slip1': '착륙이 하루 밀려도({end}) 통과해요.', 'pm.sub.slip0': '하루만 밀려도 거기는 실패해요.',
    'pm.sub.p': '착륙 지점이 흩어져도 거기서 기준을 지키는 비율: 모의 착륙선 {n}대 중 {p} (95% {lo}–{hi}).',
    'pm.sub.safer': '통과하는 곳 중 착륙 오차에 가장 강한 곳: {id} ({p}).',
    'pm.date.edit': '착륙 날짜와 시각(UTC)을 직접 입력해요. 착륙지 판정은 매시간 계산했고, 지도 색과 오차 시험은 12:00 UTC 착륙 기준이에요.',
    'pm.sub.next': '다음으로 통과하는 착륙: {date}, {site}.', 'pm.sub.nonext': '데이터 안에 그 뒤로 통과하는 날짜가 없어요.',
    'pm.sub.hint': '땅 아무 곳이나 누르면 그 지점을 읽어 줘요',
    'pm.pt.h': '고른 지점', 'pm.pt.clear': '고른 지점 지우기', 'pm.pt.on': '{date} 착륙', 'pm.pt.pc': '전력 {p} · 교신 {c}',
    'pm.pt.count': '통과하는 착륙 날짜', 'pm.pt.of': '{n}일 중 {k}일', 'pm.pt.next': '다음 통과 날짜', 'pm.pt.now': '지금 통과, {date}까지', 'pm.pt.never': '데이터 안에 없어요',
    'pm.pt.best': '여유가 가장 큰 날', 'pm.pt.go': '이동', 'pm.pt.near': '가장 가까운 후보 착륙지', 'pm.pt.km': '{site} · {km} km', 'pm.pt.open': '열기',
    'pm.pt.note': '80 m 지형 위 1.28 km 칸 하나(16점 중 가장 좋은 점): 전력 + 교신만, 여유는 0.04 단위예요. 접근로 조명과 착륙 오차 계산은 여기 없고 후보 착륙지에만 있어요.',
    'pm.pt.out': '여기는 계산한 값이 없어요. 지도는 극점 둘레 ±174 km를 계산했어요.', 'pm.pt.wait': '778개 날짜를 읽는 중이에요…',
    'pm.strip.pt': '이 지점', 'pm.best.map': '통과하는 땅이 가장 넓은 날: {date} →', 'pm.best.pt': '이 지점에 가장 좋은 날: {date} →',
    'pm.loading': '달 남극을 읽는 중이에요: NASA LOLA 지형, JPL Horizons 해·지구…',
    'pm.rank': '이 날짜의 후보 착륙지', 'pm.rank.note': '착륙지 판정: 40 m 지형, 전력 + 교신 + 접근로. %: 착륙지 둘레에 흩어진 모의 착륙선 1,000대(가정한 오차 100 m, 1σ) 중 기준을 지키는 비율. 안전하게 내려앉을 확률이 아니에요. 지도: 80 m 지형 위 320 m마다 한 점, 전력 + 교신. 기준은 가정값이에요.',
    'pm.pass': '통과', 'pm.fail': '실패', 'pm.nc': '계산 안 됨', 'pm.margin': '여유',
    'pm.c.power': '전력', 'pm.c.comm': '교신', 'pm.c.approach': '접근로',
    'pm.legend.pass': '14일 동안 전력·교신 기준을 지켜요', 'pm.legend.more': '밝을수록 여유가 커요',
    'pm.legend.near': '기준에 40% 안쪽으로 못 미쳐요',
    'pm.legend.power': '전력(해) 때문에 실패', 'pm.legend.comm': '교신(지구) 때문에 실패',
    'pm.why': '안 되는 이유 보기', 'pm.play': '날짜 재생', 'pm.pause': '멈춤',
    'pm.strip': '착륙 날짜, 2026년 11월 1일부터 2028년 12월 17일까지. 끌어서 바꿔요.',
    'pm.strip.map': '통과하는 땅', 'pm.strip.sites': '착륙지 8곳',
    'pm.open': '{site}의 지평선 보기', 'pm.sun': '해', 'pm.earth': '지구',
    'pm.meta': 'LUNAR SOUTH POLE 80–90°S · LANDING {iso} · SUB-SOLAR {slat} {slon} · RELIEF ×3 · {share} OF MAP PASSES · COMPUTED, NOT A PHOTOGRAPH',
    'pm.credit': '계산한 지도 · NASA LRO LOLA 80 m 지형 · JPL Horizons DE441 · 기준은 가정값',
    'pm.src': '출처와 한계', 'pm.src.what': '무엇을 보여 주나', 'pm.src.terrain': '지형', 'pm.src.eph': '해와 지구', 'pm.src.method': '방법', 'pm.src.limits': '한계', 'pm.src.check': '확인',
    'pm.src.check.v': '착륙지 8곳의 칸에서 지도의 전력 + 교신 판정은 {n}개 날짜 중 {p}가 40 m 착륙지 계산과 같아요(곳별: {list}).',
    'pm.map': '지도', 'pm.crumb.map': '달 남극', 'pm.crumb.date': '{date} 착륙', 'pm.crumb.pick': '착륙지를 고르세요',
  },
});

let THREE, OrbitControls;
let root, ctx, P, HM, LS, opts;   // LS: outputs/landing_success.json (share of scattered landers that still meet the criteria, per site and date), may be missing
let renderer, scene, camera, controls, mat, lightScene, lightCam, lightMat, lightRT;
let heights, HN, atlas = [], sites = [], rim = {};
let jf = 16, shownJ = -1, playing = false, dragging = false, why = false, selected = null;
let raf = 0, last = 0, dirty = true, lightDirty = true, alive = false, onResize, onKey, setTimer = 0;
let hOff = 0, HH = null, hhAsked = false;   // landing hour relative to 12:00 UTC (-12..11); HH: outputs/heatmap_hourly.json, read when another hour is chosen
let mesh = null, pick = null, pickSeq = 0, bestMapJ = 0;   // pick: the ground the reader clicked { x, y, lat, lon, pw, cm, ... }
let fly = null;   // the flight between the map and one site: { t0, dur, out, pA, qA, pB, qB, res }
const HOME = { pos: [0, 430, 470], target: [0, -4, 6] }, FOV = 30;

const $ = (s) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NV = () => P.n_frames;
const isoOf = (j) => P.landing_times_utc[j];
const dateOf = (j) => { const d = new Date(Date.parse(isoOf(j))); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const siteName = (i) => (getLang() === 'ko' ? HM.data.site_names[i] : (HM.meta.sites[i] && HM.meta.sites[i].name_en) || HM.data.site_names[i]);
const hhOf = () => String(12 + hOff).padStart(2, '0') + ':00';
const isoAt = (j) => isoOf(j).slice(0, 11) + hhOf() + 'Z';   // the landing shown: the date of frame j at the chosen hour
function hOffOf(iso) { const d = iso ? new Date(Date.parse(iso)) : null; return d && Number.isFinite(d.getTime()) ? d.getUTCHours() - 12 : 0; }
function jOf(iso) {   // no date given: today (UTC), kept inside the computed dates
  const ms = iso ? Date.parse(iso) : Date.now(), t0 = Date.parse(isoOf(0)); return Math.max(0, Math.min(NV() - 1, Math.round((ms - t0) / 864e5))); }

/* ---------------- geometry ---------------- */
function mapXY(lat, lon) { const rho = 2 * R * Math.tan(Math.PI / 4 + (lat * D2R) / 2); return [rho * Math.sin(lon * D2R), rho * Math.cos(lon * D2R)]; }
function hAt(x, y) {   // bilinear height (m) from the 400 m grid
  const fx = Math.max(0, Math.min(HN - 1.001, x / 400 + HN / 2 - 0.5)), fy = Math.max(0, Math.min(HN - 1.001, HN / 2 - 0.5 - y / 400));
  const i = Math.floor(fy), j = Math.floor(fx), a = fy - i, b = fx - j, k = i * HN + j;
  return (heights[k] * (1 - b) + heights[k + 1] * b) * (1 - a) + (heights[k + HN] * (1 - b) + heights[k + HN + 1] * b) * a;
}
function world(x, y, lift = 0) {   // km, the pole's reference sphere at the origin, map +y away from the camera
  const rho = Math.hypot(x, y) || 1e-6, c = 2 * Math.atan(rho / (2 * R)), r = (R + hAt(x, y) * EXAG + lift) / 1000, s = Math.sin(c);
  return [r * s * x / rho, r * Math.cos(c) - R / 1000, -r * s * y / rho];
}

async function loadHeights() {
  const blob = await (await fetch(new URL('polar/' + P.height.file, DATA))).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
  HN = bmp.width; heights = new Float32Array(HN * HN);
  for (let i = 0; i < HN * HN; i++) heights[i] = (px[i * 4] * 256 + px[i * 4 + 1]) * P.height.step_m + P.height.offset_m;
}
function heightTextures() {   // the 400 m grid and four coarser means, two bytes per height
  const out = []; let h = heights, n = HN;
  for (let lv = 0; lv < 5; lv++) {
    if (lv) { const m = n / 2, c = new Float32Array(m * m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { const k = 2 * i * n + 2 * j; c[i * m + j] = (h[k] + h[k + 1] + h[k + n] + h[k + n + 1]) / 4; } h = c; n = m; }
    const d = new Uint8Array(n * n * 2);
    for (let i = 0; i < n * n; i++) { const q = Math.max(0, Math.min(65535, Math.round((h[i] + 10000) * 2))); d[i * 2] = q >> 8; d[i * 2 + 1] = q & 255; }
    const tx = new THREE.DataTexture(d, n, n, THREE.RGFormat, THREE.UnsignedByteType);
    tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.unpackAlignment = 1; tx.needsUpdate = true;
    out.push(tx);
  }
  return out;
}

/* ---------------- shaders ---------------- */
const LIGHT_FS = `
precision highp float; precision highp int;
uniform sampler2D uH0, uH1, uH2, uH3, uH4;
uniform vec3 uSun; uniform vec2 uDir; uniform float uSunR;
out vec4 frag;
const float R = 1737400.0, CELL = 400.0, NH = 1520.0;
float dec(vec4 c) { return (floor(c.r * 255.0 + 0.5) * 256.0 + floor(c.g * 255.0 + 0.5)) * 0.5 - 10000.0; }
float H(sampler2D s, vec2 p, float lv) {
  float n = NH / lv, cell = CELL * lv;
  ivec2 q = ivec2(floor(vec2(p.x / cell + n * 0.5, n * 0.5 - p.y / cell)));
  if (q.x < 0 || q.y < 0 || q.x >= int(n) || q.y >= int(n)) return -1.0e6;
  return dec(texelFetch(s, q, 0));
}
void main() {
  vec2 p = (gl_FragCoord.xy - vec2(NH * 0.5)) * CELL;
  float h0 = H(uH0, p, 1.0) + 2.0;
  float rho = max(length(p), 1.0), c = 2.0 * atan(rho / (2.0 * R));
  vec3 up = vec3(sin(c) * p.y / rho, sin(c) * p.x / rho, -cos(c));
  float el = degrees(asin(clamp(dot(uSun, up), -1.0, 1.0)));
  float maxT = -1.0, dist = 0.0, st = CELL;
  for (int i = 0; i < 110; i++) {
    dist += st;
    vec2 q = p + uDir * dist; float hT;
    if (st < 600.0) hT = H(uH0, q, 1.0); else if (st < 1200.0) hT = H(uH1, q, 2.0); else if (st < 2400.0) hT = H(uH2, q, 4.0); else if (st < 4800.0) hT = H(uH3, q, 8.0); else hT = H(uH4, q, 16.0);
    float th = dist / R, sh = sin(th * 0.5), rt = R + hT;
    maxT = max(maxT, ((hT - h0) - rt * 2.0 * sh * sh) / (rt * sin(th)));
    if (i >= 40) st *= 1.07;
    if (dist > 260000.0) break;
  }
  float d = clamp((el - degrees(atan(maxT))) / uSunR, -1.0, 1.0);
  float lit = 1.0 - (acos(d) - d * sqrt(1.0 - d * d)) / 3.14159265;       // share of the solar disc above the horizon
  float hx = (H(uH0, p + vec2(CELL, 0.0), 1.0) - H(uH0, p - vec2(CELL, 0.0), 1.0)) / (2.0 * CELL);
  float hy = (H(uH0, p + vec2(0.0, CELL), 1.0) - H(uH0, p - vec2(0.0, CELL), 1.0)) / (2.0 * CELL);
  vec3 n = normalize(vec3(-hx, -hy, 1.0));
  float er = radians(el);
  float mu0 = max(dot(n, vec3(uDir * cos(er), sin(er))), 0.0);
  float ls = mu0 / (mu0 + max(n.z, 0.05));                                 // Lommel-Seeliger, seen from above
  float v = 1.0 - exp(-ls * lit * 9.0);
  float relief = clamp(dot(n, normalize(vec3(-0.55, 0.6, 0.6))), 0.0, 1.0);
  frag = vec4(sqrt(v), lit, relief, 1.0);
}`;
const MAP_VS = `
in vec3 position; in vec2 aMap;
uniform mat4 modelViewMatrix, projectionMatrix;
out vec2 vMap;
void main() { vMap = aMap; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MAP_FS = `
precision highp float;
uniform sampler2D uLight, uA, uB;
uniform vec4 uRA, uRB;            // frame origin (column, row) and atlas columns
uniform float uMix, uHalf, uN, uWhy, uLo, uSpan, uSel, uPick;
uniform vec2 uSelXY, uPickXY;
in vec2 vMap; out vec4 frag;
const float R = 1737400.0;
vec2 frame(sampler2D s, vec4 r, vec2 f) {
  vec2 q = clamp(f, vec2(0.5 / uN), vec2(1.0 - 0.5 / uN));
  vec2 uv = (r.xy + q) / r.z;
  vec4 c = texture(s, vec2(uv.x, 1.0 - uv.y));
  return c.rg * uSpan + uLo;
}
void main() {
  float rho = length(vMap);
  if (rho > 303000.0) discard;
  vec4 L = texture(uLight, vMap / 608000.0 + 0.5);
  float v = L.r * L.r;
  vec3 col = vec3(0.90, 0.89, 0.86) * v + vec3(0.050, 0.054, 0.060) * (0.25 + 0.75 * L.b) * (1.0 - v);
  if (abs(vMap.x) < uHalf && abs(vMap.y) < uHalf) {
    vec2 f = vec2(vMap.x / (2.0 * uHalf) + 0.5, 0.5 - vMap.y / (2.0 * uHalf));
    vec2 m = mix(frame(uA, uRA, f), frame(uB, uRB, f), uMix);
    float ov = min(m.x, m.y);
    float edge = min(min(uHalf - abs(vMap.x), uHalf - abs(vMap.y)) / 6000.0, 1.0);
    float a = smoothstep(-0.018, 0.012, ov) * edge;
    float shade = 0.52 + 0.48 * max(v, 0.6 * L.b);
    vec3 lime = vec3(0.847, 0.980, 0.361);
    col = mix(col, vec3(0.52, 0.62, 0.20) * shade, smoothstep(-0.40, -0.03, ov) * (1.0 - a) * edge * 0.42);   // misses by less than 40%
    col = mix(col, lime * shade, a * (0.50 + 0.42 * smoothstep(0.0, 0.6, ov)));
    if (uWhy > 0.5) {
      vec3 cc = m.x < m.y ? vec3(0.86, 0.55, 0.12) : vec3(0.82, 0.28, 0.48);
      col = mix(col, cc * shade, (1.0 - a) * edge * (1.0 - 0.7 * smoothstep(-0.40, -0.03, ov)) * 0.30);
    }
  }
  float cd = degrees(2.0 * atan(rho / (2.0 * R)));
  float g1 = abs(fract(cd + 0.5) - 0.5) / max(fwidth(cd), 1e-5);
  float lon = degrees(atan(vMap.x, vMap.y)) / 30.0;
  float g2 = abs(fract(lon + 0.5) - 0.5) / max(fwidth(lon), 1e-5) + (rho < 4000.0 ? 9.0 : 0.0);
  col += vec3(0.075) * (1.0 - smoothstep(0.0, 1.3, min(g1, g2)));
  if (uSel > 0.5) { float dsel = abs(length(vMap - uSelXY) - 5200.0); col = mix(col, vec3(1.0), 0.9 * (1.0 - smoothstep(0.0, 1.5 * fwidth(dsel) + 250.0, dsel))); }
  if (uPick > 0.5) { float dp = abs(length(vMap - uPickXY) - 2400.0); col = mix(col, vec3(1.0), 0.95 * (1.0 - smoothstep(0.0, 1.5 * fwidth(dp) + 170.0, dp))); }
  col *= 1.0 - smoothstep(282000.0, 303000.0, rho);
  frag = vec4(col, 1.0);
}`;

/* ---------------- scene ---------------- */
function build() {
  const st = $('#pm-stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setClearColor(0x000000, 1);
  st.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 5, 6000);
  camera.position.set(...HOME.pos);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...HOME.target); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 140; controls.maxDistance = 1500; controls.minPolarAngle = 4 * D2R; controls.maxPolarAngle = 74 * D2R;
  controls.enablePan = true; controls.screenSpacePanning = false;
  controls.addEventListener('change', () => { dirty = true; });
  controls.update();

  const tex = heightTextures();
  lightRT = new THREE.WebGLRenderTarget(HN, HN, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  lightMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    vertexShader: 'in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: LIGHT_FS,
    uniforms: { uH0: { value: tex[0] }, uH1: { value: tex[1] }, uH2: { value: tex[2] }, uH3: { value: tex[3] }, uH4: { value: tex[4] }, uSun: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2() }, uSunR: { value: 0.2667 } },
  });
  lightScene = new THREE.Scene(); lightCam = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lightMat); quad.frustumCulled = false; lightScene.add(quad);

  const G = 420, half = P.height.half_km * 1000, pos = new Float32Array((G + 1) * (G + 1) * 3), mp = new Float32Array((G + 1) * (G + 1) * 2), idx = new Uint32Array(G * G * 6);
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
    const k = i * (G + 1) + j, x = (j / G * 2 - 1) * half, y = (1 - i / G * 2) * half, w = world(x, y);
    pos[k * 3] = w[0]; pos[k * 3 + 1] = w[1]; pos[k * 3 + 2] = w[2]; mp[k * 2] = x; mp[k * 2 + 1] = y;
  }
  for (let i = 0, q = 0; i < G; i++) for (let j = 0; j < G; j++) { const a = i * (G + 1) + j, b = a + 1, c = a + G + 1, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aMap', new THREE.BufferAttribute(mp, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: MAP_VS, fragmentShader: MAP_FS, side: THREE.DoubleSide,
    uniforms: {
      uLight: { value: lightRT.texture }, uA: { value: null }, uB: { value: null }, uRA: { value: new THREE.Vector4(0, 0, P.cols, 0) }, uRB: { value: new THREE.Vector4(0, 0, P.cols, 0) },
      uMix: { value: 0 }, uHalf: { value: P.half_km * 1000 }, uN: { value: P.n }, uWhy: { value: 0 }, uLo: { value: P.encode.lo }, uSpan: { value: P.encode.span },
      uSel: { value: 0 }, uSelXY: { value: new THREE.Vector2() }, uPick: { value: 0 }, uPickXY: { value: new THREE.Vector2() },
    },
  });
  mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; scene.add(mesh);
}

function loadAtlas(a) {
  if (atlas[a]) return atlas[a];
  const e = (atlas[a] = { tex: null, p: null });
  e.p = new Promise((res, rej) => new THREE.TextureLoader().load(new URL('polar/' + P.atlases[a], DATA).href, (tx) => {
    tx.colorSpace = THREE.NoColorSpace; tx.generateMipmaps = false; tx.minFilter = tx.magFilter = THREE.LinearFilter;
    e.tex = tx; if (alive) setFrame();
    const m = $('#pm-msg'); if (m) m.hidden = true;
    res(tx);
  }, undefined, rej));
  return e;
}
function setFrame() {
  const x = Math.max(0, Math.min(NV() - 1, jf + hOff / 24));   // the chosen hour moves the Sun; the lime layer blends the two nearest daily maps
  const j0 = Math.max(0, Math.min(NV() - 1, Math.floor(x))), j1 = Math.min(NV() - 1, j0 + 1), per = P.frames_per_atlas, u = mat.uniforms;
  const A = loadAtlas(Math.floor(j0 / per)), B = loadAtlas(Math.floor(j1 / per));
  if (j1 + 30 < NV()) loadAtlas(Math.floor((j1 + 30) / per));
  const rect = (v, j) => { const f = j % per; v.set(f % P.cols, Math.floor(f / P.cols), P.cols, 0); };
  u.uA.value = A.tex; rect(u.uRA.value, j0);
  if (B.tex) { u.uB.value = B.tex; rect(u.uRB.value, j1); u.uMix.value = x - j0; } else { u.uB.value = A.tex; rect(u.uRB.value, j0); u.uMix.value = 0; }
  // the Sun between two daily values (longitude unwrapped)
  const lerpLon = (arr) => arr[j0] + ((((arr[j1] - arr[j0]) % 360) + 540) % 360 - 180) * (x - j0);
  const sl = lerpLon(P.sun_lon) * D2R, sb = (P.sun_lat[j0] + (P.sun_lat[j1] - P.sun_lat[j0]) * (x - j0)) * D2R;
  lightMat.uniforms.uSun.value.set(Math.cos(sb) * Math.cos(sl), Math.cos(sb) * Math.sin(sl), Math.sin(sb));
  lightMat.uniforms.uDir.value.set(Math.sin(sl), Math.cos(sl));
  rim.sun = sl; rim.earth = lerpLon(P.earth_lon) * D2R;
  lightDirty = true; dirty = true;
}

/* ---------------- page ---------------- */
function shell() {
  root.innerHTML = `
    <section class="s3 photo pm" aria-label="${esc(t('pm.h1'))}">
      <div class="s3-stage" id="pm-stage"></div>
      <div class="pm-labels" id="pm-labels"></div>
      <div class="s3-caption pm-caption"><p class="s3-crumb"><b>${esc(t('pm.crumb.map'))}</b><i>/</i><span id="pm-crumb-date"></span></p><h1>${esc(t('pm.h1'))}</h1><p class="s3-lead" id="pm-ans"></p><p class="s3-sub" id="pm-sub"></p></div>
      <aside class="pm-rank" aria-label="${esc(t('pm.rank'))}"><h2>${esc(t('pm.rank'))}</h2><ol id="pm-rank"></ol><p>${esc(t('pm.rank.note'))}</p><div class="pm-pt" id="pm-pt" hidden></div></aside>
      <ul class="pm-legend">
        <li><i class="pm-sw ok"></i>${esc(t('pm.legend.pass'))} <span>${esc(t('pm.legend.more'))}</span></li>
        <li><i class="pm-sw near"></i>${esc(t('pm.legend.near'))}</li>
        <li><i class="pm-sw pt"></i>${esc(t('pm.sub.hint'))}</li>
        <li class="pm-whyrow" hidden><i class="pm-sw power"></i>${esc(t('pm.legend.power'))}</li>
        <li class="pm-whyrow" hidden><i class="pm-sw comm"></i>${esc(t('pm.legend.comm'))}</li>
      </ul>
      <p class="s3-meta" id="pm-meta"></p>
      <p class="s3-msg" id="pm-msg">${esc(t('pm.loading'))}</p>
    </section>
    <section class="s3-bar pm-bar" aria-label="${esc(t('pm.strip'))}">
      <div class="s3-ctl"><button class="s3-play" id="pm-play" type="button" aria-label="${esc(t('pm.play'))}"><svg viewBox="0 0 12 12" aria-hidden="true"><path id="pm-play-icon" d="M2 0 L12 6 L2 12 Z"/></svg></button></div>
      <div class="pm-when"><button type="button" class="pm-date num" id="pm-date" title="${esc(t('pm.date.edit'))}"></button><input type="datetime-local" step="3600" class="pm-date-in" id="pm-date-in" hidden min="${isoOf(0).slice(0, 10)}T00:00" max="${isoOf(NV() - 1).slice(0, 10)}T23:00" aria-label="${esc(t('pm.date.edit'))}"><button class="pm-best" id="pm-best" type="button"></button></div>
      <p class="s3-film-labs pm-strip-labs" aria-hidden="true"><span id="pm-strip-top">${esc(t('pm.strip.map'))}</span><span>${esc(t('pm.strip.sites'))}</span></p>
      <div class="pm-strip" id="pm-strip-wrap" role="slider" tabindex="0" aria-label="${esc(t('pm.strip'))}" aria-valuemin="0" aria-valuemax="${NV() - 1}">
        <canvas id="pm-strip"></canvas><i class="s3-film-now" id="pm-now"></i>
        <span class="pm-ticks" id="pm-ticks"></span>
      </div>
      <label class="pm-why"><input type="checkbox" id="pm-why"><span>${esc(t('pm.why'))}</span></label>
      <button class="s3-land" id="pm-open" type="button"></button>
    </section>
    <p class="s3-credit">${esc(t('pm.credit'))}</p>
    <section class="sources" aria-labelledby="pm-src-h"><h2 id="pm-src-h">${esc(t('pm.src'))}</h2><dl id="pm-src"></dl></section>`;
  const lab = $('#pm-labels');
  sites = HM.data.site_ids.map((id, i) => {
    const [lat, lon] = HM.data.site_latlon[i], [x, y] = mapXY(lat, lon);
    const el = document.createElement('button'); el.type = 'button'; el.className = 'pm-site'; el.innerHTML = `<i></i><span>${esc(id.toUpperCase())}</span>`;
    el.addEventListener('click', () => select(i));
    lab.appendChild(el);
    return { id, i, x, y, el, w: null };
  });
  { const el = document.createElement('span'); el.className = 'pm-pick'; el.hidden = true; lab.appendChild(el); rim.pickEl = el; }
  for (const k of ['sun', 'earth']) { const el = document.createElement('span'); el.className = 'pm-rim ' + k; el.textContent = t('pm.' + k); lab.appendChild(el); rim[k + 'El'] = el; }
  const ck = P.check_vs_site_pipeline || [], mean = ck.reduce((a, r) => a + r.same_verdict, 0) / (ck.length || 1), M = P.__meta;
  $('#pm-src').innerHTML = [['what', M.what], ['terrain', M.terrain], ['eph', M.ephemeris], ['method', M.method], ['limits', M.limits],
    ['check', t('pm.src.check.v', { p: Math.round(mean * 100) + '%', n: NV(), list: ck.map((r) => `${r.site} ${Math.round(r.same_verdict * 100)}%`).join(', ') })]]
    .map(([k, v]) => `<dt>${esc(t('pm.src.' + k))}</dt><dd>${esc(v)}</dd>`).join('');
  const ticks = $('#pm-ticks'), t0 = Date.parse(isoOf(0));
  for (const [y, m] of [[2027, 0], [2027, 6], [2028, 0], [2028, 6]]) { const j = (Date.UTC(y, m, 1, 12) - t0) / 864e5, s = document.createElement('span'); s.style.left = (j / (NV() - 1) * 100) + '%'; s.textContent = `${MON[m]} ${y}`; ticks.appendChild(s); }
}

function verdict(i, j) {
  if (hOff !== 0 && HH) {   // another hour than 12:00: the hourly table (same calculation, a landing at every hour)
    const h = HH.data, s = h.site_ids.indexOf(HM.data.site_ids[i]), k = j * 24 + 12 + hOff, m = s < 0 || k < 0 || k >= h.n ? null : h.margin[s][k];
    if (m === null || m === undefined) return { k: 'nc', m: null, cause: '' };
    const f = Number(h.fail[s][k]);
    return { k: f ? 'fail' : 'ok', m, cause: f & 1 ? 'power' : f & 2 ? 'comm' : f & 4 ? 'approach' : '' };
  }
  const d = HM.data, m = d.overall_margin[i][j], p = d.passed[i][j];
  if (m === null || m === undefined || p === null) return { k: 'nc', m: null, cause: '' };
  return { k: p ? 'ok' : 'fail', m, cause: p ? '' : String(d.fail_causes[i][j] || '').split(',')[0] };
}
function succ(i, j) {   // share of scattered landers that still meet the criteria at site i on date j, or null
  const d = LS && LS.data; if (!d) return null;
  const k = d.site_ids.indexOf(HM.data.site_ids[i]), p = k < 0 ? null : d.p[k][j];
  return typeof p === 'number' ? { p, lo: d.ci95_low[k][j], hi: d.ci95_high[k][j], n: d.n } : null;
}
const pct = (v) => Math.round(v * 100) + '%';
function refreshDate() {
  const j = Math.max(0, Math.min(NV() - 1, Math.round(jf)));
  if (hOff !== 0 && !HH && !hhAsked) { hhAsked = true; ctx.use('outputs/heatmap_hourly.json').then((f) => { if (f && f.data && f.data.margin) { HH = f; shownJ = -1; dirty = true; } }); }
  if (j * 100 + hOff === shownJ) return; shownJ = j * 100 + hOff;
  $('#pm-date').innerHTML = `${esc(dateOf(j))}<small>${esc(hhOf())} UTC</small>`;
  $('#pm-crumb-date').textContent = t('pm.crumb.date', { date: `${dateOf(j)} · ${hhOf()} UTC` });
  const rows = sites.map((s) => ({ s, v: verdict(s.i, j) })).sort((a, b) => (b.v.m ?? -9) - (a.v.m ?? -9));
  {   // the answer in words: where to land on this date, and how much slip that choice survives
    const top = rows[0], ok = rows.filter((r) => r.v.k === 'ok').length, pd = HM.data.passed;
    if (top.v.k === 'ok') {
      let end = j; while (end + 1 < NV() && (hOff !== 0 && HH ? verdict(top.s.i, end + 1).k === 'ok' : pd[top.s.i][end + 1] === true)) end++;
      $('#pm-ans').textContent = t('pm.ans', { date: dateOf(j), site: siteName(top.s.i) });
      $('#pm-sub').textContent = [t('pm.sub', { k: ok, n: sites.length, id: top.s.id.toUpperCase(), m: fmtM(top.v.m), hh: hhOf() }),
        t(end - j > 1 ? 'pm.sub.slip' : end - j === 1 ? 'pm.sub.slip1' : 'pm.sub.slip0', { d: end - j, end: dateOf(end) }),
        ((q) => (q ? t('pm.sub.p', { p: pct(q.p), n: q.n.toLocaleString('en-US'), lo: Math.round(q.lo * 100), hi: pct(q.hi) }) + (hOff !== 0 ? ' ' + t('pm.p12') : '') : ''))(succ(top.s.i, j)),
        (() => {   // margin ranks the sites; if another passing site survives the landing scatter clearly better, say so
          const mine = succ(top.s.i, j); if (!mine) return '';
          const alt = rows.filter((r) => r.v.k === 'ok' && r !== top).map((r) => ({ r, q: succ(r.s.i, j) })).filter((x) => x.q).sort((a, b) => b.q.p - a.q.p)[0];
          return alt && alt.q.p >= mine.p + 0.05 ? t('pm.sub.safer', { id: alt.r.s.id.toUpperCase(), p: pct(alt.q.p) }) : '';
        })()].filter(Boolean).join(' ');
    } else {
      let nx = null;
      for (let q = j + 1; q < NV() && !nx; q++) { const c = sites.map((s) => ({ s, v: verdict(s.i, q) })).filter((r) => r.v.k === 'ok').sort((a, b) => b.v.m - a.v.m)[0]; if (c) nx = { q, s: c.s }; }
      $('#pm-ans').textContent = t('pm.ans.none', { date: dateOf(j) });
      $('#pm-sub').textContent = nx ? t('pm.sub.next', { site: siteName(nx.s.i), date: dateOf(nx.q) }) : t('pm.sub.nonext');
    }
  }
  $('#pm-rank').innerHTML = rows.map(({ s, v }) => `<li><button type="button" data-i="${s.i}" aria-pressed="${selected === s.i}"><span class="nm">${esc(siteName(s.i))}</span>` + ((q) => (q && v.k !== 'nc' ? `<span class="pm-p"${hOff !== 0 ? ` title="${esc(t('pm.p12'))}"` : ''}>${pct(q.p)}</span>` : ''))(succ(s.i, j)) +
    (v.k === 'ok' ? `<span class="pm-chip ok">${esc(t('pm.pass'))} ${fmtM(v.m)}</span>` : v.k === 'fail' ? `<span class="pm-chip ${esc(v.cause || 'other')}">${esc(t('pm.c.' + (v.cause || 'power')))} ${fmtM(v.m)}</span>` : `<span class="pm-chip nc">${esc(t('pm.nc'))}</span>`) + '</button></li>').join('');
  $('#pm-rank').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => select(Number(b.dataset.i))));
  for (const s of sites) { const v = verdict(s.i, j); s.el.dataset.k = v.k === 'fail' ? (v.cause || 'other') : v.k; }
  if (selected === null) { selected = rows[0].s.i; applySel(); if (!ctx.state.site && !playing) ctx.set({ site: rows[0].s.id, time: ctx.state.time || isoAt(j) }); }
  renderPoint(); renderBest();
  const sl = ((P.sun_lon[j] + 180) % 360) - 180, f = (x, a, b) => `${Math.abs(x).toFixed(1)}°${x < 0 ? b : a}`;
  $('#pm-meta').textContent = t('pm.meta', { iso: isoAt(j), slat: f(P.sun_lat[j], 'N', 'S'), slon: f(sl, 'E', 'W'), share: Math.round(P.pass_share[j] * 100) + '%' });
  const wrap = $('#pm-strip-wrap'); wrap.setAttribute('aria-valuenow', j); wrap.setAttribute('aria-valuetext', dateOf(j));
}
function applySel() {
  const s = sites[selected]; if (!s) return;
  mat.uniforms.uSel.value = 1; mat.uniforms.uSelXY.value.set(s.x, s.y);
  sites.forEach((q) => q.el.setAttribute('aria-pressed', String(q.i === selected)));
  root.querySelectorAll('#pm-rank button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === selected)));
  $('#pm-open').textContent = t('pm.open', { site: s.id.toUpperCase() }) + ' →';
  dirty = true;
}
function select(i) { selected = i; applySel(); openPhoto(); }
async function openPhoto() {
  if (fly || selected === null) return;
  const j = Math.max(0, Math.min(NV() - 1, Math.round(jf)));
  setPlaying(false);
  await flyTo(sites[selected]);
  if (alive && opts && opts.open) opts.open(sites[selected].id, isoAt(j));
}

/* ---------------- any ground: the reader clicks the map, the page reads that cell on all dates ---------------- */
const fmtM = (m) => (m >= 0 ? '+' : '−') + Math.abs(m).toFixed(2);
const fmtPos = (lat, lon) => `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
function groundAt(ev) {   // the map point under the pointer, or null
  const r = renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, 1 - (ev.clientY - r.top) / r.height * 2), camera);
  const hit = rc.intersectObject(mesh, false)[0]; if (!hit) return null;
  const p = hit.point, hz = Math.hypot(p.x, p.z) || 1e-9, vy = p.y + R / 1000, c = Math.acos(vy / Math.hypot(hz, vy)), rho = 2 * R * Math.tan(c / 2);
  if (rho > 303000) return null;
  const x = rho * p.x / hz, y = -rho * p.z / hz;
  return { x, y, lat: c / D2R - 90, lon: Math.atan2(x, y) / D2R };
}
async function readCell(col, row) {   // power and comm margins of one map cell on every landing date, from the same atlases the map draws
  await Promise.all(P.atlases.map((_, a) => loadAtlas(a).p));
  const n = NV(), per = P.frames_per_atlas, cv = document.createElement('canvas'); cv.width = n; cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  for (let j = 0; j < n; j++) { const f = j % per; g.drawImage(atlas[Math.floor(j / per)].tex.image, (f % P.cols) * P.n + col, Math.floor(f / P.cols) * P.n + row, 1, 1, j, 0, 1, 1); }
  const px = g.getImageData(0, 0, n, 1).data, pw = new Float32Array(n), cm = new Float32Array(n);
  for (let j = 0; j < n; j++) { pw[j] = px[j * 4] / 255 * P.encode.span + P.encode.lo; cm[j] = px[j * 4 + 1] / 255 * P.encode.span + P.encode.lo; }
  return { pw, cm };
}
async function pickGround(g) {
  const half = P.half_km * 1000, seq = ++pickSeq;
  pick = { ...g, out: Math.abs(g.x) >= half || Math.abs(g.y) >= half, pw: null, cm: null, w: null };
  mat.uniforms.uPick.value = 1; mat.uniforms.uPickXY.value.set(g.x, g.y);
  let best = null;
  for (const s of sites) { const [la, lo] = HM.data.site_latlon[s.i], a = Math.sin((la - g.lat) * D2R / 2) ** 2 + Math.cos(la * D2R) * Math.cos(g.lat * D2R) * Math.sin((lo - g.lon) * D2R / 2) ** 2, km = 2 * R * Math.asin(Math.sqrt(a)) / 1000; if (!best || km < best.km) best = { s, km }; }
  pick.near = best;
  renderPoint(); drawStrip(); renderBest(); dirty = true;
  if (pick.out) return;
  const col = Math.min(P.n - 1, Math.floor((g.x / (2 * half) + 0.5) * P.n)), row = Math.min(P.n - 1, Math.floor((0.5 - g.y / (2 * half)) * P.n));
  let cell; try { cell = await readCell(col, row); } catch (e) { console.warn('Point readout unavailable:', e.message); return; }
  if (seq !== pickSeq || !alive || !pick) return;
  Object.assign(pick, cell);
  const n = NV(); let k = 0, bj = 0;
  pick.mg = new Float32Array(n);
  for (let j = 0; j < n; j++) { const m = Math.min(cell.pw[j], cell.cm[j]); pick.mg[j] = m; if (m >= 0) k++; if (m > pick.mg[bj]) bj = j; }
  pick.nPass = k; pick.bestM = pick.mg[bj];
  renderPoint(); drawStrip(); renderBest();
}
function clearPick() { pick = null; pickSeq++; mat.uniforms.uPick.value = 0; renderPoint(); drawStrip(); renderBest(); dirty = true; }
function pointBest(j) {   // the date with the largest margin: the first one on or after the shown date, else the first one
  let b = -1; for (let q = j; q < NV(); q++) if (pick.mg[q] >= pick.bestM - 1e-6) { b = q; break; }
  if (b < 0) for (let q = 0; q < j; q++) if (pick.mg[q] >= pick.bestM - 1e-6) { b = q; break; }
  return b;
}
function jump(j) { setPlaying(false); jf = Math.max(0, Math.min(NV() - 1, j)); setFrame(); commit(); }
function renderPoint() {
  const box = $('#pm-pt'), lab = rim.pickEl; if (!box) return;
  const top = $('#pm-strip-top'); if (top) top.textContent = t(pick && pick.mg ? 'pm.strip.pt' : 'pm.strip.map');
  box.hidden = !pick; box.parentNode.classList.toggle('has-pt', !!pick); if (lab) lab.hidden = !pick;
  if (!pick) { box.innerHTML = ''; return; }
  const j = Math.max(0, Math.min(NV() - 1, Math.round(jf))), pos = fmtPos(pick.lat, pick.lon);
  const head = `<h3>${esc(t('pm.pt.h'))}<button type="button" class="x" id="pm-pt-x" aria-label="${esc(t('pm.pt.clear'))}">×</button></h3><p class="pos num">${esc(pos)}</p>`;
  const near = pick.near ? `<dt>${esc(t('pm.pt.near'))}<small>${esc(t('pm.pt.km', { site: pick.near.s.id.toUpperCase(), km: pick.near.km < 10 ? pick.near.km.toFixed(1) : Math.round(pick.near.km) }))}</small></dt><dd><button type="button" class="go" id="pm-pt-near">${esc(t('pm.pt.open'))}</button></dd>` : '';
  let body, chip = '';
  if (pick.out) body = `<p>${esc(t('pm.pt.out'))}</p><dl>${near}</dl>`;
  else if (!pick.mg) body = `<p>${esc(t('pm.pt.wait'))}</p>`;
  else {
    const p = pick.pw[j], c = pick.cm[j], m = pick.mg[j];
    chip = m >= 0 ? `<span class="pm-chip ok">${esc(t('pm.pass'))} ${fmtM(m)}</span>` : `<span class="pm-chip ${p < c ? 'power' : 'comm'}">${esc(t('pm.c.' + (p < c ? 'power' : 'comm')))} ${fmtM(m)}</span>`;
    let nx = -1, end = -1;
    for (let q = j; q < NV(); q++) if (pick.mg[q] >= 0) { nx = q; break; }
    if (nx === j) { end = j; while (end + 1 < NV() && pick.mg[end + 1] >= 0) end++; }
    const bj = pointBest(j);
    body = `<dl><dt>${esc(t('pm.pt.on', { date: dateOf(j) }))}<small>${esc(t('pm.pt.pc', { p: fmtM(p), c: fmtM(c) }))}</small></dt><dd>${chip}</dd>` +
      `<dt>${esc(t('pm.pt.count'))}</dt><dd>${esc(t('pm.pt.of', { k: pick.nPass, n: NV() }))}</dd>` +
      `<dt>${esc(t('pm.pt.next'))}<small>${esc(nx < 0 ? t('pm.pt.never') : nx === j ? t('pm.pt.now', { date: dateOf(end) }) : dateOf(nx))}</small></dt><dd>${nx > j ? `<button type="button" class="go" data-j="${nx}">${esc(t('pm.pt.go'))}</button>` : ''}</dd>` +
      (pick.nPass ? `<dt>${esc(t('pm.pt.best'))}<small>${esc(dateOf(bj))} · ${fmtM(pick.bestM)}</small></dt><dd>${bj !== j ? `<button type="button" class="go" data-j="${bj}">${esc(t('pm.pt.go'))}</button>` : ''}</dd>` : '') +
      near + `</dl><p>${esc(t('pm.pt.note'))}</p>`;
  }
  box.innerHTML = head + body;
  if (lab) lab.innerHTML = esc(pos.replace(' · ', ' ')) + (chip ? ' ' + chip : '');
  $('#pm-pt-x').addEventListener('click', clearPick);
  box.querySelectorAll('button[data-j]').forEach((b) => b.addEventListener('click', () => jump(Number(b.dataset.j))));
  const nb = $('#pm-pt-near'); if (nb) nb.addEventListener('click', () => select(pick.near.s.i));
}
function renderBest() {   // "when is best": for the picked point if there is one, else the date on which the most ground passes
  const b = $('#pm-best'); if (!b) return;
  const pt = pick && pick.mg && pick.nPass, j = pt ? pointBest(Math.max(0, Math.min(NV() - 1, Math.round(jf)))) : bestMapJ;
  b.textContent = t(pt ? 'pm.best.pt' : 'pm.best.map', { date: dateOf(j) }); b.dataset.j = j;
}

/* ---------------- the flight: pulled into the place, or let go of it ---------------- */
function nearPose(s, dir0) {   // 7 km from the site, coming in low
  const q = new THREE.Vector3(...world(s.x, s.y, 0)), d = dir0.clone(); d.y = 0;
  if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
  d.normalize().multiplyScalar(Math.cos(24 * D2R)).add(new THREE.Vector3(0, Math.sin(24 * D2R), 0));
  return { q, p: q.clone().add(d.multiplyScalar(7)) };
}
function flyTo(s) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dir0 = camera.position.clone().sub(controls.target).normalize(), B = nearPose(s, dir0);
  controls.enabled = false;
  $('.pm').classList.add('flying');
  if (opts && opts.warp) opts.warp(0, siteName(s.i));
  return new Promise((res) => { fly = { t0: performance.now(), dur: still ? 1 : 1700, out: false, pA: camera.position.clone(), qA: controls.target.clone(), pB: B.p, qB: B.q, res }; dirty = true; });
}
function flyFrom(s) {   // arriving back from the photograph: start at the site and pull out to the whole map
  const A = { p: new THREE.Vector3(...HOME.pos), q: new THREE.Vector3(...HOME.target) }, B = nearPose(s, A.p.clone().sub(A.q).normalize());
  controls.enabled = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  fly = { t0: performance.now(), dur: still ? 1 : 1500, out: true, pA: A.p, qA: A.q, pB: B.p, qB: B.q, res: null };
}
function flyStep(now) {
  const k = Math.min(1, (now - fly.t0) / fly.dur), p = fly.out ? 1 - k : k;
  const zoom = p * p * p, aim = 1 - (1 - p) * (1 - p);                      // slow start, then pulled in; the aim settles first
  const q = fly.qA.clone().lerp(fly.qB, aim);
  const dA = fly.pA.clone().sub(fly.qA), dB = fly.pB.clone().sub(fly.qB), lA = dA.length(), lB = dB.length();
  const dir = dA.normalize().lerp(dB.normalize(), aim).normalize();
  camera.position.copy(q).add(dir.multiplyScalar(lA * Math.pow(lB / lA, zoom)));   // distance shrinks by ratio, not by metres
  camera.up.set(0, 1, 0); camera.lookAt(q);
  camera.fov = FOV + 34 * zoom * zoom; camera.near = 0.3; camera.updateProjectionMatrix();
  if (!fly.out && opts && opts.warp) opts.warp(Math.max(0, Math.min(1, (k - 0.6) / 0.36)));
  dirty = true;
  if (k >= 1) {
    const f = fly; fly = null;
    if (f.out) { camera.fov = FOV; camera.near = 5; camera.updateProjectionMatrix(); camera.position.copy(f.pA); controls.target.copy(f.qA); controls.enabled = true; controls.update(); const el = $('.pm'); if (el) el.classList.remove('flying'); }
    if (f.res) f.res();
  }
}

function drawStrip() {
  const cv = $('#pm-strip'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio), W = Math.round(r.width * dpr), Hh = Math.round(r.height * dpr);
  if (!W || !Hh) return;
  cv.width = W; cv.height = Hh;
  const g = cv.getContext('2d'), n = NV(), top = Hh * 0.50, mx = Math.max(...P.pass_share);
  g.fillStyle = '#171c22'; g.fillRect(0, 0, W, top - 2 * dpr);
  if (pick && pick.mg) {   // the picked point: lime on the dates it passes (taller = more margin), olive where it misses by less than 40%
    for (let j = 0; j < n; j++) {
      const m = pick.mg[j]; if (m < -0.4) continue;
      const hh = m >= 0 ? (top - 2 * dpr) * (0.45 + 0.55 * Math.min(1, m / 1.0)) : (top - 2 * dpr) * 0.22;
      g.fillStyle = m >= 0 ? '#D8FA5C' : '#6f8430'; g.fillRect(Math.floor(j / n * W), top - 2 * dpr - hh, Math.ceil(W / n), hh);
    }
  } else {
    g.fillStyle = '#D8FA5C'; g.beginPath(); g.moveTo(0, top - 2 * dpr);
    for (let j = 0; j < n; j++) g.lineTo((j + 0.5) / n * W, (top - 2 * dpr) * (1 - 0.94 * P.pass_share[j] / mx));
    g.lineTo(W, top - 2 * dpr); g.closePath(); g.fill();
  }
  const rows = sites.length, rh = (Hh - top) / rows, d = HM.data;
  for (let s = 0; s < rows; s++) for (let j = 0; j < n; j++) {
    const p = d.passed[s][j]; if (p === null) continue;
    g.fillStyle = p ? '#D8FA5C' : '#262d34'; g.fillRect(Math.floor(j / n * W), Math.round(top + s * rh), Math.ceil(W / n), Math.max(1, Math.round(rh - dpr)));
  }
}
function placeNow() { const el = $('#pm-now'); if (el) el.style.left = (jf / (NV() - 1) * 100) + '%'; }

function wire() {
  const strip = $('#pm-strip-wrap');
  const seek = (ev) => { const r = strip.getBoundingClientRect(); jf = Math.max(0, Math.min(NV() - 1, (ev.clientX - r.left) / r.width * (NV() - 1))); setFrame(); };
  strip.addEventListener('pointerdown', (ev) => { dragging = true; setPlaying(false); strip.setPointerCapture(ev.pointerId); seek(ev); });
  strip.addEventListener('pointermove', (ev) => { if (dragging) seek(ev); });
  strip.addEventListener('pointerup', () => { dragging = false; jf = Math.round(jf); setFrame(); commit(); });
  strip.addEventListener('keydown', (ev) => { const st = { ArrowLeft: -1, ArrowRight: 1, PageDown: -30, PageUp: 30 }[ev.key]; if (st) { ev.preventDefault(); setPlaying(false); jf = Math.max(0, Math.min(NV() - 1, Math.round(jf) + st)); setFrame(); commit(); } });
  $('#pm-play').addEventListener('click', () => { if (jf >= NV() - 1) jf = 0; setPlaying(!playing); });
  $('#pm-why').addEventListener('change', (e) => { why = e.target.checked; mat.uniforms.uWhy.value = why ? 1 : 0; root.querySelectorAll('.pm-whyrow').forEach((li) => { li.hidden = !why; }); dirty = true; });
  $('#pm-open').addEventListener('click', openPhoto);
  $('#pm-best').addEventListener('click', (e) => jump(Number(e.currentTarget.dataset.j)));
  {   // the date is a button: click it to type the landing date and hour (UTC)
    const db = $('#pm-date'), di = $('#pm-date-in'); let j0 = 0, h0 = 0;
    const apply = () => {   // the typed value, read as UTC, to a day frame and an hour
      const ms = di.value ? Date.parse(di.value.slice(0, 13) + ':00Z') : NaN; if (!Number.isFinite(ms)) return;
      const lo = Date.parse(isoOf(0).slice(0, 10) + 'T00:00Z'), hi = Date.parse(isoOf(NV() - 1).slice(0, 10) + 'T23:00Z'), c = Math.max(lo, Math.min(hi, ms));
      hOff = new Date(c).getUTCHours() - 12; jump(Math.floor((c - lo) / 864e5));
    };
    const close = () => { if (di.hidden) return; di.hidden = true; db.hidden = false; };
    db.addEventListener('click', () => { setPlaying(false); j0 = Math.round(jf); h0 = hOff; di.value = isoAt(j0).slice(0, 16); db.hidden = true; di.hidden = false; di.focus(); });
    di.addEventListener('change', apply);
    di.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { apply(); close(); db.focus(); }
      else if (ev.key === 'Escape') { ev.stopPropagation(); hOff = h0; jump(j0); close(); db.focus(); }
    });
    di.addEventListener('blur', close);
  }
  let down = null;   // a click that is not a drag of the camera
  const cvs = renderer.domElement;
  cvs.addEventListener('pointerdown', (ev) => { down = ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null; });
  cvs.addEventListener('pointerup', (ev) => {
    const d = down; down = null;
    if (!d || fly || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
    const g = groundAt(ev); if (g) pickGround(g);
  });
  onKey = (ev) => { if (ev.code === 'Escape' && pick) clearPick(); if (ev.code === 'Space' && !/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName)) { ev.preventDefault(); if (jf >= NV() - 1) jf = 0; setPlaying(!playing); } };
  addEventListener('keydown', onKey);
  onResize = () => resize();
  addEventListener('resize', onResize);
}
function commit() {   // write the date to the shared state (not on every frame)
  clearTimeout(setTimer);
  setTimer = setTimeout(() => { if (alive) ctx.set({ time: isoAt(Math.max(0, Math.min(NV() - 1, Math.round(jf)))) }); }, 150);
}
function setPlaying(p) {
  playing = p;
  const icon = $('#pm-play-icon'); if (!icon) return;
  icon.setAttribute('d', p ? 'M1 0 H4.5 V12 H1 Z M7.5 0 H11 V12 H7.5 Z' : 'M2 0 L12 6 L2 12 Z');
  $('#pm-play').setAttribute('aria-label', t(p ? 'pm.pause' : 'pm.play'));
  if (!p) { jf = Math.round(jf); setFrame(); commit(); }
}
function resize() {
  const st = $('#pm-stage'); if (!st || !renderer) return;
  const w = st.clientWidth, h = st.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h;
  if (w > 1100) camera.setViewOffset(w, h, -w * 0.03, -h * 0.07, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  drawStrip(); dirty = true;
}
function placeLabels() {
  const st = $('#pm-stage'), w = st.clientWidth, h = st.clientHeight, v = new THREE.Vector3();
  const put = (el, p) => { v.set(p[0], p[1], p[2]).project(camera); const on = v.z < 1; el.style.display = on ? '' : 'none'; if (on) el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px)`; };
  const pts = sites.map((s) => { if (!s.w) s.w = world(s.x, s.y, 300); v.set(s.w[0], s.w[1], s.w[2]).project(camera); put(s.el, s.w); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h]; });
  sites.forEach((s, k) => {
    let cx = 0, cy = 0, n = 0;
    pts.forEach((q, m) => { if (m !== k && Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]) < 120) { cx += q[0]; cy += q[1]; n++; } });
    const dx = n ? pts[k][0] - cx / n : 1, dy = n ? pts[k][1] - cy / n : 0;
    s.el.classList.toggle('left', dx < 0);
    if (dx < 0) s.el.style.transform += ' translateX(-100%)';
    s.el.querySelector('span').style.transform = n ? `translateY(${Math.max(-16, Math.min(16, dy * 0.6)).toFixed(0)}px)` : '';
  });
  if (pick && rim.pickEl) { if (!pick.w) pick.w = world(pick.x, pick.y, 300); put(rim.pickEl, pick.w); }
  for (const k of ['sun', 'earth']) { const a = rim[k], rr = 205000; put(rim[k + 'El'], world(Math.sin(a) * rr, Math.cos(a) * rr)); }
}
function tick(now) {
  if (!alive) return;
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) { jf += dt * PLAY_DAYS_PER_S; if (jf >= NV() - 1) { jf = NV() - 1; setPlaying(false); } setFrame(); }
  if (fly) flyStep(now); else controls.update();
  if (!dirty) return;
  dirty = false;
  if (lightDirty) { lightDirty = false; renderer.setRenderTarget(lightRT); renderer.render(lightScene, lightCam); renderer.setRenderTarget(null); }
  renderer.render(scene, camera);
  placeLabels(); placeNow(); refreshDate();
}

export default {
  // opts.open(siteId, iso): the reader picked a site, go to its horizon photograph. opts.warp(k, label): the black-out of the flight.
  // opts.from: the site the reader comes back from (the map starts there and pulls out)
  async render(el, c, o) {
    root = el; ctx = c; opts = o; selected = null; shownJ = -1; atlas = []; playing = false; fly = null; pick = null; pickSeq++;
    const [pf, hf, lf] = await Promise.all([c.use('polar/polar.json'), c.use('outputs/heatmap.json'), c.use('outputs/landing_success.json')]);
    LS = lf && lf.data && Array.isArray(lf.data.p) ? lf : null;
    if (!pf || !hf) throw new Error('polar map data missing');
    P = { ...pf.data, __meta: pf.meta }; HM = hf;
    bestMapJ = P.pass_share.indexOf(Math.max(...P.pass_share));
    [THREE, { OrbitControls }] = await Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
    await loadHeights();
    jf = jOf(c.state.time); hOff = hOffOf(c.state.time); HH = null; hhAsked = false;
    if (c.state.site) { const k = HM.data.site_ids.indexOf(c.state.site); if (k >= 0) selected = k; }
    shell();
  },
  mounted() {
    document.body.classList.add('immersive');
    alive = true;
    build(); wire(); resize(); setFrame();
    if (selected !== null) applySel();
    if (opts && opts.from) { const s0 = sites.find((q) => q.id === opts.from); if (s0) { $('.pm').classList.add('flying'); flyFrom(s0); } }
    last = performance.now(); raf = requestAnimationFrame(tick);
    if (new URLSearchParams(location.search).get('play') === 'map') setPlaying(true);
  },
  update(s, changed) {
    if (changed.time && !playing && !dragging) { const j = jOf(s.time), h = hOffOf(s.time); if (j !== Math.round(jf) || h !== hOff) { jf = j; hOff = h; setFrame(); } }
    if (changed.site && s.site) { const k = HM.data.site_ids.indexOf(s.site); if (k >= 0 && k !== selected) { selected = k; applySel(); } }
  },
  unmount() {
    alive = false; fly = null; cancelAnimationFrame(raf); clearTimeout(setTimer);
    if (onKey) removeEventListener('keydown', onKey);
    if (onResize) removeEventListener('resize', onResize);
    if (controls) controls.dispose();
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
    if (lightRT) lightRT.dispose();
    atlas.forEach((a) => a && a.tex && a.tex.dispose());
    renderer = controls = lightRT = null;
    document.body.classList.remove('immersive');
  },
};
