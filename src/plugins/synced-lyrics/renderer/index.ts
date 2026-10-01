import { createRenderer } from '@/utils';
import { waitForElement } from '@/utils/wait-for-element';

import { startHotkeys } from './hotkeys';
import { getOffsetMs, setOffsetVideoId } from './offset';
import { disposeReactiveRoot } from './reactive-root';
import { setConfig, setCurrentTime } from './renderer';
import { fetchLyrics } from './store';
import { selectors, tabStates } from './utils';

import type { SyncedLyricsPluginConfig } from '../types';
import type { SongInfo } from '@/providers/song-info';
import type { RendererContext } from '@/types/contexts';
import type { MusicPlayer } from '@/types/music-player';

const LYRICS_FONT_LINK_ID = 'synced-lyrics-font';
const LYRICS_FONT_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css';

// 플러그인 스타일은 CSSStyleSheet.replaceSync로 붙어서 @import가 무시되므로, 글꼴은 <link>로 불러온다
const loadLyricsFont = () => {
  if (document.getElementById(LYRICS_FONT_LINK_ID)) return;

  const link = Object.assign(document.createElement('link'), {
    id: LYRICS_FONT_LINK_ID,
    rel: 'stylesheet',
    href: LYRICS_FONT_URL,
  });
  document.head.appendChild(link);
};

export let _ytAPI: MusicPlayer | null = null;
export let netFetch: (
  url: string,
  init?: RequestInit,
) => Promise<[number, string, Record<string, string>]>;

export const renderer = createRenderer<
  {
    observerCallback: MutationCallback;
    observer?: MutationObserver;
    videoDataChange: () => Promise<void>;
    updateTimestampInterval?: NodeJS.Timeout | string | number;
    stopHotkeys?: () => void;
  },
  SyncedLyricsPluginConfig
>({
  onConfigChange(newConfig) {
    setConfig(newConfig);
  },

  observerCallback(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      const header = mutation.target as HTMLElement;

      switch (mutation.attributeName) {
        case 'disabled':
          header.removeAttribute('disabled');
          break;
        case 'aria-selected':
          tabStates[header.ariaSelected ?? 'false']();
          break;
      }
    }
  },

  async onPlayerApiReady(api: MusicPlayer) {
    _ytAPI = api;

    api.addEventListener('videodatachange', this.videoDataChange);

    await this.videoDataChange();
  },
  async videoDataChange() {
    setOffsetVideoId(_ytAPI?.getPlayerResponse()?.videoDetails?.videoId ?? '');

    if (!this.updateTimestampInterval) {
      this.updateTimestampInterval = setInterval(
        () =>
          setCurrentTime(
            (_ytAPI?.getCurrentTime() ?? 0) * 1000 - getOffsetMs(),
          ),
        100,
      );
    }

    // prettier-ignore
    this.observer ??= new MutationObserver(this.observerCallback);
    this.observer.disconnect();

    // Force the lyrics tab to be enabled at all times.
    const header = await waitForElement<HTMLElement>(selectors.head);
    {
      header.removeAttribute('disabled');
      tabStates[header.ariaSelected ?? 'false']();
    }

    this.observer.observe(header, { attributes: true });
    header.removeAttribute('disabled');
  },

  async start(ctx: RendererContext<SyncedLyricsPluginConfig>) {
    netFetch = ctx.ipc.invoke.bind(ctx.ipc, 'synced-lyrics:fetch');

    loadLyricsFont();
    this.stopHotkeys?.();
    this.stopHotkeys = startHotkeys();

    setConfig(await ctx.getConfig());

    ctx.ipc.on('peard:update-song-info', (info: SongInfo) => {
      fetchLyrics(info);
    });
  },

  stop() {
    this.stopHotkeys?.();
    document.getElementById(LYRICS_FONT_LINK_ID)?.remove();
    disposeReactiveRoot();
  },
});
