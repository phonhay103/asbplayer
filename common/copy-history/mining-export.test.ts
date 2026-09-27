import type { CopyHistoryItem } from '@project/common';
import {
    exportMiningHistory,
    filterByTimeRange,
    filterUnexported,
    miningExportFileName,
    startOfDayNDaysAgo,
    startOfToday,
} from '@project/common/copy-history/mining-export';
import { expect, it } from '@jest/globals';

const makeItem = (overrides: Partial<CopyHistoryItem> = {}): CopyHistoryItem => ({
    id: 'id',
    timestamp: 1700000000000,
    subtitle: { text: 'sentence', start: 1000, end: 2000, originalStart: 1000, originalEnd: 2000, track: 0 },
    surroundingSubtitles: [],
    subtitleFileName: 'file.srt',
    mediaTimestamp: 1500,
    ...overrides,
});

it('exports csv with header and word/definition columns', () => {
    const result = exportMiningHistory(
        [makeItem({ id: 'a', word: 'word', definition: 'meaning', url: 'http://example.com' })],
        { format: 'csv' }
    );
    expect(result.mimeType).toContain('text/csv');
    expect(result.extension).toEqual('csv');
    expect(result.exportedCount).toEqual(1);
    expect(result.maxTimestamp).toEqual(1700000000000);
    const lines = result.content.replace('\\ufeff', '').split('\r\n');
    expect(lines[0]).toEqual(
        'id,mined_at_iso,subtitle_file,start_ms,end_ms,text,word,definition,surrounding_text,url,custom_fields'
    );
    expect(lines[1]).toContain(',word,meaning,');
    expect(lines[1]).toContain('http://example.com');
});

it('quotes csv fields containing commas, quotes and newlines', () => {
    const result = exportMiningHistory(
        [makeItem({ subtitle: { text: 'a, "b"\nc', start: 0, end: 1, originalStart: 0, originalEnd: 1, track: 0 } })],
        { format: 'csv' }
    );
    expect(result.content).toContain('"a, ""b""\nc"');
});

it('quotes tsv fields containing tabs and newlines', () => {
    const result = exportMiningHistory(
        [makeItem({ subtitle: { text: 'a\tb\nc', start: 0, end: 1, originalStart: 0, originalEnd: 1, track: 0 } })],
        { format: 'tsv' }
    );
    expect(result.content).toContain('"a\tb\nc"');
});

it('exports json rows and txt lines', () => {
    const items = [makeItem({ id: 'a', word: 'w', definition: 'd' }), makeItem({ id: 'b' })];
    const json = exportMiningHistory(items, { format: 'json' });
    const parsed = JSON.parse(json.content);
    expect(parsed.length).toEqual(2);
    expect(parsed[0].word).toEqual('w');
    expect(parsed[0].definition).toEqual('d');

    const txt = exportMiningHistory(items, { format: 'txt' });
    expect(txt.content).toContain('sentence | w — d');
});

it('sorts by timestamp and handles empty input', () => {
    const items = [makeItem({ id: 'b', timestamp: 2000 }), makeItem({ id: 'a', timestamp: 1000 })];
    const result = exportMiningHistory(items, { format: 'csv' });
    const ids = result.content
        .replace('\\ufeff', '')
        .split('\r\n')
        .slice(1, 3)
        .map((line) => line.split(',')[0]);
    expect(ids).toEqual(['a', 'b']);

    const empty = exportMiningHistory([], { format: 'csv' });
    expect(empty.exportedCount).toEqual(0);
    expect(empty.maxTimestamp).toBeUndefined();
    expect(empty.content).toContain('id,mined_at_iso');
});

it('filters by time range', () => {
    const items = [
        makeItem({ id: 'a', timestamp: 1000 }),
        makeItem({ id: 'b', timestamp: 2000 }),
        makeItem({ id: 'c', timestamp: 3000 }),
    ];
    expect(filterByTimeRange(items, 2000, 3000).map((i) => i.id)).toEqual(['b', 'c']);
    expect(filterByTimeRange(items, undefined, 1500).map((i) => i.id)).toEqual(['a']);
    expect(filterByTimeRange(items).length).toEqual(3);
});

it('filters only unexported items', () => {
    const items = [makeItem({ id: 'a', timestamp: 1000 }), makeItem({ id: 'b', timestamp: 2000 })];
    expect(filterUnexported(items, 1000).map((i) => i.id)).toEqual(['b']);
    expect(filterUnexported(items, undefined).length).toEqual(2);
    expect(filterUnexported(items, 2000).length).toEqual(0);
});

it('computes day boundaries', () => {
    const now = new Date(2026, 8, 27, 15, 30).getTime();
    const today = new Date(startOfToday(now));
    expect(today.getHours()).toEqual(0);
    expect(today.getMinutes()).toEqual(0);
    expect(startOfDayNDaysAgo(7, now)).toEqual(startOfToday(now) - 7 * 24 * 60 * 60 * 1000);
});

it('builds file names', () => {
    const name = miningExportFileName('csv', 'all', 'all', new Date(2026, 8, 27, 10, 5));
    expect(name).toEqual('asbplayer-mining-20260927-1005.csv');
    expect(miningExportFileName('tsv', 'section', 'unexported', new Date(2026, 8, 27, 10, 5))).toEqual(
        'asbplayer-mining-20260927-1005-per-file-unexported.tsv'
    );
});
