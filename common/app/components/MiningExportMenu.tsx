import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { makeStyles } from '@mui/styles';
import type { Theme } from '@mui/material';
import type { CopyHistoryItem } from '@project/common';
import { download } from '@project/common/util';
import {
    exportMiningHistory,
    filterByTimeRange,
    filterUnexported,
    miningExportFileName,
    startOfDayNDaysAgo,
    startOfToday,
} from '@project/common/copy-history/mining-export';
import type { MiningExportFormat, MiningExportRange } from '@project/common/copy-history/mining-export';
import { getLastExportedAt, setLastExportedAt } from '@project/common/copy-history/mining-export-progress';

const useStyles = makeStyles<Theme>((theme) => ({
    exportButton: {
        margin: theme.spacing(2),
        marginBottom: theme.spacing(1),
    },
    popover: {
        padding: theme.spacing(2),
        minWidth: 260,
    },
    sectionLabel: {
        marginTop: theme.spacing(1),
        marginBottom: theme.spacing(0.5),
    },
    optionRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
    },
    exportAction: {
        marginTop: theme.spacing(2),
    },
}));

type Scope = 'all' | 'section';

interface MiningExportMenuProps {
    items: CopyHistoryItem[];
}

const sanitizeFileNamePart = (name: string): string => name.replace(/[\\/:*?"<>|#%&{}$!'@+=`]/g, '_').slice(0, 80);

const computeRangedItems = (items: CopyHistoryItem[], range: MiningExportRange): CopyHistoryItem[] => {
    if (range === 'unexported') {
        return filterUnexported(items, getLastExportedAt());
    }
    if (range === 'today') {
        return filterByTimeRange(items, startOfToday());
    }
    if (range === 'last7Days') {
        return filterByTimeRange(items, startOfDayNDaysAgo(6));
    }
    return items;
};

export default function MiningExportMenu({ items }: MiningExportMenuProps) {
    const classes = useStyles();
    const { t } = useTranslation();
    const [anchorEl, setAnchorEl] = useState<Element>();
    const [format, setFormat] = useState<MiningExportFormat>('csv');
    const [scope, setScope] = useState<Scope>('all');
    const [range, setRange] = useState<MiningExportRange>('all');

    const open = anchorEl !== undefined;
    const handleOpen = useCallback((e: React.MouseEvent) => setAnchorEl(e.currentTarget), []);
    const handleClose = useCallback(() => setAnchorEl(undefined), []);

    // Recomputed on every render so time-sensitive filters (e.g. "new since last
    // export") are always fresh when the menu opens. The list is small (bounded
    // by the mining history storage limit), so this is cheap.
    const rangedItems = computeRangedItems(items, range);

    const handleExport = useCallback(() => {
        const groups: { name: string; items: CopyHistoryItem[] }[] =
            scope === 'section'
                ? Object.entries(
                      rangedItems.reduce<{ [key: string]: CopyHistoryItem[] }>((acc, item) => {
                          const key = item.subtitleFileName || 'unknown';
                          (acc[key] = acc[key] ?? []).push(item);
                          return acc;
                      }, {})
                  ).map(([name, groupItems]) => ({ name, items: groupItems }))
                : [{ name: '', items: rangedItems }];

        let newestTimestamp: number | undefined;

        for (const group of groups) {
            if (group.items.length === 0) {
                continue;
            }
            const result = exportMiningHistory(group.items, {
                format,
                onlyUnexported: range === 'unexported',
                lastExportedAt: range === 'unexported' ? getLastExportedAt() : undefined,
            });
            let fileName = miningExportFileName(format, scope, range);
            if (scope === 'section') {
                fileName = fileName.replace(`.${format}`, `-${sanitizeFileNamePart(group.name)}.${format}`);
            }
            download(new Blob([result.content], { type: result.mimeType }), fileName);
            if (result.maxTimestamp !== undefined) {
                newestTimestamp =
                    newestTimestamp === undefined
                        ? result.maxTimestamp
                        : Math.max(newestTimestamp, result.maxTimestamp);
            }
        }

        if (range === 'unexported' && newestTimestamp !== undefined) {
            setLastExportedAt(newestTimestamp);
        }
        handleClose();
    }, [rangedItems, scope, format, range, handleClose]);

    const renderOptions = <T extends string>(
        options: { value: T; label: string }[],
        selected: T,
        onSelect: (value: T) => void
    ) => (
        <div className={classes.optionRow}>
            {options.map((option) => (
                <Button
                    key={option.value}
                    size="small"
                    variant={selected === option.value ? 'contained' : 'outlined'}
                    color={selected === option.value ? 'primary' : 'inherit'}
                    onClick={() => onSelect(option.value)}
                >
                    {option.label}
                </Button>
            ))}
        </div>
    );

    return (
        <>
            <Button
                variant="outlined"
                color="primary"
                className={classes.exportButton}
                startIcon={<SaveAltIcon />}
                onClick={handleOpen}
            >
                {t('copyHistory.miningExport')}
            </Button>
            <Popover
                disableEnforceFocus={true}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
                <div className={classes.popover}>
                    <Typography variant="caption" color="textSecondary" className={classes.sectionLabel}>
                        {t('copyHistory.miningExportFormat')}
                    </Typography>
                    {renderOptions(
                        (['csv', 'tsv', 'json', 'txt'] as MiningExportFormat[]).map((value) => ({
                            value,
                            label: value.toUpperCase(),
                        })),
                        format,
                        setFormat
                    )}
                    <Divider />
                    <Typography variant="caption" color="textSecondary" className={classes.sectionLabel}>
                        {t('copyHistory.miningExportScope')}
                    </Typography>
                    {renderOptions(
                        [
                            { value: 'all' as const, label: t('copyHistory.miningExportScopeAll') },
                            { value: 'section' as const, label: t('copyHistory.miningExportScopePerFile') },
                        ],
                        scope,
                        setScope
                    )}
                    <Divider />
                    <Typography variant="caption" color="textSecondary" className={classes.sectionLabel}>
                        {t('copyHistory.miningExportRange')}
                    </Typography>
                    {renderOptions(
                        (['all', 'today', 'last7Days', 'unexported'] as MiningExportRange[]).map((value) => ({
                            value,
                            label: t(`copyHistory.miningExportRange${value[0].toUpperCase()}${value.slice(1)}`),
                        })),
                        range,
                        setRange
                    )}
                    <Button
                        variant="contained"
                        color="primary"
                        fullWidth
                        className={classes.exportAction}
                        disabled={rangedItems.length === 0}
                        onClick={handleExport}
                    >
                        {rangedItems.length === 0
                            ? t('copyHistory.miningExportEmpty')
                            : t('copyHistory.miningExportAction', { count: rangedItems.length })}
                    </Button>
                </div>
            </Popover>
        </>
    );
}
