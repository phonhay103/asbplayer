import { asbError } from '@project/common/util';
import type { LocalizationConfig } from '@project/extension/src/services/extension-config';
import { fetchExtensionConfig } from '@project/extension/src/services/extension-config';
import { SettingsProvider, supportedLanguages as defaultSupportedLanguages } from '@project/common/settings';
import { ExtensionSettingsStorage } from '@project/extension/src/services/extension-settings-storage';
import type { PublicPath } from 'wxt/browser';

const stringsKeyForLang = (lang: string) => `locStrings-${lang}`;
const versionKeyForLang = (lang: string) => `locVersion-${lang}`;
const settings = new SettingsProvider(new ExtensionSettingsStorage());

export interface Localization {
    lang: string;
    strings: any;
}

export const fetchLocalization = async (lang: string): Promise<Localization> => {
    if (import.meta.env.MODE === 'development') {
        return (await bundledStringsForLang(lang)) ?? (await bundledStringsForLang('en'))!;
    }

    const bundled = (await bundledStringsForLang(lang)) ?? (await bundledStringsForLang('en'))!;
    const cached = await cachedStringsForLang(lang);

    if (cached === undefined) {
        return bundled;
    }

    // Merge cached strings over bundled ones so newly added keys always resolve,
    // even when the cached copy predates them.
    return { lang: bundled.lang, strings: mergeStrings(bundled.strings, cached.strings) };
};

export const fetchSupportedLanguages = async (): Promise<string[]> => {
    const config = await fetchExtensionConfig();

    if (config === undefined) {
        return defaultSupportedLanguages;
    }

    return config.languages.map((c) => c.code);
};

export const primeLocalization = async (lang: string): Promise<void> => {
    try {
        const config = await fetchExtensionConfig();

        if (config === undefined) {
            return;
        }

        const langConfig =
            config.languages.find((c) => c.code === lang) ??
            (await fetchExtensionConfig(true))?.languages.find((c) => c.code === lang);

        if (langConfig === undefined) {
            return;
        }

        const versionKey = versionKeyForLang(lang);
        const result = await browser.storage.local.get(versionKey);
        const version = result ? (result[versionKey] as number | undefined) : undefined;

        if (version === undefined || version < langConfig.version) {
            await fetchAndCache(langConfig);
        }
    } catch (e) {
        asbError('i18n', e);
    }
};

const fetchAndCache = async ({ code, url, version }: LocalizationConfig): Promise<void> => {
    const asbplayerUrl = await settings.getSingle('streamingAppUrl');
    const effectiveUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `${asbplayerUrl}/${url}`;
    try {
        const strings = await (await fetch(effectiveUrl)).json();

        if (typeof strings === 'object') {
            const versionKey = versionKeyForLang(code);
            const stringsKey = stringsKeyForLang(code);
            await browser.storage.local.set({ [stringsKey]: strings, [versionKey]: version });
        }
    } catch (e) {
        asbError('i18n', e);
    }
};

const bundledStringsForLang = async (lang: string): Promise<Localization | undefined> => {
    for (const defaultLang of defaultSupportedLanguages) {
        if (lang === defaultLang) {
            return {
                lang,
                strings: await (
                    await fetch(browser.runtime.getURL(`/asbplayer-locales/${lang}.json` as PublicPath))
                ).json(),
            };
        }
    }

    return undefined;
};

const cachedStringsForLang = async (lang: string): Promise<Localization | undefined> => {
    const stringsKey = stringsKeyForLang(lang);
    const result = await browser.storage.local.get(stringsKey);
    const strings = result ? result[stringsKey] : undefined;

    if (strings === undefined) {
        return undefined;
    }

    return { lang, strings };
};

const isPlainObject = (value: unknown): value is { [key: string]: unknown } =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeStrings = (base: unknown, override: unknown): unknown => {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override === undefined ? base : override;
    }

    const merged: { [key: string]: unknown } = { ...base };

    for (const key of Object.keys(override)) {
        merged[key] = key in merged ? mergeStrings(merged[key], override[key]) : override[key];
    }

    return merged;
};
