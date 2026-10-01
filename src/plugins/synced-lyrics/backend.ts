import { net } from 'electron';

import { createBackend } from '@/utils';

import { type FetchLike, translateTexts } from './translate';

import type { SyncedLyricsPluginConfig } from './types';

const handlers = {
  // Note: This will only be used for Forbidden headers, e.g. User-Agent, Authority, Cookie, etc.
  // See: https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header
  async fetch(
    url: string,
    init: RequestInit,
  ): Promise<[number, string, Record<string, string>]> {
    const res = await net.fetch(url, init);
    return [
      res.status,
      await res.text(),
      Object.fromEntries(res.headers.entries()),
    ];
  },
};

export const backend = createBackend<unknown, SyncedLyricsPluginConfig>({
  start(ctx) {
    ctx.ipc.handle('synced-lyrics:fetch', (url: string, init: RequestInit) =>
      handlers.fetch(url, init),
    );

    // DeepL 번역: API 키는 메인 프로세스에서만 읽고 화면(렌더러)에는 넘기지 않는다
    ctx.ipc.handle('synced-lyrics:translate', async (texts: string[]) => {
      const { deeplApiKey } = await ctx.getConfig();
      return translateTexts(deeplApiKey ?? '', texts, ((url, init) => net.fetch(url, init)) as FetchLike);
    });
  },
  stop(ctx) {
    ctx.ipc.removeHandler('synced-lyrics:fetch');
    ctx.ipc.removeHandler('synced-lyrics:translate');
  },
});
