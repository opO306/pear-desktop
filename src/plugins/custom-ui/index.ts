import { FastAverageColor } from 'fast-average-color';

import { createPlugin } from '@/utils';

import style from './style.css?inline';

const fastAverageColor = new FastAverageColor();

const DEFAULT_COLOR = {
    r: 110,
    g: 85,
    b: 220,
};

const clamp = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)));

const normalizeColor = (r: number, g: number, b: number) => {
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness < 55) {
        const scale = 55 / Math.max(brightness, 1);

        return {
            r: clamp(r * scale),
            g: clamp(g * scale),
            b: clamp(b * scale),
        };
    }

    if (brightness > 210) {
        const scale = 210 / brightness;

        return {
            r: clamp(r * scale),
            g: clamp(g * scale),
            b: clamp(b * scale),
        };
    }

    return {
        r: clamp(r),
        g: clamp(g),
        b: clamp(b),
    };
};

const applyColor = (r: number, g: number, b: number) => {
    const color = normalizeColor(r, g, b);

    const dark = {
        r: clamp(color.r * 0.22),
        g: clamp(color.g * 0.22),
        b: clamp(color.b * 0.22),
    };

    const root = document.documentElement;

    root.style.setProperty(
        '--pear-accent-rgb',
        `${color.r}, ${color.g}, ${color.b}`,
    );

    root.style.setProperty(
        '--pear-dark-rgb',
        `${dark.r}, ${dark.g}, ${dark.b}`,
    );

    console.log(
        `[Pear Custom UI] accent rgb(${color.r}, ${color.g}, ${color.b})`,
    );
};

export default createPlugin({
    name: () => 'Custom UI',
    description: () => 'Dynamic album color theme',
    restartNeeded: false,

    config: {
        enabled: true,
    },

    stylesheets: [style],

    renderer: {
        lastThumbnailUrl: '',
        listener: null as ((event: Event) => void) | null,

        async onPlayerApiReady(playerApi) {
            const updateTheme = async () => {
                const response = playerApi.getPlayerResponse();

                const thumbnails =
                    response?.videoDetails?.thumbnail?.thumbnails;

                const thumbnail =
                    thumbnails?.at(-1) ??
                    thumbnails?.at(0);

                if (!thumbnail?.url) {
                    applyColor(
                        DEFAULT_COLOR.r,
                        DEFAULT_COLOR.g,
                        DEFAULT_COLOR.b,
                    );

                    return;
                }

                if (thumbnail.url === this.lastThumbnailUrl) {
                    return;
                }

                this.lastThumbnailUrl = thumbnail.url;

                try {
                    const result =
                        await fastAverageColor.getColorAsync(thumbnail.url);

                    const [r, g, b] = result.value;

                    console.log(
                        '[Pear Custom UI] album:',
                        result.hex,
                    );

                    applyColor(r, g, b);
                } catch (error) {
                    console.error(
                        '[Pear Custom UI] color extraction failed',
                        error,
                    );

                    applyColor(
                        DEFAULT_COLOR.r,
                        DEFAULT_COLOR.g,
                        DEFAULT_COLOR.b,
                    );
                }
            };

            this.listener = (event: Event) => {
                const detail = (
                    event as CustomEvent<{ name?: string }>
                ).detail;

                if (
                    detail?.name &&
                    detail.name !== 'dataloaded'
                ) {
                    return;
                }

                void updateTheme();
            };

            document.addEventListener(
                'videodatachange',
                this.listener,
            );

            await updateTheme();
        },

        stop() {
            if (this.listener) {
                document.removeEventListener(
                    'videodatachange',
                    this.listener,
                );
            }

            this.listener = null;
        },
    },
});