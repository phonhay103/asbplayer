import type { CopyHistoryItem } from '@project/common';

export type MiningExportFormat = 'csv' | 'tsv' | 'json' | 'txt';

export type MiningExportRange = 'all' | 'today' | 'last7Days' | 'unexported';

export interface MiningExportOptions {
    format: MiningExportFormat;
    // Inclusive bounds on CopyHistoryItem.timestamp (epoch ms). Undefined means unbounded.
    fromMs?: number;
    toMs?: number;
    // When true, only items with timestamp > lastExportedAt are exported.
    onlyUnexported?: boolean;
    lastExportedAt?: number;
}

export interface MiningExportResult {
    content: string;
    mimeType: string;
    extension: string;
    exportedCount: number;
    // Max timestamp among exported items, for advancing the "last exported" marker.
    maxTimestamp?: number;
}

const BOM = '\\ufeff';

const columns = [
    'id',
    'mined_at_iso',
    'subtitle_file',
    'start_ms',
    'end_ms',
    'text',
    'word',
    'definition',
    'surrounding_text',
    'url',
    'custom_fields',
] as const;

type Row = { [key in (typeof columns)[number]]: string };

const formatCustomFields = (item: CopyHistoryItem): string => {
    const entries = Object.entries(item.customFieldValues ?? {});
    return entries.map(([key, value]) => `${key}=${value}`).join('; ');
};

const toRow = (item: CopyHistoryItem): Row => ({
    id: item.id,
    mined_at_iso: new Date(item.timestamp).toISOString(),
    subtitle_file: item.subtitleFileName ?? '',
    start_ms: String(item.subtitle?.start ?? ''),
    end_ms: String(item.subtitle?.end ?? ''),
    text: item.text ?? item.subtitle?.text ?? '',
    word: item.word ?? '',
    definition: item.definition ?? '',
    surrounding_text: (item.surroundingSubtitles ?? []).map((s) => s.text).join('\n'),
    url: item.url ?? '',
    custom_fields: formatCustomFields(item),
});

const escapeCsvField = (value: string): string => {
    if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replaceAll('"', '""')}"`;
    }
    return value;
};

const escapeTsvField = (value: string): string => {
    if (value.includes('"') || value.includes('\t') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replaceAll('"', '""')}"`;
    }
    return value;
};

const toCsv = (rows: Row[]): string =>
    [columns.join(','), ...rows.map((row) => columns.map((c) => escapeCsvField(row[c])).join(','))].join('\r\n') +
    '\r\n';

const toTsv = (rows: Row[]): string =>
    [columns.join('\t'), ...rows.map((row) => columns.map((c) => escapeTsvField(row[c])).join('\t'))].join('\n') + '\n';

const toJson = (rows: Row[]): string => JSON.stringify(rows, null, 2) + '\n';

const toTxt = (items: CopyHistoryItem[]): string =>
    items
        .map((item) => {
            const text = item.text ?? item.subtitle?.text ?? '';
            const detail = [item.word, item.definition].filter((part) => part).join(' — ');
            return detail ? `${text} | ${detail}` : text;
        })
        .join('\n') + '\n';

export const filterByTimeRange = (items: CopyHistoryItem[], fromMs?: number, toMs?: number): CopyHistoryItem[] =>
    items.filter(
        (item) => (fromMs === undefined || item.timestamp >= fromMs) && (toMs === undefined || item.timestamp <= toMs)
    );

export const filterUnexported = (items: CopyHistoryItem[], lastExportedAt?: number): CopyHistoryItem[] =>
    lastExportedAt === undefined ? [...items] : items.filter((item) => item.timestamp > lastExportedAt);

export const startOfToday = (now = Date.now()): number => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

export const startOfDayNDaysAgo = (days: number, now = Date.now()): number =>
    startOfToday(now) - days * 24 * 60 * 60 * 1000;

const mimeTypes: { [format in MiningExportFormat]: string } = {
    csv: 'text/csv;charset=utf-8',
    tsv: 'text/tab-separated-values;charset=utf-8',
    json: 'application/json;charset=utf-8',
    txt: 'text/plain;charset=utf-8',
};

export const exportMiningHistory = (items: CopyHistoryItem[], options: MiningExportOptions): MiningExportResult => {
    let filtered = options.onlyUnexported
        ? filterUnexported(items, options.lastExportedAt)
        : filterByTimeRange(items, options.fromMs, options.toMs);
    filtered = [...filtered].sort((a, b) => a.timestamp - b.timestamp);

    const rows = filtered.map(toRow);
    let content: string;

    switch (options.format) {
        case 'csv':
            content = BOM + toCsv(rows);
            break;
        case 'tsv':
            content = BOM + toTsv(rows);
            break;
        case 'json':
            content = toJson(rows);
            break;
        case 'txt':
            content = BOM + toTxt(filtered);
            break;
    }

    return {
        content,
        mimeType: mimeTypes[options.format],
        extension: options.format,
        exportedCount: filtered.length,
        maxTimestamp: filtered.length === 0 ? undefined : filtered[filtered.length - 1].timestamp,
    };
};

const pad = (value: number): string => String(value).padStart(2, '0');

export const miningExportFileName = (
    format: MiningExportFormat,
    scope: 'all' | 'section',
    range: MiningExportRange,
    now = new Date()
): string => {
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
        now.getMinutes()
    )}`;
    const scopeSuffix = scope === 'section' ? '-per-file' : '';
    const rangeSuffix = range === 'all' ? '' : `-${range}`;
    return `asbplayer-mining-${stamp}${scopeSuffix}${rangeSuffix}.${format}`;
};
