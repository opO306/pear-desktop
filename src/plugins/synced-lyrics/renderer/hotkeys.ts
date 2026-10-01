import { changeOffsetMs } from './offset';
import { selectors } from './utils';

const OFFSET_STEP_MS = 500;
const LYRICS_ONLY_CLASS = 'pear-lyrics-only';
const SIDEBAR_HIDDEN_CLASS = 'pear-sidebar-hidden';
const SIDEBAR_STORAGE_KEY = 'synced-lyrics:sidebar-hidden';
const TOAST_ID = 'pear-lyrics-toast';
const TOAST_DURATION = 1500;

let toastTimer: number | undefined;

export const showToast = (text: string) => {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = Object.assign(document.createElement('div'), {
      id: TOAST_ID,
      className: 'pear-lyrics-toast',
    });
    document.body.appendChild(el);
  }

  el.textContent = text;
  el.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => el.classList.remove('visible'),
    TOAST_DURATION,
  );
};

const describeOffset = (ms: number) =>
  ms === 0
    ? '가사 싱크: 원래대로'
    : `가사 싱크: ${(Math.abs(ms) / 1000).toFixed(1)}초 ${ms > 0 ? '늦게' : '일찍'}`;

const isTyping = (target: EventTarget | undefined) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

const readSidebarHidden = () => {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

/** 왼쪽 사이드바(홈/둘러보기/보관함)를 숨기고 가사 영역을 넓히거나, 원래대로 되돌린다. 선택은 저장돼서 재시작해도 유지된다 */
const toggleSidebar = () => {
  const hidden = !document.body.classList.contains(SIDEBAR_HIDDEN_CLASS);
  document.body.classList.toggle(SIDEBAR_HIDDEN_CLASS, hidden);

  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, hidden ? '1' : '0');
  } catch {
    // 저장 실패해도 이번 실행에서는 유지된다
  }

  showToast(
    hidden ? '사이드바 숨김 + 가사 넓게 (Alt+S로 되돌리기)' : '사이드바 표시',
  );
};

/** 최대 tries번(100ms 간격) 기다린다. 끝까지 없으면 null (무한히 돌지 않는다) */
const waitFor = async <T extends Element>(selector: string, tries = 30) => {
  for (let i = 0; i < tries; i++) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
};

const toggleLyricsOnly = async () => {
  const enable = !document.body.classList.contains(LYRICS_ONLY_CLASS);
  document.body.classList.toggle(LYRICS_ONLY_CLASS, enable);

  if (!enable) {
    showToast('가사 전용 모드 해제');
    return;
  }

  // 플레이어 페이지를 열고 가사 탭을 선택한다
  const layout = document.querySelector('ytmusic-app-layout');
  if (layout && !layout.hasAttribute('player-page-open')) {
    document.querySelector<HTMLElement>('.toggle-player-page-button')?.click();
  }

  const lyricsTab = await waitFor<HTMLElement>(selectors.head);
  if (lyricsTab && lyricsTab.getAttribute('aria-selected') !== 'true') {
    lyricsTab.click();
  }

  showToast('가사 전용 모드 (Alt+L로 해제)');
};

/**
 * 단축키
 *  - [ / ] : 가사를 0.5초 일찍 / 늦게,  \ : 싱크 초기화 (곡별로 저장됨)
 *  - Alt+L : 가사 전용 모드 켜기/끄기
 *  - Alt+S : 왼쪽 사이드바 숨기기/보이기 (가사 줄이 덜 줄바꿈되게 공간 확보)
 *  - T : 가사 번역 켜기/끄기
 */
export const startHotkeys = (options: { onToggleTranslate: () => void }) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    if (isTyping(event.composedPath()[0])) return;

    if (event.altKey) {
      if (event.code === 'KeyL') {
        event.preventDefault();
        toggleLyricsOnly().catch((error) => console.error(error));
      } else if (event.code === 'KeyS') {
        event.preventDefault();
        toggleSidebar();
      }
      return;
    }

    let result: number | null | undefined;
    switch (event.key) {
      case '[':
        result = changeOffsetMs(-OFFSET_STEP_MS);
        break;
      case ']':
        result = changeOffsetMs(OFFSET_STEP_MS);
        break;
      case '\\':
        result = changeOffsetMs(null);
        break;
      case 't':
      case 'T':
        options.onToggleTranslate();
        return;
      default:
        return;
    }

    if (result !== null) showToast(describeOffset(result));
  };

  document.addEventListener('keydown', onKeyDown, true);

  document.body.classList.toggle(SIDEBAR_HIDDEN_CLASS, readSidebarHidden());

  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    window.clearTimeout(toastTimer);
    document.getElementById(TOAST_ID)?.remove();
    document.body.classList.remove(LYRICS_ONLY_CLASS, SIDEBAR_HIDDEN_CLASS);
  };
};
