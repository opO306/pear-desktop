/**
 * DeepL 번역 (메인 프로세스용). 외부 통신 함수를 주입받아서 테스트할 수 있게 했다.
 * 무료 키(끝이 ":fx")는 api-free.deepl.com, 유료 키는 api.deepl.com을 쓴다.
 */
export type TranslateError =
  | 'no-key'
  | 'invalid-key'
  | 'quota'
  | 'rate-limit'
  | 'network';

export type TranslateResult =
  | { ok: true; translations: string[] }
  | { ok: false; error: TranslateError };

export type UsageResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; error: TranslateError };

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

const MAX_TEXTS_PER_REQUEST = 50;
const MAX_CHARS_PER_REQUEST = 20_000;

export const deeplBaseUrl = (apiKey: string) =>
  apiKey.trim().endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';

const statusToError = (status: number): TranslateError | null => {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return 'invalid-key';
  if (status === 456) return 'quota';
  if (status === 429 || status === 529) return 'rate-limit';
  return 'network';
};

const headersFor = (apiKey: string) => ({
  'Authorization': `DeepL-Auth-Key ${apiKey.trim()}`,
  'Content-Type': 'application/json',
});

/** 한 번에 너무 많이 보내지 않도록 개수와 글자 수로 나눈다 */
export const chunkTexts = (texts: string[]) => {
  const chunks: string[][] = [];
  let current: string[] = [];
  let chars = 0;

  for (const text of texts) {
    if (
      current.length >= MAX_TEXTS_PER_REQUEST ||
      (current.length > 0 && chars + text.length > MAX_CHARS_PER_REQUEST)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
};

export const translateTexts = async (
  apiKey: string,
  texts: string[],
  fetchImpl: FetchLike,
  options: { target?: string; baseUrl?: string } = {},
): Promise<TranslateResult> => {
  if (!apiKey.trim()) return { ok: false, error: 'no-key' };

  const baseUrl = options.baseUrl ?? deeplBaseUrl(apiKey);
  const translations: string[] = [];

  for (const chunk of chunkTexts(texts)) {
    try {
      const res = await fetchImpl(`${baseUrl}/v2/translate`, {
        method: 'POST',
        headers: headersFor(apiKey),
        body: JSON.stringify({
          text: chunk,
          target_lang: options.target ?? 'KO',
          split_sentences: '0',
          preserve_formatting: true,
        }),
      });

      const error = statusToError(res.status);
      if (error) return { ok: false, error };

      const json = JSON.parse(await res.text()) as {
        translations?: { text: string }[];
      };
      if (json.translations?.length !== chunk.length) {
        return { ok: false, error: 'network' };
      }
      translations.push(...json.translations.map((it) => it.text));
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  return { ok: true, translations };
};

export const fetchUsage = async (
  apiKey: string,
  fetchImpl: FetchLike,
  options: { baseUrl?: string } = {},
): Promise<UsageResult> => {
  if (!apiKey.trim()) return { ok: false, error: 'no-key' };

  try {
    const res = await fetchImpl(
      `${options.baseUrl ?? deeplBaseUrl(apiKey)}/v2/usage`,
      { method: 'GET', headers: headersFor(apiKey) },
    );
    const error = statusToError(res.status);
    if (error) return { ok: false, error };

    const json = JSON.parse(await res.text()) as {
      character_count: number;
      character_limit: number;
    };
    return { ok: true, used: json.character_count, limit: json.character_limit };
  } catch {
    return { ok: false, error: 'network' };
  }
};

export const translateErrorMessage = (error: TranslateError) =>
  ({
    'no-key': 'DeepL API 키가 없어요 (확장 > synced-lyrics > 가사 번역에서 입력)',
    'invalid-key': 'DeepL API 키가 올바르지 않아요',
    'quota': 'DeepL 이번 달 무료 한도를 다 썼어요',
    'rate-limit': '번역 요청이 너무 많아요. 잠시 후 다시 시도할게요',
    'network': '번역 서버에 연결하지 못했어요',
  })[error];
