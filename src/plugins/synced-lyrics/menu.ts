import prompt from 'custom-electron-prompt';
import { dialog, net, type MenuItemConstructorOptions } from 'electron';

import { t } from '@/i18n';
import promptOptions from '@/providers/prompt-options';

import { providerNames } from './providers';
import {
  type FetchLike,
  fetchUsage,
  translateErrorMessage,
} from './translate';

import type { SyncedLyricsPluginConfig } from './types';
import type { MenuContext } from '@/types/contexts';

export const menu = async (
  ctx: MenuContext<SyncedLyricsPluginConfig>,
): Promise<MenuItemConstructorOptions[]> => {
  const config = await ctx.getConfig();

  return [
    {
      label: t('plugins.synced-lyrics.menu.preferred-provider.label'),
      toolTip: t('plugins.synced-lyrics.menu.preferred-provider.tooltip'),
      type: 'submenu',
      submenu: [
        {
          label: t('plugins.synced-lyrics.menu.preferred-provider.none.label'),
          toolTip: t(
            'plugins.synced-lyrics.menu.preferred-provider.none.tooltip',
          ),
          type: 'radio',
          checked: config.preferredProvider === undefined,
          click() {
            ctx.setConfig({ preferredProvider: undefined });
          },
        },
        ...providerNames.map(
          (provider) =>
            ({
              label: provider,
              type: 'radio',
              checked: config.preferredProvider === provider,
              click() {
                ctx.setConfig({ preferredProvider: provider });
              },
            }) as const,
        ),
      ],
    },
    {
      label: t('plugins.synced-lyrics.menu.precise-timing.label'),
      toolTip: t('plugins.synced-lyrics.menu.precise-timing.tooltip'),
      type: 'checkbox',
      checked: config.preciseTiming,
      click(item) {
        ctx.setConfig({
          preciseTiming: item.checked,
        });
      },
    },
    {
      label: t('plugins.synced-lyrics.menu.line-effect.label'),
      toolTip: t('plugins.synced-lyrics.menu.line-effect.tooltip'),
      type: 'submenu',
      submenu: [
        {
          label: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.fancy.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.fancy.tooltip',
          ),
          type: 'radio',
          checked: config.lineEffect === 'fancy',
          click() {
            ctx.setConfig({
              lineEffect: 'fancy',
            });
          },
        },
        {
          label: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.scale.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.scale.tooltip',
          ),
          type: 'radio',
          checked: config.lineEffect === 'scale',
          click() {
            ctx.setConfig({
              lineEffect: 'scale',
            });
          },
        },
        {
          label: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.offset.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.offset.tooltip',
          ),
          type: 'radio',
          checked: config.lineEffect === 'offset',
          click() {
            ctx.setConfig({
              lineEffect: 'offset',
            });
          },
        },
        {
          label: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.focus.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.line-effect.submenu.focus.tooltip',
          ),
          type: 'radio',
          checked: config.lineEffect === 'focus',
          click() {
            ctx.setConfig({
              lineEffect: 'focus',
            });
          },
        },
      ],
    },
    {
      label: t('plugins.synced-lyrics.menu.default-text-string.label'),
      toolTip: t('plugins.synced-lyrics.menu.default-text-string.tooltip'),
      type: 'submenu',
      submenu: [
        { label: '♪', value: '♪' },
        { label: '" "', value: ' ' },
        { label: '...', value: ['.', '..', '...'] },
        { label: '•••', value: ['•', '••', '•••'] },
        { label: '———', value: '———' },
      ].map(({ label, value }) => ({
        label,
        type: 'radio',
        checked:
          typeof value === 'string'
            ? config.defaultTextString === value
            : JSON.stringify(config.defaultTextString) ===
              JSON.stringify(value),
        click() {
          ctx.setConfig({ defaultTextString: value });
        },
      })),
    },
    {
      label: t('plugins.synced-lyrics.menu.romanization.label'),
      toolTip: t('plugins.synced-lyrics.menu.romanization.tooltip'),
      type: 'checkbox',
      checked: config.romanization,
      click(item) {
        ctx.setConfig({
          romanization: item.checked,
        });
      },
    },
    {
      label: t('plugins.synced-lyrics.menu.convert-chinese-character.label'),
      toolTip: t(
        'plugins.synced-lyrics.menu.convert-chinese-character.tooltip',
      ),
      type: 'submenu',
      submenu: [
        {
          label: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.disabled.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.disabled.tooltip',
          ),
          type: 'radio',
          checked:
            config.convertChineseCharacter === 'disabled' ||
            config.convertChineseCharacter === undefined,
          click() {
            ctx.setConfig({
              convertChineseCharacter: 'disabled',
            });
          },
        },
        {
          label: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.simplified-to-traditional.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.simplified-to-traditional.tooltip',
          ),
          type: 'radio',
          checked: config.convertChineseCharacter === 'simplifiedToTraditional',
          click() {
            ctx.setConfig({
              convertChineseCharacter: 'simplifiedToTraditional',
            });
          },
        },
        {
          label: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.traditional-to-simplified.label',
          ),
          toolTip: t(
            'plugins.synced-lyrics.menu.convert-chinese-character.submenu.traditional-to-simplified.tooltip',
          ),
          type: 'radio',
          checked: config.convertChineseCharacter === 'traditionalToSimplified',
          click() {
            ctx.setConfig({
              convertChineseCharacter: 'traditionalToSimplified',
            });
          },
        },
      ],
    },
    {
      label: t('plugins.synced-lyrics.menu.show-time-codes.label'),
      toolTip: t('plugins.synced-lyrics.menu.show-time-codes.tooltip'),
      type: 'checkbox',
      checked: config.showTimeCodes,
      click(item) {
        ctx.setConfig({
          showTimeCodes: item.checked,
        });
      },
    },
    {
      label: t('plugins.synced-lyrics.menu.show-lyrics-even-if-inexact.label'),
      toolTip: t(
        'plugins.synced-lyrics.menu.show-lyrics-even-if-inexact.tooltip',
      ),
      type: 'checkbox',
      checked: config.showLyricsEvenIfInexact,
      click(item) {
        ctx.setConfig({
          showLyricsEvenIfInexact: item.checked,
        });
      },
    },
    {
      label: '가사 번역 (DeepL)',
      type: 'submenu',
      submenu: [
        {
          label: '번역 켜기 (플레이어 바의 번역 버튼 / T 키)',
          type: 'checkbox',
          checked: config.translateEnabled,
          click(item) {
            ctx.setConfig({ translateEnabled: item.checked });
          },
        },
        {
          label: 'DeepL API 키 입력...',
          async click() {
            const current = await ctx.getConfig();
            const value = await prompt(
              {
                title: 'DeepL API 키',
                label: 'DeepL API 키를 붙여 넣으세요 (무료 키는 ":fx"로 끝나요)',
                value: current.deeplApiKey ?? '',
                type: 'input',
                inputAttrs: { type: 'text' },
                ...promptOptions(),
              },
              ctx.window,
            );

            // 취소하면 null이라 아무것도 바꾸지 않는다
            if (typeof value === 'string') {
              ctx.setConfig({ deeplApiKey: value.trim() });
            }
          },
        },
        {
          label: '남은 번역 한도 확인',
          async click() {
            const { deeplApiKey } = await ctx.getConfig();
            const usage = await fetchUsage(deeplApiKey ?? '', ((url, init) => net.fetch(url, init)) as FetchLike);

            await dialog.showMessageBox(ctx.window, {
              type: 'info',
              title: 'DeepL 번역 한도',
              message: usage.ok
                ? `이번 달 ${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} 글자 사용`
                : translateErrorMessage(usage.error),
              detail: usage.ok
                ? `남은 글자: ${(usage.limit - usage.used).toLocaleString()} (노래 한 곡은 보통 1,500~3,000자)`
                : undefined,
            });
          },
        },
      ],
    },
  ];
};
