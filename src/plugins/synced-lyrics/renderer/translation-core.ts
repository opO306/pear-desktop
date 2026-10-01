import {
  MAX_TRANSLATE_CHARS,
  pickTranslatableTexts,
  totalChars,
  type TranslationMap,
} from './translation-utils';

import type { TranslateError, TranslateResult } from '../translate';

export type TranslationDeps = {
  load: (videoId: string) => TranslationMap | null;
  save: (videoId: string, map: TranslationMap) => void;
  translate: (texts: string[]) => Promise<TranslateResult>;
  detectLanguage: (text: string) => string;
  now?: () => number;
};

export type TranslationOutcome = {
  /** 지금까지 번역된 줄 전체 (화면에 보여 줄 것) */
  map: TranslationMap;
  error?: TranslateError;
};

// 키 오류/한도 초과는 사용자가 뭔가 바꾸기 전까지 다시 요청하지 않는다 (한도를 헛되이 쓰지 않도록)
const FATAL_ERRORS: TranslateError[] = ['no-key', 'invalid-key', 'quota'];
const COOLDOWN_MS = 30_000;

/**
 * 곡 하나의 번역을 "빠진 줄만" 채운다.
 *  - 저장된 번역이 있어도, 지금 보이는 가사에 없는 줄(가사 제공처가 바뀌어 문장이 조금 다른 경우 등)은 다시 번역해서 합친다
 *  - 같은 곡의 요청은 한 줄로 세워서(순서대로) 처리한다. 진행 중에 다른 가사가 들어와도 버리지 않는다
 */
export const createTranslationQueue = (deps: TranslationDeps) => {
  const now = deps.now ?? Date.now;
  const chains = new Map<string, Promise<unknown>>();
  let blockedBy: TranslateError | null = null;
  let cooldownUntil = 0;

  const run = async (
    videoId: string,
    lines: { text: string }[],
  ): Promise<TranslationOutcome> => {
    const cached = deps.load(videoId) ?? {};
    const texts = pickTranslatableTexts(lines);
    const missing = texts.filter((text) => !Object.hasOwn(cached, text));

    if (missing.length === 0) return { map: cached };
    if (totalChars(texts) > MAX_TRANSLATE_CHARS) return { map: cached };

    // 이미 한국어인 노래는 번역하지 않는다 (한도 절약)
    if (deps.detectLanguage(texts.join('\n')) === 'ko') return { map: cached };

    if (blockedBy) return { map: cached, error: blockedBy };
    if (now() < cooldownUntil) return { map: cached };

    const result = await deps.translate(missing);
    if (!result.ok) {
      if (FATAL_ERRORS.includes(result.error)) blockedBy = result.error;
      else cooldownUntil = now() + COOLDOWN_MS;
      return { map: cached, error: result.error };
    }

    const merged: TranslationMap = { ...cached };
    missing.forEach((text, index) => {
      merged[text] = result.translations[index];
    });
    deps.save(videoId, merged);
    return { map: merged };
  };

  return {
    ensure(
      videoId: string,
      lines: { text: string }[],
    ): Promise<TranslationOutcome> {
      const previous = chains.get(videoId) ?? Promise.resolve();
      const job = previous.catch(() => undefined).then(() => run(videoId, lines));

      chains.set(videoId, job);
      const cleanup = () => {
        if (chains.get(videoId) === job) chains.delete(videoId);
      };
      job.then(cleanup, cleanup);

      return job;
    },
    reset() {
      blockedBy = null;
      cooldownUntil = 0;
    },
  };
};
