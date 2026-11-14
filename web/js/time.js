// 데이터의 시간 격자: 2026-11-01T00:00Z부터 1시간 간격 19,008개 (data/project_meta.json의 time).
// 배열의 i번째 값 = times_utc[i]. 공유 상태의 time은 "2026-11-14T05:00Z" 같은 ISO 문자열이에요.

const HOUR = 3600e3;
const grid = { t0: Date.UTC(2026, 10, 1, 0), n: 19008 };

// visibility.json을 읽으면 그 times_utc로 격자를 맞춰요.
export function setGrid(timesUtc) {
  if (!Array.isArray(timesUtc) || !timesUtc.length) return;
  const t0 = Date.parse(timesUtc[0]);
  console.assert(t0 === grid.t0, 'times_utc[0] differs from the web grid', timesUtc[0]);
  console.assert(Date.parse(timesUtc[timesUtc.length - 1]) === t0 + (timesUtc.length - 1) * HOUR, 'times_utc is not hourly');
  grid.t0 = t0;
  grid.n = timesUtc.length;
}

export const time = {
  get n() { return grid.n; },
  clamp(i) { return Math.max(0, Math.min(grid.n - 1, Math.round(i))); },
  // ISO → hour index (null if unreadable), not clamped
  index(iso) {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? Math.round((ms - grid.t0) / HOUR) : null;
  },
  ms(i) { return grid.t0 + time.clamp(i) * HOUR; },
  iso(i) { return new Date(time.ms(i)).toISOString().slice(0, 13) + ':00Z'; },
  now() { return time.clamp(Math.floor((Date.now() - grid.t0) / HOUR)); },
};
