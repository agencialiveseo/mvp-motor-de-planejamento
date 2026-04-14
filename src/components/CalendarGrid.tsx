import { useState } from 'react';
import type { ReactNode } from 'react';
import type { AllocationItem, ProductionType, PilotSchedule } from '../types';
import { PRODUCTION_LABELS } from '../constants/productions';

interface Props {
    schedules: PilotSchedule[];
    freeWeekStartIdx: number;
    checkedItems: Set<string>;
    onToggleCheck: (key: string) => void;
    onClickItem: (pilotIdx: number, dayIdx: number, itemIdx: number) => void;
    onAddItem: (pilotIdx: number, dayIdx: number) => void;
    onMoveItem: (fromPilot: number, fromDay: number, fromItem: number, toPilot: number, toDay: number) => void;
    selectedPilotIds: Set<string>;
    year: number;
    month: number;
}

// ─── Group helpers ────────────────────────────────────────────────────────────

type ItemGroup = {
    client: string;
    type: ProductionType;
    /** Original indices in dayItems array — preserves compatibility with callbacks */
    indices: number[];
    isSpillover: boolean;
    missedDirectional: boolean;
};

function groupItems(dayItems: AllocationItem[]): ItemGroup[] {
    const order: string[] = [];
    const map: Record<string, ItemGroup> = {};

    dayItems.forEach((item, idx) => {
        const key = `${item.client}||${item.type}`;
        if (!map[key]) {
            order.push(key);
            map[key] = {
                client: item.client,
                type: item.type,
                indices: [],
                isSpillover: false,
                missedDirectional: false,
            };
        }
        map[key].indices.push(idx);
        if (item.isSpillover) map[key].isSpillover = true;
        if (item.missedDirectional) map[key].missedDirectional = true;
    });

    return order.map((k) => map[k]);
}

function groupExpandKey(pilotIdx: number, dayIdx: number, client: string, type: string) {
    return `${pilotIdx}-${dayIdx}-${client}||${type}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarGrid({
    schedules, freeWeekStartIdx,
    checkedItems, onToggleCheck, onClickItem, onAddItem, onMoveItem,
    selectedPilotIds, year, month
}: Props) {
    if (schedules.length === 0) return null;

    const workdays = schedules[0].days.map((d) => d.date);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dateToDayIdx = new Map<number, number>();
    workdays.forEach((wd, i) => dateToDayIdx.set(wd.getDate(), i));

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [null, null, null, null, null];
    let hasDays = false;

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) {
            if (day === daysInMonth && hasDays) weeks.push(currentWeek);
            continue;
        }
        const colIdx = dow - 1;
        currentWeek[colIdx] = day;
        hasDays = true;
        if (colIdx === 4 || day === daysInMonth) {
            weeks.push(currentWeek);
            currentWeek = [null, null, null, null, null];
            hasDays = false;
        }
    }

    const DAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    const filteredSchedules = schedules.filter(s => selectedPilotIds.has(s.pilot.id));

    const pilotColors = [
        'border-blue-300 bg-blue-50 text-blue-800',
        'border-teal-300 bg-teal-50 text-teal-800',
        'border-indigo-300 bg-indigo-50 text-indigo-800',
        'border-rose-300 bg-rose-50 text-rose-800',
        'border-amber-300 bg-amber-50 text-amber-800',
    ];
    const getPilotColor = (pilotId: string) => {
        const idx = schedules.findIndex(s => s.pilot.id === pilotId);
        return pilotColors[idx % pilotColors.length];
    };

    // ── Expansion state ──────────────────────────────────────────────────────
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

    function toggleGroup(key: string) {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    return (
        <div className="overflow-x-auto bg-slate-50 border border-slate-200 rounded-lg">
            <table className="w-full border-collapse table-fixed min-w-[1000px]">
                <thead>
                    <tr>
                        {DAY_LABELS.map(lbl => (
                            <th key={lbl} className="bg-white border-b border-r border-slate-200 py-3 font-semibold text-slate-700 w-1/5 last:border-r-0">
                                {lbl}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {weeks.map((week, wi) => (
                        <tr key={wi}>
                            {week.map((dateNum, ci) => {
                                if (!dateNum) {
                                    return <td key={ci} className="bg-slate-50 border-b border-r border-slate-200 last:border-r-0" />;
                                }

                                const dayIdx = dateToDayIdx.get(dateNum);
                                const isWorkday = dayIdx !== undefined;
                                const isFree = isWorkday && dayIdx >= freeWeekStartIdx;

                                return (
                                    <td key={ci} className={`align-top border-b border-r border-slate-200 relative last:border-r-0 p-2 min-h-[140px] ${isFree ? 'bg-purple-50/30' : 'bg-white'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            {isFree ? (
                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">semana livre</span>
                                            ) : <span />}
                                            <span className="text-sm font-semibold text-slate-400">{dateNum}</span>
                                        </div>

                                        {isWorkday && (
                                            <div className="space-y-2">
                                                {filteredSchedules.reduce((acc, sch) => {
                                                    const pilotIdx = schedules.findIndex(s => s.pilot.id === sch.pilot.id);
                                                    const dayItems = sch.days[dayIdx].items;
                                                    const groups = groupItems(dayItems);

                                                    acc.push(
                                                        <div
                                                            key={`p-${sch.pilot.id}`}
                                                            className={`rounded border-l-4 ${getPilotColor(sch.pilot.id)} p-1 shadow-sm flex flex-col min-h-[44px] hover:shadow-md transition-shadow group`}
                                                            onDragOver={(e) => {
                                                                e.preventDefault();
                                                                e.dataTransfer.dropEffect = 'move';
                                                            }}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                const data = e.dataTransfer.getData('application/json');
                                                                if (!data) return;
                                                                try {
                                                                    const parsed = JSON.parse(data);
                                                                    if (Array.isArray(parsed.itemIndices)) {
                                                                        // Group drag: move all items in reverse to keep indices valid
                                                                        const sorted = [...parsed.itemIndices].sort((a, b) => b - a);
                                                                        sorted.forEach((fromItemIdx: number) => {
                                                                            onMoveItem(parsed.pilotIdx, parsed.dayIdx, fromItemIdx, pilotIdx, dayIdx);
                                                                        });
                                                                    } else {
                                                                        onMoveItem(parsed.pilotIdx, parsed.dayIdx, parsed.itemIdx, pilotIdx, dayIdx);
                                                                    }
                                                                } catch (_) { }
                                                            }}
                                                        >
                                                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">
                                                                {sch.pilot.name}
                                                            </div>

                                                            <div className="space-y-1">
                                                                {groups.map((group) => {
                                                                    const expandKey = groupExpandKey(pilotIdx, dayIdx, group.client, group.type);
                                                                    const isExpanded = expandedGroups.has(expandKey);
                                                                    const isGrouped = group.indices.length > 1;

                                                                    if (!isGrouped) {
                                                                        // Single item — render exactly as before
                                                                        const ii = group.indices[0];
                                                                        const item = dayItems[ii];
                                                                        const key = `${pilotIdx}-${dayIdx}-${ii}`;
                                                                        const done = checkedItems.has(key);
                                                                        const spillover = item.isSpillover === true;
                                                                        const missed = item.missedDirectional === true;

                                                                        let borderClass = 'border-slate-100 hover:border-blue-300';
                                                                        let bgClass = 'bg-white';
                                                                        if (missed) { borderClass = 'border-red-300'; bgClass = 'bg-red-50/50'; }
                                                                        else if (spillover) { borderClass = 'border-orange-300'; bgClass = 'bg-orange-50/50'; }

                                                                        return (
                                                                            <div
                                                                                key={`single-${ii}`}
                                                                                draggable
                                                                                onDragStart={(e) => {
                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIdx: ii }));
                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                }}
                                                                                className={`flex items-start gap-1 text-xs rounded p-1 border cursor-grab active:cursor-grabbing transition-colors ${done ? 'opacity-40 grayscale' : ''} ${borderClass} ${bgClass}`}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={done}
                                                                                    onChange={() => onToggleCheck(key)}
                                                                                    className="mt-0.5 flex-shrink-0 cursor-pointer accent-green-600 rounded-sm"
                                                                                />
                                                                                <button
                                                                                    className={`text-left leading-tight flex-1 hover:bg-blue-50 cursor-pointer transition-colors px-1 rounded ${done ? 'line-through text-slate-500' : ''}`}
                                                                                    onClick={() => onClickItem(pilotIdx, dayIdx, ii)}
                                                                                >
                                                                                    {spillover && !missed && (
                                                                                        <span className="block text-[8px] font-bold text-orange-500 uppercase leading-none mb-0.5">↩ redir</span>
                                                                                    )}
                                                                                    {missed && (
                                                                                        <span className="block text-[8px] font-bold text-red-500 uppercase leading-none mb-0.5" title="Fora da semana solicitada">⚠️ atrasado</span>
                                                                                    )}
                                                                                    <span className="font-medium text-slate-800">{item.client}</span>
                                                                                    <span className="text-slate-400 mx-0.5">·</span>
                                                                                    <span className="text-slate-600">{PRODUCTION_LABELS[item.type]}</span>
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // ── Grouped item ──────────────────────────────────────
                                                                    const allDone = group.indices.every(i => checkedItems.has(`${pilotIdx}-${dayIdx}-${i}`));
                                                                    const someDone = !allDone && group.indices.some(i => checkedItems.has(`${pilotIdx}-${dayIdx}-${i}`));

                                                                    let groupBorder = 'border-slate-200';
                                                                    let groupBg = 'bg-white';
                                                                    if (group.missedDirectional) { groupBorder = 'border-red-300'; groupBg = 'bg-red-50/40'; }
                                                                    else if (group.isSpillover) { groupBorder = 'border-orange-300'; groupBg = 'bg-orange-50/40'; }

                                                                    return (
                                                                        <div key={`group-${group.client}-${group.type}`} className={`rounded border ${groupBorder} ${groupBg} text-xs overflow-hidden`}>
                                                                            {/* Group header — always visible */}
                                                                            <div
                                                                                draggable={!isExpanded}
                                                                                onDragStart={!isExpanded ? (e) => {
                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIndices: group.indices }));
                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                } : undefined}
                                                                                className={`flex items-center gap-1 p-1 ${!isExpanded ? 'cursor-grab active:cursor-grabbing' : ''} ${allDone ? 'opacity-40 grayscale' : ''}`}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={allDone}
                                                                                    ref={(el) => { if (el) el.indeterminate = someDone; }}
                                                                                    onChange={() => {
                                                                                        // If all checked → uncheck all. Otherwise → check all unchecked.
                                                                                        group.indices.forEach(i => {
                                                                                            const k = `${pilotIdx}-${dayIdx}-${i}`;
                                                                                            const isDone = checkedItems.has(k);
                                                                                            if (allDone ? isDone : !isDone) onToggleCheck(k);
                                                                                        });
                                                                                    }}
                                                                                    className="mt-0.5 flex-shrink-0 cursor-pointer accent-green-600 rounded-sm"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                />
                                                                                <div className="flex-1 min-w-0 leading-tight">
                                                                                    {group.missedDirectional && (
                                                                                        <span className="block text-[8px] font-bold text-red-500 uppercase leading-none mb-0.5">⚠️ atrasado</span>
                                                                                    )}
                                                                                    {group.isSpillover && !group.missedDirectional && (
                                                                                        <span className="block text-[8px] font-bold text-orange-500 uppercase leading-none mb-0.5">↩ redir</span>
                                                                                    )}
                                                                                    <span className="font-medium text-slate-800 truncate">{group.client}</span>
                                                                                    <span className="text-slate-400 mx-0.5">·</span>
                                                                                    <span className="text-slate-600">{PRODUCTION_LABELS[group.type]}</span>
                                                                                </div>
                                                                                <span className="flex-shrink-0 inline-flex items-center justify-center bg-slate-100 text-slate-600 font-semibold rounded-full text-[9px] px-1.5 py-0.5 min-w-[1.25rem]">
                                                                                    {group.indices.length}×
                                                                                </span>
                                                                                <button
                                                                                    onClick={() => toggleGroup(expandKey)}
                                                                                    className="flex-shrink-0 text-slate-400 hover:text-slate-700 px-0.5 transition-colors"
                                                                                    title={isExpanded ? 'Colapsar' : 'Expandir itens'}
                                                                                >
                                                                                    {isExpanded ? '▾' : '▸'}
                                                                                </button>
                                                                            </div>

                                                                            {/* Expanded individual items */}
                                                                            {isExpanded && (
                                                                                <div className="border-t border-slate-100 space-y-px">
                                                                                    {group.indices.map((ii) => {
                                                                                        const item = dayItems[ii];
                                                                                        const k = `${pilotIdx}-${dayIdx}-${ii}`;
                                                                                        const done = checkedItems.has(k);
                                                                                        const spillover = item.isSpillover === true;
                                                                                        const missed = item.missedDirectional === true;

                                                                                        let rowBg = 'bg-white hover:bg-slate-50';
                                                                                        if (missed) rowBg = 'bg-red-50/60 hover:bg-red-50';
                                                                                        else if (spillover) rowBg = 'bg-orange-50/60 hover:bg-orange-50';

                                                                                        return (
                                                                                            <div
                                                                                                key={`exp-${ii}`}
                                                                                                draggable
                                                                                                onDragStart={(e) => {
                                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIdx: ii }));
                                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                                }}
                                                                                                className={`flex items-start gap-1 px-1.5 py-1 cursor-grab active:cursor-grabbing transition-colors ${done ? 'opacity-40 grayscale' : ''} ${rowBg}`}
                                                                                            >
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={done}
                                                                                                    onChange={() => onToggleCheck(k)}
                                                                                                    className="mt-0.5 flex-shrink-0 cursor-pointer accent-green-600 rounded-sm"
                                                                                                />
                                                                                                <button
                                                                                                    className={`text-left leading-tight flex-1 hover:bg-blue-50 cursor-pointer transition-colors px-0.5 rounded text-[10px] ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}
                                                                                                    onClick={() => onClickItem(pilotIdx, dayIdx, ii)}
                                                                                                >
                                                                                                    #{ii + 1}
                                                                                                </button>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            <button
                                                                onClick={() => onAddItem(pilotIdx, dayIdx)}
                                                                className="mt-1 w-full text-center text-[10px] text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title={`Adicionar produção para ${sch.pilot.name}`}
                                                            >
                                                                + Add
                                                            </button>
                                                        </div>
                                                    );
                                                    return acc;
                                                }, [] as ReactNode[])}
                                            </div>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
