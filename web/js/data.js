// data/ 폴더의 JSON을 읽어요. 계산은 하지 않아요 (판정·확률은 전부 파이프라인에서).
// 모든 파일은 {"meta": {...}, "data": {...}} 형태예요.

const ROOT = new URL('../../data/', import.meta.url);
const cache = new Map();

export function isDummy(path, json) {
  return /_dummy\./.test(path) || json?.meta?.dummy === true;
}

// 파일 하나를 읽어요. 없으면 null.
export function load(path) {
  if (!cache.has(path)) {
    const p = fetch(new URL(path, ROOT))
      .then(async (r) => {
        if (!r.ok) return null;
        const json = await r.json();
        return { path, meta: json.meta ?? {}, data: json.data ?? json, dummy: isDummy(path, json) };
      })
      .catch(() => null);
    cache.set(path, p);
    // 못 읽은 파일은 기억하지 않아요 → "다시 시도"하면 다시 받아요.
    p.then((f) => { if (!f) cache.delete(path); });
  }
  return cache.get(path);
}

// 진짜 파일을 먼저 찾고, 없으면 같은 이름의 _dummy 파일을 읽어요.
// 예: loadPreferReal('outputs/heatmap.json') → heatmap.json 또는 heatmap_dummy.json
export async function loadPreferReal(path) {
  return (await load(path)) ?? (await load(path.replace(/\.json$/, '_dummy.json')));
}
