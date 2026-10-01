import { createEffect, createSignal, runWithOwner, untrack } from 'solid-js';
import { detect } from 'tinyld';

import { getSongInfo } from '@/providers/song-info-front';

import { showToast } from './hotkeys';
import { reactiveOwner } from './reactive-root';
import { config } from './renderer';
import { currentLyrics } from './store';
import {
  MAX_TRANSLATE_CHARS,
  loadSongTranslations,
  normalizeLine,
  pickTranslatableTexts,
  saveSongTranslations,
  totalChars,
  type TranslationMap,
} from './translation-utils';

import {
  translateErrorMessage,
  type TranslateError,
  type TranslateResult,
} from '../translate';

const [translations, setTranslations] = createSignal<TranslationMap>({});

/** 화면에 보여 줄 번역 (없으면 undefined). 반응형이라 번역이 도착하면 자동으로 갱신된다 */
export const translationOf = (text: string): string | undefined =>
  translations()[normalizeLine(text)];

type TranslateIpc = (texts: string[]) => Promise<TranslateResult>;
let translateIpc: TranslateIpc | null = null;
export const setTranslateIpc = (fn: TranslateIpc) => {
  translateIpc = fn;
};

// 키 오류/한도 초과는 사용자가 뭔가 바꾸기 전까지 다시 요청하지 않는다 (한도를 헛되이 쓰지 않도록)
const FATAL_ERRORS: TranslateError[] = ['no-key', 'invalid-key', 'quota'];
let blockedBy: TranslateError | null = null;
let cooldownUntil = 0;
const lastToastAt = new Map<TranslateError, number>();
const inflight = new Set<string>();

export const resetTranslationBlock = () => {
  blockedBy = null;
  cooldownUntil = 0;
};

const reportError = (error: TranslateError) => {
  const now = Date.now();
  if (now - (lastToastAt.get(error) ?? 0) < 10 * 60 * 1000) return;
  lastToastAt.set(error, now);
  showToast(translateErrorMessage(error));
};

const ensureTranslations = async (
  videoId: string,
  lines: { text: string }[],
) => {
  const cached = loadSongTranslations(videoId);
  if (cached) {
    setTranslations(cached);
    return;
  }

  setTranslations({});
  const texts = pickTranslatableTexts(lines);
  if (texts.length === 0 || totalChars(texts) > MAX_TRANSLATE_CHARS) return;

  // 이미 한국어인 노래는 번역하지 않고(한도 절약), 다음에 다시 검사하지 않게 빈 결과를 저장한다
  if (detect(texts.join('\n')) === 'ko') {
    saveSongTranslations(videoId, {});
    return;
  }

  if (blockedBy) {
    reportError(blockedBy);
    return;
  }
  if (Date.now() < cooldownUntil || !translateIpc || inflight.has(videoId)) {
    return;
  }

  inflight.add(videoId);
  try {
    const result = await translateIpc(texts);
    if (!result.ok) {
      if (FATAL_ERRORS.includes(result.error)) blockedBy = result.error;
      else cooldownUntil = Date.now() + 30_000;
      reportError(result.error);
      return;
    }

    const map: TranslationMap = {};
    texts.forEach((text, index) => {
      map[text] = result.translations[index];
    });
    saveSongTranslations(videoId, map);

    // 번역하는 동안 곡이 바뀌었으면 화면에는 반영하지 않는다 (저장만 해 둔다)
    if (getSongInfo().videoId === videoId) setTranslations(map);
  } finally {
    inflight.delete(videoId);
  }
};

/** 번역이 켜져 있고 가사가 로드되면 번역을 준비한다 */
export const startTranslation = () => {
  runWithOwner(reactiveOwner, () => {
    createEffect(() => {
      const enabled = config()?.translateEnabled;
      const lines = currentLyrics()?.data?.lines;
      if (!enabled || !lines?.length) return;

      const videoId = untrack(() => getSongInfo().videoId);
      if (!videoId) return;

      ensureTranslations(videoId, lines).catch((error) => {
        console.error('[synced-lyrics] translation failed', error);
      });
    });
  });
};
