/**
 * 번역 결과 저장/선별 (순수 함수 + localStorage). 곡(videoId)마다 한 번만 번역하도록 저장한다.
 */
const STORAGE_KEY = 'synced-lyrics:translations:v1';
const MAX_SONGS = 300;

/** 한 곡에서 번역할 최대 글자 수 (비정상적으로 긴 가사로 한도를 쓰는 걸 막는다) */
export const MAX_TRANSLATE_CHARS = 12_000;

export type TranslationMap = Record<string, string>;
type Stored = Record<string, { at: number; map: TranslationMap }>;

export const normalizeLine = (text: string) => text.trim();

/** 번역할 줄만 고른다: 글자가 있는 줄, 중복 제거(후렴), 순서 유지 */
export const pickTranslatableTexts = (lines: { text: string }[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const text = normalizeLine(line.text);
    if (!text || !/\p{L}/u.test(text) || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
};

export const totalChars = (texts: string[]) =>
  texts.reduce((sum, text) => sum + text.length, 0);

const readAll = (): Stored => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Stored)
      : {};
  } catch {
    return {};
  }
};

export const loadSongTranslations = (videoId: string): TranslationMap | null =>
  readAll()[videoId]?.map ?? null;

export const saveSongTranslations = (videoId: string, map: TranslationMap) => {
  const all = readAll();
  delete all[videoId];
  all[videoId] = { at: Date.now(), map };

  // 오래된 곡부터 지운다
  const keys = Object.keys(all).sort((a, b) => all[a].at - all[b].at);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_SONGS))) {
    delete all[key];
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 저장 실패해도 이번 곡에서는 계속 보인다
  }
};
