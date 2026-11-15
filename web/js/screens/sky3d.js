// ① 하늘 — 미래의 사진 · 강민
// 착륙지에 카메라를 세우고, 착륙 뒤 30일의 매 시간을 "아직 찍히지 않은 사진"으로 보여 줘요.
// 지형은 NASA LOLA 실측(5 m·40 m·80 m), 해·지구 위치는 JPL Horizons예요. 빛은 해 하나예요.
// 지형의 점마다 미리 계산한 지평선(data/scene3d/<site>/)과 해 고도를 비교해서 밝기를 정해요(sun_frac와 같은 규칙).
// 카메라: HDR로 그린 뒤 렌즈 효과(빛 번짐, 조리개 별빛, 비네팅, 센서 노이즈)를 더해요. 합성 지형은 없어요.
// 지구 겉모습은 NASA Blue Marble(2002) 사진이고, 달을 향한 면은 시각에 맞춰 돌려요(근사).
//
// 화면에서 하는 일: 그림 그리기, 배열에서 다음 일몰·일출·지구몰 시각 찾기. 판정·확률 계산은 하지 않아요.

import { t, addStrings, fmt, getLang } from '../i18n.js';
import { time, setGrid } from '../time.js';

const DATA = new URL('../../../data/', import.meta.url);
const EARTH_IMG = new URL('../../assets/earth_bluemarble_2048.jpg', import.meta.url);
const WINDOW_H = 720;                       // the 30 days after landing
const DEMO_LANDING = '2026-11-17T12:00Z';   // the first landing shown when nothing is chosen yet
const D2R = Math.PI / 180;
const LENS_MM = 24;                         // the photo camera: a 24 mm lens on a 36 x 24 mm frame
const FAR = 400000;
const BACK = 0.9;                            // strength of the light reflected into shade (see backLight)
const FILM_H = 48;                          // pixels per band in the strip (the Sun, then Earth)
const EARTH_W = 10;                         // Earth's band: each hour is a 10-px-wide shot of the whole disc, folded to one line

addStrings({
  en: {
    's3.loading': 'Developing the photograph: NASA LOLA terrain, JPL Horizons Sun and Earth…',
    's3.site': 'Landing site', 's3.land': 'Landing time (UTC)',
    's3.play': 'Play the 30 days', 's3.pause': 'Pause',
    's3.view.above': 'Into the Sun', 's3.view.side': 'Light from the side', 's3.view.mast': 'Lander mast, long lens', 's3.view': 'Camera',
    's3.replan': 'Land at this frame',
    's3.strip': 'The 30 days after landing. Drag to move through them.',
    's3.src': 'Sources and limits', 's3.dev': 'Developed frames (path traced)',
    's3.src.dev': 'Developed frames', 's3.src.dev.v': 'In the side-light view, the marked hours fade to a path-traced frame (Blender Cycles) of the same terrain, the same Sun direction and the same camera. There the light in the shade is real light reflected by the terrain. Terrain within 60 km; rough diffuse regolith.',
    's3.src.terrain': 'Terrain', 's3.src.eph': 'Sun and Earth', 's3.src.light': 'Light and camera', 's3.src.earth': 'Earth image', 's3.src.limits': 'Limits', 's3.src.files': 'Files',
    's3.src.light.v': 'One light, the Sun. A point is lit by the share of the solar disc above its own horizon (the sun_frac rule); inside the 5 m patch the browser also traces toward the Sun over the 5 m heights. Regolith: Lommel–Seeliger with a phase function (an approximation). The camera is simulated: a 24 mm lens, high dynamic range, lens glare and an aperture starburst on the Sun, vignetting and sensor noise.',
    's3.src.earth.v': 'NASA Blue Marble (Terra MODIS, 2002), public domain. The clouds are from 2002, not the landing date; the face turned to the Moon is set from the date (approximate).',
    's3.src.files.v': '{files} · generated {gen} UTC · real data, not dummy',
    // the headline, written from the data at the shown hour
    'p.h1': 'Read the horizon.',
    'p.m.sun': 'Sun visible', 'p.m.earth': 'Earth visible', 'p.m.sunset': 'Until sunset', 'p.m.sunrise': 'Until sunrise', 'p.m.eset': 'Until Earth-set', 'p.m.erise': 'Until Earth-rise',
    'p.yes': 'Yes', 'p.no': 'No', 'p.m.note': 'Earth visibility ≠ confirmed communication',
    'p.h.last': 'The last hours of sunlight on {site}.',
    'p.h.day': 'Sunlight on {site} for another {d}.',
    'p.h.night': '{site} is in shadow. The Sun returns in {d}.',
    'p.h.dark': '{site} is in shadow for the rest of the data.',
    'p.h.always': 'Sunlight on {site} to the end of the data.',
    'p.sub': '{utc} · {kst}. The lander mast sees {p} of the Sun; {earth}.',
    'p.earth.in': 'Earth is in view, {lit} lit', 'p.earth.out': 'Earth is below the ridge',
    'p.meta': '{site} {cam} · {iso} · T+{tp} · SUN EL {sel} AZ {saz} · {sp} DISC · EARTH EL {eel} · {lens} · SIMULATED',
    'p.cam.ridge': 'RIDGE CAM', 'p.cam.side': 'SIDE CAM', 'p.cam.mast': 'MAST CAM 2 M',
    'p.lander': '{site} · lander', 'p.credit': 'Simulated photograph · {terrain} · JPL Horizons DE441 · Earth: NASA Blue Marble',
    'p.day': 'Day {d} of 30',
    'p.film.sun': 'Sun, seen from the mast', 'p.film.earth': 'Earth',
  },
  ko: {
    's3.loading': '사진을 현상하는 중이에요: NASA LOLA 지형, JPL Horizons 해·지구…',
    's3.site': '착륙지', 's3.land': '착륙 시각 (UTC)',
    's3.play': '30일 재생', 's3.pause': '멈춤',
    's3.view.above': '해를 마주 보고', 's3.view.side': '옆에서 받는 빛', 's3.view.mast': '착륙선 마스트, 망원', 's3.view': '카메라',
    's3.replan': '이 장면에 착륙',
    's3.strip': '착륙 뒤 30일. 끌어서 시간을 옮겨요.',
    's3.src': '출처와 한계', 's3.dev': '현상된 장면 (경로 추적)',
    's3.src.dev': '현상된 장면', 's3.src.dev.v': '옆빛 보기에서 표시된 시각은 같은 지형, 같은 해 방향, 같은 카메라로 경로 추적(Blender Cycles)한 장면으로 바뀌어요. 그늘의 빛은 지형이 실제로 반사한 빛이에요. 60 km 안의 지형, 거친 확산 표면.',
    's3.src.terrain': '지형', 's3.src.eph': '해와 지구', 's3.src.light': '빛과 카메라', 's3.src.earth': '지구 사진', 's3.src.limits': '한계', 's3.src.files': '파일',
    's3.src.light.v': '빛은 해 하나예요. 지형의 점마다 자기 지평선 위로 보이는 해 원반 비율만큼 밝아요(sun_frac 규칙). 5 m 구역 안에서는 브라우저가 5 m 높이를 따라 해 쪽으로 직접 추적해요. 흙 반사는 Lommel–Seeliger와 위상 함수 근사예요. 카메라는 모의예요: 24 mm 렌즈, 높은 명암 범위, 해의 빛 번짐과 조리개 별빛, 비네팅, 센서 노이즈.',
    's3.src.earth.v': 'NASA Blue Marble(Terra MODIS, 2002), 공공 저작물. 구름은 착륙 날짜가 아니라 2002년 것이에요. 달을 향한 면은 날짜로 돌렸어요(근사).',
    's3.src.files.v': '{files} · {gen} UTC에 만듦 · 진짜 데이터',
    'p.h1': '지평선을 읽어요.',
    'p.m.sun': '보이는 해', 'p.m.earth': '지구 보임', 'p.m.sunset': '해 질 때까지', 'p.m.sunrise': '해 뜰 때까지', 'p.m.eset': '지구 질 때까지', 'p.m.erise': '지구 뜰 때까지',
    'p.yes': '예', 'p.no': '아니요', 'p.m.note': '지구가 보인다고 교신이 확정된 건 아니에요',
    'p.h.last': '{site}의 마지막 햇빛.',
    'p.h.day': '{site}에 햇빛이 {d} 더 머물러요.',
    'p.h.night': '{site}는 그늘 속. 해는 {d} 뒤에 돌아와요.',
    'p.h.dark': '{site}는 데이터가 끝날 때까지 그늘이에요.',
    'p.h.always': '{site}에 데이터가 끝날 때까지 햇빛이 머물러요.',
    'p.sub': '{utc} · {kst}. 착륙선 마스트에서 해가 {p} 보여요. {earth}.',
    'p.earth.in': '지구가 보여요({lit} 밝음)', 'p.earth.out': '지구는 능선 아래예요',
    'p.meta': '{site} {cam} · {iso} · T+{tp} · SUN EL {sel} AZ {saz} · {sp} DISC · EARTH EL {eel} · {lens} · SIMULATED',
    'p.cam.ridge': 'RIDGE CAM', 'p.cam.side': 'SIDE CAM', 'p.cam.mast': 'MAST CAM 2 M',
    'p.lander': '{site} · 착륙선', 'p.credit': '모의 사진 · {terrain} · JPL Horizons DE441 · 지구: NASA Blue Marble',
    'p.day': '30일 중 {d}일째',
    'p.film.sun': '마스트에서 본 해', 'p.film.earth': '지구',
  },
});

/* ---------------- module state ---------------- */
let THREE = null, OrbitControls = null, PP = null;
let ctx = null, root = null, site = null;
let SC = null, VIS = null, PAN = null, kSite = -1;
let L = 0, h = 0, playing = false, dragging = false, view = 'above';
let renderer = null, composer = null, lensPass = null, scene = null, camera = null, controls = null;
let sun = null, burst = null, earth = null, skyline = null;
let mats = [], raf = 0, last = 0, shownHour = -1, aboveCam = null, sideCam = null, onKey = null, onResize = null;
let framed = false, lensShift = 0;
let DEV = null, camMoved = false, isDark = false;                       // path-traced frames for this site and landing (data/renders), and whether the viewer moved the camera   // the photo lens's fall (px), set so Earth stays under the caption
let G = null;                               // terrain heights kept on the CPU for the Sun's occlusion
let film = null, terrainMeshes = [], ridgeTrace = null;   // the 30-day strip: one slit per hour, cut from the mast camera
const sunDir = { v: null }, earthDir = { v: null };
const $ = (s) => root && root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = (id) => {
  const k = VIS.data.site_ids.indexOf(id);
  if (getLang() === 'ko') return VIS.data.site_names[k];
  return id === site && SC ? SC.data.name_en : id.toUpperCase();
};
const short = () => site.toUpperCase();
const vfovFor = (aspect) => 2 * Math.atan(Math.tan(Math.atan(18 / LENS_MM)) / aspect) / D2R;   // 36 mm wide frame

async function bin(file, T) {
  const r = await fetch(new URL(`scene3d/${site}/${file}`, DATA));
  if (!r.ok) throw new Error(`${file} ${r.status}`);
  return new T(await r.arrayBuffer());
}

/* ---------------- shaders ---------------- */
const COMMON = `
  const float PI = 3.14159265;
  float disc(float x) { float d = clamp(x, -1.0, 1.0); return 1.0 - (acos(d) - d * sqrt(1.0 - d * d)) / PI; }
  // the Sun against this point's own horizon (the horizon map), as a share of the solar disc
  float farLit(vec3 pos, vec3 sunDir, float sunR, sampler3D hz, float gridHalf, float step, float n, float naz, vec3 moonC) {
    vec3 up = normalize(pos - moonC);
    float sEl = asin(clamp(dot(sunDir, up), -1.0, 1.0));
    float az = atan(sunDir.x, -sunDir.z);
    vec2 uv = vec2(((pos.x + gridHalf) / step + 0.5) / n, ((-pos.z + gridHalf) / step + 0.5) / n);
    return disc((sEl - texture(hz, vec3(uv, fract(az / (2.0 * PI)) + 0.5 / naz)).r * PI / 180.0) / sunR);
  }
  // light scattered back into the shade by sunlit slopes: they stand in this point's sky on the side away from the Sun.
  // An estimate from the horizon map (how high that terrain stands), not a full inter-reflection solution.
  float backLight(vec3 pos, vec3 N, vec3 sunDir, sampler3D hz, float gridHalf, float step, float n, float naz) {
    vec2 uv = vec2(((pos.x + gridHalf) / step + 0.5) / n, ((-pos.z + gridHalf) / step + 0.5) / n);
    float az = atan(-sunDir.x, sunDir.z), s = 0.0;
    for (int k = -2; k <= 2; k++) {
      float a = az + float(k) * 0.5;
      float h = texture(hz, vec3(uv, fract(a / (2.0 * PI)) + 0.5 / naz)).r * PI / 180.0;
      s += max(sin(h), 0.0) * max(dot(N, normalize(vec3(sin(a), 0.25, -cos(a)))), 0.0);
    }
    return s / 5.0;
  }
  // regolith: Lommel-Seeliger with a phase function and the opposition surge (linear light; the camera tone-maps later)
  vec3 regolith(vec3 N, vec3 V, vec3 S, float lit, float albedo, float sunE) {
    float mu0 = max(dot(N, S), 0.0), mu = max(dot(N, V), 1e-3);
    float a = acos(clamp(dot(S, V), -1.0, 1.0));
    float phase = exp(-0.75 * a) * (1.0 + 0.9 / (1.0 + tan(a * 0.5) / 0.06));
    return vec3(albedo) * vec3(1.0, 0.985, 0.965) * (mu0 / (mu0 + mu)) * phase * lit * sunE * 4.0;
  }`;

function terrainMat(tex, half, step, n, naz) {
  return new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3() }, sunR: { value: 0 }, hz: { value: tex }, gridHalf: { value: half }, step: { value: step },
                n: { value: n }, naz: { value: naz }, moonC: { value: new THREE.Vector3() }, albedo: { value: 0.16 }, sunE: { value: 4.6 }, back: { value: BACK } },
    vertexShader: 'varying vec3 vPos; varying vec3 vNrm; void main() { vPos = position; vNrm = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      precision highp float; precision highp sampler3D;
      uniform vec3 sunDir; uniform float sunR; uniform sampler3D hz; uniform float gridHalf, step, n, naz; uniform vec3 moonC;
      uniform float albedo, sunE, back;
      varying vec3 vPos; varying vec3 vNrm;
      ${COMMON}
      void main() {
        float lit = farLit(vPos, sunDir, sunR, hz, gridHalf, step, n, naz, moonC);
        vec3 N = normalize(vNrm);
        vec3 c = regolith(N, normalize(cameraPosition - vPos), sunDir, lit, albedo, sunE);
        c += vec3(albedo * albedo) * sunE * 4.0 * back * backLight(vPos, N, sunDir, hz, gridHalf, step, n, naz);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function patchMat(hzTex, z5, P) {
  return new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3() }, sunR: { value: 0 }, hz: { value: hzTex }, gridHalf: { value: SC.data.inner.half },
                step: { value: SC.data.inner.hz_step }, n: { value: SC.data.inner.hz_n }, naz: { value: SC.data.inner.naz }, moonC: { value: new THREE.Vector3() },
                z5: { value: z5 }, n5: { value: P.n }, mapC: { value: new THREE.Vector3(...P.col) }, mapR: { value: new THREE.Vector3(...P.row) },
                albedo: { value: 0.16 }, sunE: { value: 4.6 }, back: { value: BACK } },
    vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      precision highp float; precision highp sampler3D;
      uniform vec3 sunDir; uniform float sunR; uniform sampler3D hz; uniform float gridHalf, step, n, naz; uniform vec3 moonC;
      uniform sampler2D z5; uniform float n5; uniform vec3 mapC, mapR;
      uniform float albedo, sunE, back;
      varying vec3 vPos;
      ${COMMON}
      vec2 tc(vec2 en) { return vec2(dot(mapC, vec3(en, 1.0)), dot(mapR, vec3(en, 1.0))); }
      float zAt(vec2 en) {                                   // bilinear by hand: float textures are not filtered everywhere
        vec2 t = tc(en); vec2 i = floor(t); vec2 f = t - i; ivec2 k = ivec2(i);
        float a = texelFetch(z5, k, 0).r, b = texelFetch(z5, k + ivec2(1, 0), 0).r, c = texelFetch(z5, k + ivec2(0, 1), 0).r, d = texelFetch(z5, k + ivec2(1, 1), 0).r;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      bool inside(vec2 en) { vec2 t = tc(en); return t.x > 1.0 && t.y > 1.0 && t.x < n5 - 2.0 && t.y < n5 - 2.0; }
      void main() {
        vec2 en = vec2(vPos.x, -vPos.z);
        float far = farLit(vPos, sunDir, sunR, hz, gridHalf, step, n, naz, moonC);
        // the real 5 m surface: its slope, and its own shadows traced toward the Sun over the 5 m heights.
        // Far from the camera one pixel covers many texels, so the slope is taken over the pixel's footprint (no sparkle).
        float e = clamp(0.5 * min(length(dFdx(en)), length(dFdy(en))), 5.0, 40.0);
        vec2 g = vec2(zAt(en + vec2(e, 0.0)) - zAt(en - vec2(e, 0.0)), zAt(en + vec2(0.0, e)) - zAt(en - vec2(0.0, e))) / (2.0 * e);
        vec3 N = normalize(vec3(-g.x, 1.0, g.y));
        float y0 = zAt(en) + 0.3, clear = 1e3, t = 6.0;
        for (int k = 0; k < 46; k++) {
          vec3 q = vec3(vPos.x, y0, vPos.z) + sunDir * t;
          vec2 qe = vec2(q.x, -q.z);
          if (!inside(qe)) break;
          clear = min(clear, (q.y - zAt(qe)) / t);
          t *= 1.16;
        }
        float lit = min(far, disc(clear / sunR));
        vec3 c = regolith(N, normalize(cameraPosition - vPos), sunDir, lit, albedo, sunE);
        c += vec3(albedo * albedo) * sunE * 4.0 * back * backLight(vPos, N, sunDir, hz, gridHalf, step, n, naz);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// the camera's own marks: lateral colour fringing toward the corners, natural light fall-off, sensor noise
const LENS_SHADER = {
  uniforms: { tDiffuse: { value: null }, seed: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float seed; varying vec2 vUv;
    float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec2 off = d * r2 * 0.005;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float cosT = 1.0 / sqrt(1.0 + r2 * 2.2);                 // cos^4 fall-off of a wide lens, softened
      c *= mix(0.62, 1.0, pow(cosT, 4.0) * 1.0);
      float n = h1(floor(gl_FragCoord.xy) + seed * 91.7) - 0.5;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c += n * (0.03 * (1.0 - lum) + 0.012);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/* ---------------- scene ---------------- */
const v3 = (e, n, u) => new THREE.Vector3(e, u, -n);                 // scene: x = east, y = up, z = south
function dirAzEl(az, el) { return v3(Math.cos(el * D2R) * Math.sin(az * D2R), Math.cos(el * D2R) * Math.cos(az * D2R), Math.sin(el * D2R)).normalize(); }

function gridGeometry(n, posAt, skip) {
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const [x, y, z] = posAt(i, j); const k = (j * n + i) * 3; pos[k] = x; pos[k + 1] = z; pos[k + 2] = -y; }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    if (skip && skip(pos[a * 3], -pos[a * 3 + 2]) && skip(pos[d * 3], -pos[d * 3 + 2])) continue;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal; let s = 0; for (let k = 0; k < nr.count; k += 101) s += nr.getY(k);
  if (s < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const tmp = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = tmp; } g.computeVertexNormals(); }
  return g;
}
function hzTexture(data, n, naz) {
  const tx = new THREE.Data3DTexture(data, n, n, naz);
  tx.format = THREE.RedFormat; tx.type = THREE.HalfFloatType;
  tx.minFilter = tx.magFilter = THREE.LinearFilter; tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping; tx.wrapR = THREE.RepeatWrapping;
  tx.unpackAlignment = 1; tx.needsUpdate = true;
  return tx;
}

// an aperture starburst (8 blades): thin spikes and a small core, drawn once into a texture
function starburstTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), c = S / 2;
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2, len = c * (k % 2 ? 0.62 : 0.95);
    g.save(); g.translate(c, c); g.rotate(a);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,250,240,0.9)'); gr.addColorStop(0.25, 'rgba(255,245,230,0.28)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -2.2); g.lineTo(len, 0); g.lineTo(0, 2.2); g.closePath(); g.fill();
    g.restore();
  }
  const core = g.createRadialGradient(c, c, 0, c, c, c * 0.18);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, S, S);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
async function build() {
  const D = SC.data, I = D.inner, O = D.outer, R = D.R;
  const [IZ, IHZ, OZ, OHZ] = await Promise.all([bin('inner_z.f32', Float32Array), bin('inner_hz.f16', Uint16Array), bin('outer_z.f32', Float32Array), bin('outer_hz.f16', Uint16Array)]);
  const PZ = D.patch ? await bin('patch_z5.i16', Int16Array) : null;
  const earthTex = await new THREE.TextureLoader().loadAsync(EARTH_IMG.href);
  earthTex.colorSpace = THREE.SRGBColorSpace; earthTex.anisotropy = 8;

  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.max(1.5, Math.min(2, devicePixelRatio)));   // at least 1.5: the terrain's fine shadows need the extra samples
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(48, 1.6, 2, 600000);
  const moonC = v3(0, 0, -(R + D.ground_h));
  const sunR = PAN.data.sun_radius_deg * D2R;

  const innerHz = hzTexture(IHZ, I.hz_n, I.naz);
  const innerMat = terrainMat(innerHz, I.half, I.hz_step, I.hz_n, I.naz);
  const outerMat = terrainMat(hzTexture(OHZ, O.n, O.naz), O.half, O.step, O.n, O.naz);
  mats = [innerMat, outerMat];
  G = { IZ, OZ, I, O, P: null, PF: null };
  let inPatch = null;
  if (PZ) {
    const P = D.patch, f = new Float32Array(PZ.length);
    for (let k = 0; k < PZ.length; k++) f[k] = PZ[k] * P.z_unit_m + (P.z_offset_m || 0);
    const z5 = new THREE.DataTexture(f, P.n, P.n, THREE.RedFormat, THREE.FloatType);
    z5.minFilter = z5.magFilter = THREE.NearestFilter; z5.needsUpdate = true;
    const pm = patchMat(innerHz, z5, P); mats.push(pm);
    const [a, b, c] = P.col, [d, e, ff] = P.row, det = a * e - b * d;
    const en = (col, row) => [(e * (col - c) - b * (row - ff)) / det, (-d * (col - c) + a * (row - ff)) / det];
    const st = P.n > 2000 ? 4 : 2, ng = Math.floor((P.n - 1) / st) + 1;        // the mesh takes every 2nd or 4th height; the shader reads all of them
    scene.add(new THREE.Mesh(gridGeometry(ng, (i, j) => { const [x, y] = en(i * st, j * st); return [x, y, f[(j * st) * P.n + i * st]]; }), pm));
    inPatch = (x, y) => { const cc = a * x + b * y + c, rr = d * x + e * y + ff; return cc > 2 && rr > 2 && cc < P.n - 3 && rr < P.n - 3; };
    G.P = P; G.PF = f;
  }
  const inner = new THREE.Mesh(gridGeometry(I.mesh_n, (i, j) => [i * I.mesh_step - I.half, j * I.mesh_step - I.half, IZ[j * I.mesh_n + i]], inPatch), innerMat);
  inner.position.y = inPatch ? -3 : 0; scene.add(inner);
  const inHole = (x, y) => Math.abs(x) < I.half - 400 && Math.abs(y) < I.half - 400;
  const outer = new THREE.Mesh(gridGeometry(O.n, (i, j) => [i * O.step - O.half, j * O.step - O.half, OZ[j * O.n + i]], inHole), outerMat);
  outer.position.y = -0.5; scene.add(outer);
  for (const m of mats) { m.uniforms.moonC.value.copy(moonC); m.uniforms.sunR.value = sunR; }

  // the Sun: a true-size disc far brighter than anything else (the camera clips and blooms it), and the aperture's starburst
  // (a plain shader, so its depth is written the same way as the terrain's and a crater wall really hides it)
  sun = new THREE.Mesh(new THREE.CircleGeometry(FAR * Math.tan(sunR), 64), new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(60.0, 58.0, 55.0, 1.0); }',
  }));
  scene.add(sun);
  burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: starburstTexture(), color: new THREE.Color(2.2, 2.1, 2.0), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true }));
  burst.renderOrder = 20; scene.add(burst);
  // veiling glare in floating point (no 8-bit banding): a round fall-off around the Sun
  const glare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { amount: { value: 1 } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float amount; varying vec2 vUv;
      void main(){ float r = length(vUv - 0.5) * 2.0; if (r >= 1.0) discard;
        float v = 0.012 / (r * r + 0.012) * (1.0 - r) * (1.0 - r);
        gl_FragColor = vec4(vec3(1.0, 0.975, 0.93) * v * 3.0 * amount, 1.0); }`,
  }));
  glare.renderOrder = 19; scene.add(glare); burst.userData.glare = glare;

  // Earth: the NASA Blue Marble, lit by the same Sun (so its phase is right), with a thin bright limb on the day side
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: earthTex }, sunDir: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vN; varying vec2 vUv; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
        float mu = dot(N, sunDir), lit = smoothstep(-0.04, 0.10, mu);
        vec3 day = texture2D(map, vUv).rgb;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 5.0) * smoothstep(-0.05, 0.35, mu);
        gl_FragColor = vec4(day * lit * 3.0 + vec3(0.30, 0.52, 1.0) * rim * 1.4, 1.0);
      }`,
  });
  earth = new THREE.Mesh(new THREE.SphereGeometry(FAR * Math.tan(PAN.data.earth_radius_deg * D2R), 96, 48), earthMat);
  scene.add(earth);
  mats.push(earthMat);

  // the mast's skyline from the site's own horizon file (2 m): a far black ring, only in the mast camera
  const eye = v3(0, 0, IZ[((I.mesh_n - 1) / 2) * I.mesh_n + (I.mesh_n - 1) / 2] + D.mast_m);
  const Dr = 45000, pos = [], ix = [], hz = PAN.data.horizon_el;
  for (let k = 0; k <= 720; k++) {
    const az = (k / 2) * D2R, j = Math.floor(k / 2) % 360, w = (k % 2) / 2, el = (hz[j] * (1 - w) + hz[(j + 1) % 360] * w) * D2R;
    const top = eye.clone().add(v3(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)).multiplyScalar(Dr));
    const bot = eye.clone().add(v3(Math.sin(az) * Math.cos(-8 * D2R), Math.cos(az) * Math.cos(-8 * D2R), Math.sin(-8 * D2R)).multiplyScalar(Dr));
    pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
    if (k < 720) { const a = k * 2; ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(ix);
  skyline = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x020202, side: THREE.DoubleSide }));
  skyline.visible = false; scene.add(skyline);
  skyline.userData.eye = eye;
  // the same skyline as a faint trace, drawn only into the strip so the Sun's thread has its ridge
  const tp = []; for (let k = 0; k <= 720; k++) tp.push(pos[k * 6], pos[k * 6 + 1], pos[k * 6 + 2]);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  ridgeTrace = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.05), depthTest: false }));
  ridgeTrace.renderOrder = 5; ridgeTrace.visible = false; scene.add(ridgeTrace);
  terrainMeshes = scene.children.filter((o) => o.isMesh && o !== sun && o !== earth && o !== skyline && o.material && o.material.uniforms && o.material.uniforms.hz);
  film = { rt: new THREE.WebGLRenderTarget(WINDOW_H + 1, FILM_H, { type: THREE.FloatType }), rtE: new THREE.WebGLRenderTarget((WINDOW_H + 1) * EARTH_W, FILM_H, { type: THREE.FloatType }),
           cam: new THREE.PerspectiveCamera(7, 1 / FILM_H, 2, 600000), next: 0,
           buf: new Float32Array((WINDOW_H + 1) * FILM_H * 4), bufE: new Float32Array((WINDOW_H + 1) * EARTH_W * FILM_H * 4), img: null, canvas: document.createElement('canvas') };
  film.canvas.width = WINDOW_H + 1; film.canvas.height = FILM_H * 2;

  // the photo camera: behind the site, aimed from the first frame's Sun and Earth
  sunDir.v = new THREE.Vector3(); earthDir.v = new THREE.Vector3();
  setDirs();
  const sa = Math.atan2(sunDir.v.x, -sunDir.v.z), ea = Math.atan2(earthDir.v.x, -earthDir.v.z);
  // both in the picture when they are close enough (a 24 mm frame is 74 deg wide); otherwise the Sun first, leaning to Earth's side
  const dse = Math.atan2(Math.sin(ea - sa), Math.cos(ea - sa));
  let look = Math.abs(dse) <= 66 * D2R ? sa + dse / 2 : sa + Math.sign(dse) * 26 * D2R;   // past 66 deg Earth falls wholly outside, never half cut
  // a site the Sun never reaches in these 30 days (a crater floor): from high on the wall behind it, across to the wall
  // the Sun does light, with the dark floor and the lander between
  const dark = !VIS.data.sun_frac[kSite].slice(L, L + WINDOW_H + 1).some((v) => v >= 0.5);
  if (dark) look = sa + Math.PI;
  isDark = dark;
  const ground = eye.y - D.mast_m, back = dark ? 9000 : 2600, be = -Math.sin(look) * back, bn = -Math.cos(look) * back;
  const camUp = Math.max(ground + 240, (zAtCPU(be, bn) ?? ground) + 400);     // never inside the terrain
  camera.position.copy(v3(be, bn, camUp));
  let aimUp = ground + 60;                                                      // about 2 deg down
  if (dark) {   // the far rim 8 deg above the middle of the picture
    let rim = -Math.PI / 2;
    for (let d = 300; d < 60000; d *= 1.03) { const z = zAtCPU(be + Math.sin(look) * d, bn + Math.cos(look) * d); if (z === null) break; rim = Math.max(rim, Math.atan2(z - camUp, d)); }
    aimUp = camUp + Math.tan(Math.min(-2 * D2R, rim - 8 * D2R)) * (back + 2200);
  }
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(v3(Math.sin(look) * 2200, Math.cos(look) * 2200, aimUp));
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 300; controls.maxDistance = 16000; controls.maxPolarAngle = 88 * D2R;
  controls.update();
  aboveCam = { pos: camera.position.clone(), target: controls.target.clone() };
  // a second camera for the same place and hour: low and close, with the Sun at its side, so the long shadows of the
  // real small craters cross the picture (the Sun itself is outside the frame)
  const sl = sa + (dse >= 0 ? -1 : 1) * 105 * D2R, se = -Math.sin(sl) * 4200, sn = -Math.cos(sl) * 4200;
  const sUp = Math.max(ground + 700, (zAtCPU(se, sn) ?? ground) + 300);
  sideCam = { pos: v3(se, sn, sUp), target: v3(Math.sin(sl) * 600, Math.cos(sl) * 600, sUp - 4800 * Math.tan(3.5 * D2R)) };   // 3.5 deg down: horizon under the caption, the site in the lower middle

  if (DEV) sideCam = { pos: v3(...DEV.cam_pos_enu), target: v3(...DEV.cam_target_enu) };   // the exact camera of the path-traced frames
  controls.addEventListener('start', () => { camMoved = true; });
  // the developing chain: HDR render -> lens glare (only the Sun is bright enough) -> tone map -> the camera's own marks
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
  composer = new PP.EffectComposer(renderer, rt);
  composer.addPass(new PP.RenderPass(scene, camera));
  composer.addPass(new PP.OutputPass());
  lensPass = new PP.ShaderPass(LENS_SHADER);
  composer.addPass(lensPass);
}

/* ---------------- time ---------------- */
const lerpAng = (a, b, w) => a + (((((b - a) % 360) + 540) % 360) - 180) * w;
function setDirs() {
  const P = PAN.data, k = Math.min(time.n - 2, L + Math.floor(h)), w = (L + h) - k;
  sunDir.v.copy(dirAzEl(lerpAng(P.sun_az[k], P.sun_az[k + 1], w), P.sun_el[k] + (P.sun_el[k + 1] - P.sun_el[k]) * w));
  earthDir.v.copy(dirAzEl(lerpAng(P.earth_az[k], P.earth_az[k + 1], w), P.earth_el[k] + (P.earth_el[k + 1] - P.earth_el[k]) * w));
  for (const m of mats) m.uniforms.sunDir.value.copy(sunDir.v);
}
const nextFrom = (arr, i, test) => { for (let j = i + 1; j < arr.length; j++) if (test(arr[j])) return j; return -1; };

// which face of Earth looks at the Moon at this time: a low-precision lunar position (about a degree) and Earth's rotation
function earthFacing(ms) {
  const d = ms / 86400000 + 2440587.5 - 2451545.0;
  const Lm = 218.316 + 13.176396 * d, Mm = 134.963 + 13.064993 * d, F = 93.272 + 13.229350 * d;
  const lon = (Lm + 6.289 * Math.sin(Mm * D2R)) * D2R, lat = 5.128 * Math.sin(F * D2R) * D2R, eps = 23.439 * D2R;
  const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
  const ra = Math.atan2(y * Math.cos(eps) - z * Math.sin(eps), x), dec = Math.asin(y * Math.sin(eps) + z * Math.cos(eps));
  const gmst = (280.46061837 + 360.98564736629 * d) * D2R;
  return { lon: ra - gmst, dec };
}
const basis = (a, b) => { const x = a.clone().normalize(), y = b.clone().addScaledVector(x, -b.dot(x)).normalize(), z = new THREE.Vector3().crossVectors(x, y); return new THREE.Matrix4().makeBasis(x, y, z); };
function orientEarth(ms, dir = earthDir.v) {
  const { lon, dec } = earthFacing(ms);
  const sLocal = new THREE.Vector3(Math.cos(dec) * Math.cos(lon), Math.sin(dec), -Math.cos(dec) * Math.sin(lon));   // sphere: lon 0 at +x, north +y
  const toMoon = dir.clone().negate();
  const lat = SC.data.lat * D2R, north = v3(0, Math.cos(lat), Math.sin(lat));     // Earth's axis taken along the Moon's (within ~25 deg)
  const R = basis(toMoon, north).multiply(basis(sLocal, new THREE.Vector3(0, 1, 0)).transpose());
  earth.quaternion.setFromRotationMatrix(R);
}

// how much of the Sun the camera sees past the terrain (for the glare): march toward the Sun over the height grids
function zAtCPU(e, n) {
  const { P, PF, I, O, IZ, OZ } = G;
  if (P) {
    const c = P.col[0] * e + P.col[1] * n + P.col[2], r = P.row[0] * e + P.row[1] * n + P.row[2];
    if (c > 1 && r > 1 && c < P.n - 2 && r < P.n - 2) {
      const i0 = Math.floor(c), j0 = Math.floor(r), fx = c - i0, fy = r - j0, k = j0 * P.n + i0;
      return (PF[k] * (1 - fx) + PF[k + 1] * fx) * (1 - fy) + (PF[k + P.n] * (1 - fx) + PF[k + P.n + 1] * fx) * fy;
    }
  }
  const grid = (Z, n0, half, step) => {
    const x = (e + half) / step, y = (n + half) / step;
    if (x < 0 || y < 0 || x >= n0 - 1 || y >= n0 - 1) return null;
    const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0, k = j0 * n0 + i0;
    return (Z[k] * (1 - fx) + Z[k + 1] * fx) * (1 - fy) + (Z[k + n0] * (1 - fx) + Z[k + n0 + 1] * fx) * fy;
  };
  return grid(IZ, I.mesh_n, I.half, I.mesh_step) ?? grid(OZ, O.n, O.half, O.step);
}
function sunSeen() {
  if (view === 'mast') return VIS.data.sun_frac[kSite][L + Math.round(h)];
  const p = camera.position, s = sunDir.v, sunR = PAN.data.sun_radius_deg * D2R;
  let clear = 1, tt = 30;
  for (let k = 0; k < 140; k++) {
    const qx = p.x + s.x * tt, qy = p.y + s.y * tt, qz = p.z + s.z * tt, zt = zAtCPU(qx, -qz);
    if (zt === null) break;
    clear = Math.min(clear, (qy - zt) / tt);
    tt *= 1.065;
  }
  const d = Math.max(-1, Math.min(1, clear / sunR));
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/* ---------------- the 30-day strip ----------------
   For every hour after landing, the mast camera turns to the Sun (then to Earth) and keeps one vertical line of
   pixels through it. Laid side by side, the lines are a month-long exposure: the Sun's thread breaks where the real
   ridge hides it, Earth's thread thins with its phase and drops below the skyline. Same scene, same light. */
function renderFilm(budget) {
  if (!film || film.next > WINDOW_H) return;
  const P = PAN.data, sf = VIS.data.sun_frac[kSite], eye = skyline.userData.eye, cam = film.cam, glare = burst.userData.glare;
  const keep = { sky: skyline.visible, burst: burst.visible, glare: glare.visible };
  skyline.visible = true; ridgeTrace.visible = true; burst.visible = false; terrainMeshes.forEach((m) => (m.visible = false));
  for (let n = 0; n < budget && film.next <= WINDOW_H; n++) {
    const k = film.next++, i = Math.min(time.n - 1, L + k);
    const sd = dirAzEl(P.sun_az[i], P.sun_el[i]), ed = dirAzEl(P.earth_az[i], P.earth_el[i]);
    for (const m of mats) m.uniforms.sunDir.value.copy(sd);
    sun.position.copy(eye).addScaledVector(sd, FAR); sun.lookAt(eye);
    earth.position.copy(eye).addScaledVector(ed, FAR); orientEarth(time.ms(i), ed);
    // the Sun: a 1-px slit at a fixed height, so its thread rises and falls with the Sun against the real ridge
    const az = Math.atan2(sd.x, -sd.z);
    cam.fov = 7; cam.aspect = 1 / FILM_H; cam.updateProjectionMatrix();
    cam.position.copy(eye);
    cam.lookAt(v3(Math.sin(az), Math.cos(az), Math.tan(1.4 * D2R)).multiplyScalar(1000).add(eye));
    const pxRad = (FILM_H / 2) / Math.tan(cam.fov / 2 * D2R), gs = 22 / pxRad * FAR * 0.98;
    glare.position.copy(eye).addScaledVector(sd, FAR * 0.98); glare.quaternion.copy(cam.quaternion); glare.scale.set(gs, gs, 1);
    glare.material.uniforms.amount.value = sf[i]; glare.visible = sf[i] > 0.01;
    film.rt.viewport.set(k, 0, 1, FILM_H); film.rt.scissor.set(k, 0, 1, FILM_H); film.rt.scissorTest = true;
    renderer.setRenderTarget(film.rt); renderer.render(scene, cam);
    // Earth: a narrow shot centred on its disc (10 deg tall, 2.1 deg wide: all of Earth); folded to one line when developed
    glare.visible = false;
    cam.fov = 10; cam.aspect = EARTH_W / FILM_H; cam.updateProjectionMatrix();
    cam.lookAt(eye.clone().addScaledVector(ed, 1000));
    film.rtE.viewport.set(k * EARTH_W, 0, EARTH_W, FILM_H); film.rtE.scissor.set(k * EARTH_W, 0, EARTH_W, FILM_H); film.rtE.scissorTest = true;
    renderer.setRenderTarget(film.rtE); renderer.render(scene, cam);
  }
  renderer.setRenderTarget(null);
  skyline.visible = keep.sky; ridgeTrace.visible = false; burst.visible = keep.burst; glare.visible = keep.glare; terrainMeshes.forEach((m) => (m.visible = true));
  setDirs();
  if (film.next > WINDOW_H || film.next % 192 < 48) developFilm();
}
// the strip's light goes through the same tone curve as the photograph, then into a 2D canvas
function developFilm() {
  const W = WINDOW_H + 1, H = FILM_H * 2, upto = Math.min(W, film.next), WE = W * EARTH_W;
  renderer.readRenderTargetPixels(film.rt, 0, 0, W, FILM_H, film.buf);
  renderer.readRenderTargetPixels(film.rtE, 0, 0, WE, FILM_H, film.bufE);
  if (!film.img) film.img = new ImageData(W, H);
  const d = film.img.data, b = film.buf, bE = film.bufE;
  // Earth: its ten columns averaged, row by row, like one wide slit: a crescent never slips between pixels, it just
  // gives less light, so the thread dims with Earth's phase; the ridge still cuts it
  const earthPx = (x, yy) => { let r = 0, g = 0, bl = 0; const row = (FILM_H - 1 - yy) * WE; for (let c = 0; c < EARTH_W; c++) { const q = (row + x * EARTH_W + c) * 4; r += bE[q]; g += bE[q + 1]; bl += bE[q + 2]; } return [r / EARTH_W, g / EARTH_W, bl / EARTH_W]; };
  const tone = (x) => { x *= 1.0 / 0.6; const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); const c = Math.min(1, Math.max(0, v)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dst = (y * W + x) * 4;
    if (x >= upto) { d[dst] = d[dst + 1] = d[dst + 2] = 0; d[dst + 3] = 255; continue; }
    let px;
    if (y < FILM_H) { const src = ((FILM_H - 1 - y) * W + x) * 4; px = [b[src], b[src + 1], b[src + 2]]; }
    else px = earthPx(x, y - FILM_H);
    d[dst] = 255 * tone(px[0]); d[dst + 1] = 255 * tone(px[1]); d[dst + 2] = 255 * tone(px[2]); d[dst + 3] = 255;
  }
  film.canvas.getContext('2d').putImageData(film.img, 0, 0);
  drawFilm();
}
function drawFilm() {
  const cv = $('#s3-film'); if (!cv || !film) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  const gap = Math.round(3 * dpr), bh = (cv.height - gap) / 2;
  g.drawImage(film.canvas, 0, 0, WINDOW_H + 1, FILM_H, 0, 0, cv.width, bh);
  g.drawImage(film.canvas, 0, FILM_H, WINDOW_H + 1, FILM_H, 0, bh + gap, cv.width, bh);
}
function resetFilm() { if (film) { film.next = 0; drawFilm(); } }

/* ---------------- markup ---------------- */
function shell() {
  const ids = VIS.data.site_ids;
  root.innerHTML = `
    <section class="s3 photo" aria-label="${esc(t('step.sky'))}">
      <div class="s3-stage" id="s3-stage"></div>
      <img class="s3-dev" id="s3-dev" alt="">
      <svg class="s3-anno" id="s3-anno" aria-hidden="true"></svg>
      <div class="s3-pick">
        <label><span class="sr">${esc(t('s3.site'))}</span><select id="s3-site">${ids.map((id) => `<option value="${id}"${id === site ? ' selected' : ''}>${esc(nameOf(id))}</option>`).join('')}</select></label>
        <label class="s3-dt"><span class="sr">${esc(t('s3.land'))}</span><input type="datetime-local" id="s3-land" step="3600"><span>UTC</span></label>
      </div>
      <div class="s3-caption">
        <h1 id="s3-h1">${esc(t('p.h1'))}</h1>
        <p class="s3-lead" id="s3-lead"></p>
        <p class="s3-sub" id="s3-sub"></p>
      </div>
      <dl class="s3-metrics" id="s3-metrics">
        <div><dt>${esc(t('p.m.sun'))}</dt><dd class="num" id="s3-m-sun"></dd></div>
        <div><dt>${esc(t('p.m.earth'))}</dt><dd id="s3-m-earth"></dd></div>
        <div><dt id="s3-m-sunl"></dt><dd class="num" id="s3-m-sunt"></dd></div>
        <div><dt id="s3-m-earthl"></dt><dd class="num" id="s3-m-eartht"></dd></div>
        <p>${esc(t('p.m.note'))}</p>
      </dl>
      <p class="s3-meta" id="s3-meta"></p>
      <p class="s3-msg" id="s3-msg">${esc(t('s3.loading'))}</p>
    </section>
    <section class="s3-bar" aria-label="${esc(t('s3.strip'))}">
      <div class="s3-ctl"><button class="s3-play" id="s3-play" type="button" aria-label="${esc(t('s3.play'))}"><svg viewBox="0 0 12 12" aria-hidden="true"><path id="s3-play-icon" d="M2 0 L12 6 L2 12 Z"/></svg></button>
      <p class="s3-day num" id="s3-day"></p></div>
      <p class="s3-film-labs" aria-hidden="true"><span>${esc(t('p.film.sun'))}</span><span>${esc(t('p.film.earth'))}</span></p>
      <div class="s3-film" id="s3-film-wrap" role="slider" tabindex="0" aria-label="${esc(t('s3.strip'))}" aria-valuemin="0" aria-valuemax="${WINDOW_H}">
        <canvas id="s3-film"></canvas>
        <span class="s3-film-date a" id="s3-film-a"></span><span class="s3-film-date b" id="s3-film-b"></span>
        <span class="s3-film-dev" id="s3-film-dev" aria-hidden="true"></span>
        <i class="s3-film-now" id="s3-film-now"></i>
      </div>
      <div class="s3-views" role="group" aria-label="${esc(t('s3.view'))}">
        <button type="button" data-view="above" aria-pressed="true">${esc(t('s3.view.above'))}</button>
        <button type="button" data-view="side" aria-pressed="false">${esc(t('s3.view.side'))}</button>
        <button type="button" data-view="mast" aria-pressed="false">${esc(t('s3.view.mast'))}</button>
      </div>
      <button class="s3-land" id="s3-replan" type="button">${esc(t('s3.replan'))} →</button>
    </section>
    <p class="s3-credit" id="s3-credit"></p>
    <section class="sources" aria-labelledby="s3-src-h"><h2 id="s3-src-h">${esc(t('s3.src'))}</h2><dl id="s3-src"></dl></section>`;
}

function wire() {
  $('#s3-site').addEventListener('change', (e) => ctx.set({ site: e.target.value }));
  const land = $('#s3-land');
  land.min = time.iso(0).slice(0, 16); land.max = time.iso(time.n - 1 - WINDOW_H).slice(0, 16);
  land.addEventListener('change', () => { if (!land.value) return; const i = time.index(land.value + 'Z'); if (i !== null) ctx.set({ time: time.iso(Math.min(time.n - 1 - WINDOW_H, time.clamp(i))) }); });
  $('#s3-play').addEventListener('click', () => { if (h >= WINDOW_H) h = 0; setPlaying(!playing); });
  $('#s3-replan').addEventListener('click', () => ctx.set({ step: 'replan' }));
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  const strip = $('#s3-film-wrap');
  const seek = (ev) => { const r = strip.getBoundingClientRect(); h = Math.max(0, Math.min(WINDOW_H, ((ev.clientX - r.left) / r.width) * WINDOW_H)); };
  strip.addEventListener('pointerdown', (ev) => { dragging = true; setPlaying(false); strip.setPointerCapture(ev.pointerId); seek(ev); });
  strip.addEventListener('pointermove', (ev) => { if (dragging) seek(ev); });
  strip.addEventListener('pointerup', () => { dragging = false; h = Math.round(h); if (DEV && view === 'side') { const near = DEV.hours.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a)); if (Math.abs(near - h) <= 1) h = near; } });
  strip.addEventListener('keydown', (ev) => { const st = { ArrowLeft: -1, ArrowRight: 1, PageDown: -24, PageUp: 24 }[ev.key]; if (st) { ev.preventDefault(); setPlaying(false); h = Math.max(0, Math.min(WINDOW_H, Math.round(h) + st)); } });
  onKey = (ev) => { if (ev.code === 'Space' && !/INPUT|SELECT|BUTTON/.test(document.activeElement.tagName)) { ev.preventDefault(); if (h >= WINDOW_H) h = 0; setPlaying(!playing); } };
  addEventListener('keydown', onKey);
  onResize = () => resize();
  addEventListener('resize', onResize);
}

function setPlaying(p) {
  playing = p;
  const icon = $('#s3-play-icon'); if (!icon) return;
  icon.setAttribute('d', p ? 'M1 0 H4.5 V12 H1 Z M7.5 0 H11 V12 H7.5 Z' : 'M2 0 L12 6 L2 12 Z');
  $('#s3-play').setAttribute('aria-label', t(p ? 's3.pause' : 's3.play'));
}
function setView(v) {
  const keep = { above: aboveCam, side: DEV ? null : sideCam }[view]; if (keep) { keep.pos.copy(camera.position); keep.target.copy(controls.target); }
  camMoved = false;
  view = v;
  root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  controls.enabled = view !== 'mast'; skyline.visible = view === 'mast';
  const go = { above: aboveCam, side: sideCam }[view]; if (go) { camera.position.copy(go.pos); controls.target.copy(go.target); controls.update(); }
  resize();
  shownHour = -1;
}
function mastCamera() {
  const az = Math.atan2(sunDir.v.x, -sunDir.v.z);
  camera.position.copy(skyline.userData.eye);
  camera.lookAt(v3(Math.sin(az), Math.cos(az), Math.tan(1.0 * D2R)).multiplyScalar(1000).add(camera.position));
}
function resize() {
  const st = $('#s3-stage'); if (!st || !renderer) return;
  framed = false;
  renderer.setSize(st.clientWidth, st.clientHeight); composer.setSize(st.clientWidth, st.clientHeight);
  applyLens();
  drawFilm();
}
// 24 mm with a lens fall (like a shift lens: the picture slides down, nothing tilts), or the mast's long lens (about 280 mm)
function applyLens() {
  const st = $('#s3-stage'), w = st.clientWidth, hh = st.clientHeight, sh = view === 'above' ? lensShift : 0, full = hh + 2 * sh;
  camera.aspect = w / full;
  camera.fov = view === 'mast' ? 9 : vfovFor(camera.aspect);
  if (sh > 0) camera.setViewOffset(w, full, 0, 0, w, hh); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// slide the picture down just enough that Earth, wherever it goes in these 30 days, and the skyline pass under the caption
function frameSky() {
  framed = true;
  const cap = $('.s3-caption'), st = $('#s3-stage'); if (!cap || !st || view !== 'above') return;
  const P = PAN.data, sr = st.getBoundingClientRect(), cr = cap.getBoundingClientRect();
  const clear = cr.bottom - sr.top + 24, x0 = cr.left - sr.left - 40, x1 = cr.right - sr.left + 40;
  lensShift = 0; applyLens(); camera.updateMatrixWorld();
  let need = 0;
  const under = (q) => { if (q.ok && q.x > x0 && q.x < x1) need = Math.max(need, clear - q.y); };
  for (let j = L; j <= Math.min(time.n - 1, L + WINDOW_H); j++) under(project(camera.position.clone().addScaledVector(dirAzEl(P.earth_az[j], P.earth_el[j] + P.earth_radius_deg), FAR)));
  // and the skyline this camera sees (a crater's far rim can stand high)
  const c = camera.position, fw = camera.getWorldDirection(new THREE.Vector3()), yaw = Math.atan2(fw.x, -fw.z);
  for (let da = -40; da <= 40; da += 4) {
    const a = yaw + da * D2R; let best = -Infinity, top = null;
    for (let d = 200; d < 60000; d *= 1.04) {
      const e = c.x + Math.sin(a) * d, n = -c.z + Math.cos(a) * d, z = zAtCPU(e, n); if (z === null) break;
      const el = (z - c.y) / d; if (el > best) { best = el; top = v3(e, n, z); }
    }
    if (top) under(project(top));
  }
  lensShift = Math.round(Math.min(0.22 * sr.height, need)); applyLens();
}

// the photograph develops: when the view rests on an hour that has a path-traced frame, that frame fades in over the live render
function develop() {
  const img = $('#s3-dev'); if (!img) return;
  const hh = Math.round(h), ok = DEV && view === 'side' && !playing && !dragging && !camMoved && Math.abs(h - hh) < 1e-6 && DEV.hours.includes(hh);
  if (ok) {
    const src = new URL(`renders/${site}/${DEV.file.replace('{hhh}', String(hh).padStart(3, '0'))}`, DATA).href;
    if (img.dataset.src !== src) { img.dataset.src = src; img.classList.remove('on'); img.onload = () => { if (img.dataset.src === src) img.classList.add('on'); }; img.src = src; }
  } else if (img.dataset.src) { img.dataset.src = ''; img.classList.remove('on'); }
}

/* ---------------- words on the photograph ---------------- */
function readouts(i) {
  if (i === shownHour) return; shownHour = i;
  const sf = VIS.data.sun_frac[kSite], ev = VIS.data.earth_vis[kSite], P = PAN.data, up = sf[i] >= 0.5;
  const sunJ = up ? nextFrom(sf, i, (v) => v < 0.5) : nextFrom(sf, i, (v) => v >= 0.5);
  const name = getLang() === 'ko' ? SC.data.name_ko : SC.data.name_en;
  let head;
  if (up) head = sunJ < 0 ? t('p.h.always', { site: name }) : (sunJ - i <= 12 ? t('p.h.last', { site: name }) : t('p.h.day', { site: name, d: fmt.dur(sunJ - i) }));
  else head = sunJ < 0 ? t('p.h.dark', { site: name }) : t('p.h.night', { site: name, d: fmt.dur(sunJ - i) });
  const gap = Math.acos(Math.max(-1, Math.min(1, sunDir.v.dot(earthDir.v)))), lit = (1 + Math.cos(Math.PI - gap)) / 2;
  const ms = time.ms(i);
  $('#s3-lead').textContent = head;
  // the four answers of the design system's Sky card, read from the same arrays
  const eJ = ev[i] ? nextFrom(ev, i, (v) => v < 0.5) : nextFrom(ev, i, (v) => v >= 0.5), until = (j) => (j < 0 ? '—' : fmt.dur(j - i));
  $('#s3-m-sun').textContent = fmt.pct(sf[i]);
  $('#s3-m-earth').textContent = t(ev[i] ? 'p.yes' : 'p.no');
  $('#s3-m-sunl').textContent = t(up ? 'p.m.sunset' : 'p.m.sunrise'); $('#s3-m-sunt').textContent = until(sunJ);
  $('#s3-m-earthl').textContent = t(ev[i] ? 'p.m.eset' : 'p.m.erise'); $('#s3-m-eartht').textContent = until(eJ);
  $('#s3-sub').textContent = t('p.sub', { utc: fmt.utc(ms), kst: fmt.kst(ms), p: fmt.pct(sf[i]), earth: ev[i] ? t('p.earth.in', { lit: fmt.pct(lit) }) : t('p.earth.out') });
  const tp = i - L, d2 = (v) => (v < 0 ? '-' : '+') + Math.abs(v).toFixed(2) + '°';
  $('#s3-meta').textContent = t('p.meta', {
    site: short(), cam: t(view === 'mast' ? 'p.cam.mast' : view === 'side' ? 'p.cam.side' : 'p.cam.ridge'), iso: time.iso(i).replace('T', ' ').replace('Z', 'Z'),
    tp: `${Math.floor(tp / 24)}D${String(tp % 24).padStart(2, '0')}H`, sel: d2(P.sun_el[i]), saz: P.sun_az[i].toFixed(1) + '°', sp: fmt.pct(sf[i]),
    eel: d2(P.earth_el[i]), lens: view === 'mast' ? '280 MM EQ' : `${LENS_MM} MM EQ`,
  });
  $('#s3-day').textContent = t('p.day', { d: Math.floor(tp / 24) + 1 });
}

function project(p) { const v = p.clone().project(camera); const st = $('#s3-stage'); return { x: (v.x + 1) / 2 * st.clientWidth, y: (1 - v.y) / 2 * st.clientHeight, ok: v.z < 1 && v.z > -1 }; }
// an editorial callout, the way a photo essay marks a place: one hairline and a small label
function drawAnno() {
  const st = $('#s3-stage'), W = st.clientWidth, H = st.clientHeight;
  let s = '';
  if (view !== 'mast') {
    const g0 = skyline.userData.eye.y - SC.data.mast_m, cp = project(v3(0, 0, g0 + 2));
    if (cp.ok && cp.x > 0 && cp.x < W && cp.y > 0 && cp.y < H) {
      s += `<line x1="${cp.x.toFixed(1)}" y1="${(cp.y - 6).toFixed(1)}" x2="${cp.x.toFixed(1)}" y2="${(cp.y - 58).toFixed(1)}"/>`;
      s += `<text x="${(cp.x + 6).toFixed(1)}" y="${(cp.y - 50).toFixed(1)}">${esc(t('p.lander', { site: short() }))}</text>`;
    }
  }
  $('#s3-anno').innerHTML = s;
}

function sources() {
  const m = SC.meta, P = SC.data.patch;
  const res = [...(P ? [5] : []), ...(SC.data.inner.dem_m || [40])].map((v) => `${v} m`).join(' / ');   // the LOLA grids this scene really uses
  const sfs = P && /shape-from-shading/.test(P.source || '');   // name the terrain the picture really uses
  $('#s3-credit').textContent = t('p.credit', { terrain: sfs ? `NASA PGDA SfS 5 m + LOLA ${(SC.data.inner.dem_m || [40]).join(' / ')} m` : `NASA LOLA ${res}` }) + (DEV ? ' · Blender Cycles' : '');
  $('#s3-src').innerHTML = [
    ['s3.src.terrain', `${m.terrain.source}: ${m.terrain.files.join(', ')}.${P ? ` ${m.terrain.note_5m}. 5 m vs 40 m: mean ${P.check_vs_40m.mean_m} m, rms ${P.check_vs_40m.rms_m} m.` : ''}`],
    ['s3.src.eph', `${m.ephemeris.source}, ${m.ephemeris.observer}.`],
    ['s3.src.light', t('s3.src.light.v')],
    ...(DEV ? [['s3.src.dev', t('s3.src.dev.v')]] : []),
    ['s3.src.earth', t('s3.src.earth.v')],
    ['s3.src.limits', m.limits],
    ['s3.src.files', t('s3.src.files.v', { files: `scene3d/${site}/, visibility.json, panorama_${site}.json, web/assets/earth_bluemarble_2048.jpg`, gen: m.generated_utc.replace('T', ' ').replace('Z', '') })],
  ].map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
}

function header() {
  const land = $('#s3-land'); if (document.activeElement !== land) land.value = time.iso(L).slice(0, 16);
  $('#s3-film-a').textContent = fmt.date(time.ms(L), 'UTC', false); $('#s3-film-b').textContent = fmt.date(time.ms(L + WINDOW_H), 'UTC', false);
  if (DEV) {   // mark the hours that have a path-traced frame
    $('#s3-film-dev').innerHTML = DEV.hours.map((x) => `<i style="left:${(x / WINDOW_H) * 100}%"></i>`).join('');
    $('#s3-film-a').insertAdjacentHTML('beforeend', `<span class="s3-film-devlab">${esc(t('s3.dev'))}</span>`);
  }
}

function tick(ts) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  if (playing && !dragging) {
    // a day per second, slowed to a fifth near each sunset or sunrise at the mast
    const sf = VIS.data.sun_frac[kSite]; let near = 99;
    for (let k = Math.max(1, Math.floor(h) - 8); k <= Math.min(WINDOW_H, Math.floor(h) + 8); k++) if ((sf[L + k] >= 0.5) !== (sf[L + k - 1] >= 0.5)) near = Math.min(near, Math.abs(h - k));
    h = Math.min(WINDOW_H, h + dt * 24 * (0.2 + 0.8 * Math.min(1, near / 8)));
    if (h >= WINDOW_H) setPlaying(false);
  }
  if (film && film.next <= WINDOW_H) renderFilm(48);      // develop the strip a little each frame (it restores the light)
  if (!framed && shownHour >= 0) frameSky();
  setDirs();
  if (view === 'mast') mastCamera(); else controls.update();
  sun.position.copy(camera.position).addScaledVector(sunDir.v, FAR); sun.lookAt(camera.position);
  earth.position.copy(camera.position).addScaledVector(earthDir.v, FAR);
  orientEarth(time.ms(L) + h * 3600e3);
  // the starburst follows the Sun and fades with the share of it the camera sees
  const seen = sunSeen(), pxRad = ($('#s3-stage').clientHeight / 2) / Math.tan(camera.fov / 2 * D2R);
  burst.position.copy(camera.position).addScaledVector(sunDir.v, FAR * 0.98);
  const size = (view === 'mast' ? 700 : 360) / pxRad * FAR * 0.98;
  burst.scale.set(size, size, 1); burst.material.opacity = Math.pow(seen, 1.5); burst.visible = seen > 0.01;
  const glare = burst.userData.glare, gs = (view === 'mast' ? 1000 : 700) / pxRad * FAR * 0.98;
  glare.position.copy(burst.position); glare.quaternion.copy(camera.quaternion); glare.scale.set(gs, gs, 1); glare.material.uniforms.amount.value = seen; glare.visible = seen > 0.01;
  lensPass.uniforms.seed.value = (ts * 0.001) % 97;
  composer.render();
  const i = L + Math.round(h);
  readouts(i); drawAnno();
  const nowEl = $('#s3-film-now'); if (nowEl) nowEl.style.left = `${(h / WINDOW_H) * 100}%`;
  develop();
  const fw = $('#s3-film-wrap'); if (fw) { fw.setAttribute('aria-valuenow', String(Math.round(h))); fw.setAttribute('aria-valuetext', fmt.utc(time.ms(L + Math.round(h)))); }
}

/* ---------------- screen contract (see js/app.js) ---------------- */
export default {
  async render(el, c, siteId) {
    ctx = c; root = el; site = siteId;
    const st = c.state;
    const [vis, pan, sc, rx] = await Promise.all([c.use('inputs/visibility.json'), c.use(`inputs/panorama_${site}.json`), c.use(`scene3d/${site}/scene.json`), c.use('renders/index.json')]);
    if (!vis || !pan || !sc) throw new Error('missing data');
    VIS = vis; PAN = pan; SC = sc; setGrid(VIS.data.times_utc);
    kSite = VIS.data.site_ids.indexOf(site);
    const ti = time.index(st.time || DEMO_LANDING);
    L = Math.min(time.n - 1 - WINDOW_H, time.clamp(ti === null ? time.index(DEMO_LANDING) : ti));
    const dv = rx && rx.data && rx.data[site];
    DEV = dv && time.index(dv.landing_utc) === L ? dv : null; camMoved = false;
    // for demos and checks: ?h=<hours after landing>, ?play=1, ?cam=mast
    const q = new URLSearchParams(location.search);
    h = Math.max(0, Math.min(WINDOW_H, Number(q.get('h')) || 0)); shownHour = -1; view = 'above'; playing = q.get('play') === '1';
    if (!THREE) {
      THREE = await import('three');
      ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
      const [a, b, d, e] = await Promise.all(['EffectComposer', 'RenderPass', 'ShaderPass', 'OutputPass'].map((n) => import(`three/addons/postprocessing/${n}.js`)));
      PP = { ...a, ...b, ...d, ...e };
    }
    shell();
    await build();
    $('#s3-stage').appendChild(renderer.domElement);
    wire(); header(); sources();
  },
  mounted(state) {
    if (!renderer) return;
    document.body.classList.add('immersive');
    setView({ mast: 'mast', side: 'side', sun: 'above' }[new URLSearchParams(location.search).get('cam')] || (DEV && !isDark ? 'side' : 'above'));   // a crater floor opens on the camera that looks across it setPlaying(playing);
    $('#s3-msg').hidden = true;
    last = performance.now(); raf = requestAnimationFrame(tick);
    if (state.site !== site || state.time !== time.iso(L)) ctx.set({ site, time: time.iso(L) });
  },
  update(state, changed) {
    if (changed.time) {
      const i = time.index(state.time);
      if (i !== null) { L = Math.min(time.n - 1 - WINDOW_H, time.clamp(i)); h = 0; shownHour = -1; header(); resetFilm(); }
      return;
    }
    if (changed.delay || changed.planb) return;
    return 'rerender';
  },
  unmount() {
    cancelAnimationFrame(raf); raf = 0;
    if (onKey) removeEventListener('keydown', onKey);
    if (onResize) removeEventListener('resize', onResize);
    onKey = onResize = null;
    if (controls) controls.dispose();
    if (composer) composer.dispose();
    if (film) { film.rt.dispose(); film.rtE.dispose(); }
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    renderer = composer = scene = camera = controls = sun = burst = earth = skyline = ridgeTrace = null; mats = []; G = null; film = null; terrainMeshes = []; framed = false; lensShift = 0;
    document.body.classList.remove('immersive');
  },
};
