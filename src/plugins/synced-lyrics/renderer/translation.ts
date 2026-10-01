import { createEffect, createSignal, runWithOwner, untrack } from 'solid-js';
import { detect } from 'tinyld';

import { getSongInfo } from '@/providers/song-info-front';

import { showToast } from './hotkeys';
import { reactiveOwner } from './reactive-root';
import { config } from './renderer';
import { currentLyrics } from './store';
import { createTranslationQueue } from './translation-core';
import {
  loadSongTranslations,
  normalizeLine,
  saveSongTranslations,
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

const queue = createTranslationQueue({
  load: loadSongTranslations,
  save: saveSongTranslations,
  translate: async (texts) =>
    translateIpc
      ? translateIpc(texts)
      : { ok: false, error: 'network' as const },
  detectLanguage: detect,
});

export const resetTranslationBlock = () => queue.reset();

const lastToastAt = new Map<TranslateError, number>();
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
  const { map, error } = await queue.ensure(videoId, lines);

  // 번역하는 동안 곡이 바뀌었으면 화면에는 반영하지 않는다 (저장만 해 둔다)
  if (getSongInfo().videoId === videoId) setTranslations(map);
  if (error) reportError(error);
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
