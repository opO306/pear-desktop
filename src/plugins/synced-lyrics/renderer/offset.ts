/**
 * 곡별 가사 싱크 오프셋 (ms). 양수면 가사가 늦게, 음수면 일찍 나온다.
 * 곡(videoId)마다 localStorage에 저장해서 다음에 같은 곡을 들어도 유지된다.
 */
const STORAGE_KEY = 'synced-lyrics:offsets';
const MAX_ENTRIES = 300;
const MAX_OFFSET_MS = 10_000;

const load = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    );
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
};

const save = (offsets: Record<string, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(offsets));
  } catch {
    // 저장 실패해도 현재 곡에서는 계속 동작한다
  }
};

const offsets = load();
let videoId = '';

export const setOffsetVideoId = (id: string) => {
  videoId = id;
};

export const getOffsetMs = () => offsets[videoId] ?? 0;

/** 현재 곡의 오프셋을 delta만큼 바꾸고 새 값을 돌려준다. delta가 null이면 초기화한다. */
export const changeOffsetMs = (delta: number | null): number | null => {
  if (!videoId) return null;

  const next =
    delta === null
      ? 0
      : Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, getOffsetMs() + delta));

  // 다시 넣어서 "가장 최근에 쓴 곡"이 뒤에 오게 한다
  delete offsets[videoId];
  if (next !== 0) offsets[videoId] = next;

  const keys = Object.keys(offsets);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    delete offsets[key];
  }

  save(offsets);
  return next;
};
