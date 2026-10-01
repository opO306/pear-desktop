import { createRenderer } from '@/utils';
import { waitForElement } from '@/utils/wait-for-element';

import { mountTranslateButton } from './components/TranslateButton';
import { showToast, startHotkeys } from './hotkeys';
import { getOffsetMs, setOffsetVideoId } from './offset';
import { disposeReactiveRoot } from './reactive-root';
import { config, setConfig, setCurrentTime } from './renderer';
import { fetchLyrics } from './store';
import {
  resetTranslationBlock,
  setTranslateIpc,
  startTranslation,
} from './translation';
import { selectors, tabStates } from './utils';

import type { TranslateResult } from '../translate';
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
    unmountTranslateButton?: () => void;
    toggleTranslate?: () => Promise<void>;
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
            ((_ytAPI?.getCurrentTime() ?? 0) * 1000) - getOffsetMs(),
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

    setConfig(await ctx.getConfig());

    // 가사 번역: 번역은 메인 프로세스(DeepL)에서 하고, 화면에는 결과만 받는다
    setTranslateIpc(
      (texts) =>
        ctx.ipc.invoke('synced-lyrics:translate', texts) as Promise<TranslateResult>,
    );
    startTranslation();

    this.toggleTranslate = async () => {
      const current = config();
      if (!current) return;

      const next = !current.translateEnabled;
      setConfig({ ...current, translateEnabled: next });
      await ctx.setConfig({ translateEnabled: next });
      if (next) resetTranslationBlock();

      showToast(next ? '가사 번역 켜짐' : '가사 번역 꺼짐');
    };

    this.stopHotkeys?.();
    this.stopHotkeys = startHotkeys({
      onToggleTranslate: () => {
        this.toggleTranslate?.().catch((error) => console.error(error));
      },
    });

    this.unmountTranslateButton?.();
    mountTranslateButton(() => {
      this.toggleTranslate?.().catch((error) => console.error(error));
    })
      .then((dispose) => {
        this.unmountTranslateButton = dispose;
      })
      .catch((error) => console.error(error));

    ctx.ipc.on('peard:update-song-info', (info: SongInfo) => {
      fetchLyrics(info);
    });
  },

  stop() {
    this.stopHotkeys?.();
    this.unmountTranslateButton?.();
    document.getElementById(LYRICS_FONT_LINK_ID)?.remove();
    disposeReactiveRoot();
  },
});
