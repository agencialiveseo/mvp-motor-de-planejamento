import { useState, useEffect, useRef } from 'react';
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
    onSwapDays: (pilotIdx: number, fromDay: number, toDay: number) => void;
    onEditNote: (pilotIdx: number, dayIdx: number, itemIdx: number, note: string) => void;
    selectedPilotIds: Set<string>;
    year: number;
    month: number;
}

type NotePopover = { pilotIdx: number; dayIdx: number; itemIdx: number; text: string } | null;

// ─── Note Popover ─────────────────────────────────────────────────────────────

function NotePopoverBox({
    text, textareaRef, onChange, onSave, onClose,
}: {
    text: string;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onChange: (t: string) => void;
    onSave: () => void;
    onClose: () => void;
}) {
    return (
        <div
            className="bg-white border border-amber-200 rounded-xl shadow-2xl p-3 w-72"
            onClick={(e) => e.stopPropagation()}
        >
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">📝 Nota para o Pilot</p>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(); } }}
                placeholder="Ex: usar palavra-chave X, incluir 3 FAQs..."
                rows={3}
                className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-amber-50/30"
            />
            <div className="flex justify-between items-center mt-2 gap-2">
                <span className="text-[9px] text-slate-400">Ctrl+Enter salva</span>
                <div className="flex gap-1.5">
                    <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded border border-slate-200 transition-colors">Cancelar</button>
                    <button onClick={onSave} className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded font-medium transition-colors">Salvar</button>
                </div>
            </div>
        </div>
    );
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
    checkedItems, onToggleCheck, onClickItem, onAddItem, onMoveItem, onSwapDays, onEditNote,
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

    // ── Toast state ──────────────────────────────────────────────────────────
    const [toast, setToast] = useState<string | null>(null);
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    // ── Note popover state ───────────────────────────────────────────────────
    const [notePopover, setNotePopover] = useState<NotePopover>(null);
    const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (notePopover) noteTextareaRef.current?.focus();
    }, [notePopover]);

    function openNote(pilotIdx: number, dayIdx: number, itemIdx: number, currentNote: string) {
        setNotePopover({ pilotIdx, dayIdx, itemIdx, text: currentNote });
    }
    function saveNote() {
        if (!notePopover) return;
        onEditNote(notePopover.pilotIdx, notePopover.dayIdx, notePopover.itemIdx, notePopover.text);
        setNotePopover(null);
    }

    function toggleGroup(key: string) {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    return (
        <div className="relative overflow-x-auto bg-slate-50 border border-slate-200 rounded-lg">
            {/* Note popover — fixed, centered, outside DOM flow so no animation jitter */}
            {notePopover && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setNotePopover(null)} />
                    <div className="fixed z-40 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <NotePopoverBox
                            text={notePopover.text}
                            textareaRef={noteTextareaRef}
                            onChange={(t) => setNotePopover(p => p ? { ...p, text: t } : p)}
                            onSave={saveNote}
                            onClose={() => setNotePopover(null)}
                        />
                    </div>
                </>
            )}
            {toast && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg max-w-sm text-center">
                    {toast}
                </div>
            )}
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
                                                            className={`rounded border-l-4 ${getPilotColor(sch.pilot.id)} p-1 shadow-sm flex flex-col min-h-[44px] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md group`}
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
                                                                    if (parsed.type === 'card-swap') {
                                                                        if (parsed.pilotIdx !== pilotIdx) {
                                                                            setToast('Não é possível trocar cards de pilots diferentes.');
                                                                            return;
                                                                        }
                                                                        if (parsed.dayIdx === dayIdx) return;
                                                                        const fromIsAlta = parsed.dayIdx < 10;
                                                                        const toIsAlta = dayIdx < 10;
                                                                        if (fromIsAlta !== toIsAlta) {
                                                                            setToast('Este card contém itens de prioridade Alta e não pode ser movido para fora das duas primeiras semanas.');
                                                                            return;
                                                                        }
                                                                        onSwapDays(pilotIdx, parsed.dayIdx, dayIdx);
                                                                    } else if (Array.isArray(parsed.itemIndices)) {
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
                                                            <div
                                                                className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70 hover:opacity-100 cursor-grab active:cursor-grabbing select-none rounded-sm px-0.5 -mx-0.5 hover:bg-black/5 transition-all duration-150"
                                                                draggable
                                                                title="Arrastar para trocar o dia inteiro"
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'card-swap', pilotIdx, dayIdx }));
                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                    e.stopPropagation();
                                                                }}
                                                            >
                                                                ⠿ {sch.pilot.name}
                                                            </div>

                                                            <div className="space-y-1">
                                                                {groups.map((group) => {
                                                                    const expandKey = groupExpandKey(pilotIdx, dayIdx, group.client, group.type);
                                                                    const isExpanded = expandedGroups.has(expandKey);
                                                                    const isGrouped = group.indices.length > 1;
                                                                    const hasHighPriority = group.indices.some((i) => dayItems[i].priority === 'alta');

                                                                    if (!isGrouped) {
                                                                        // Single item — render exactly as before
                                                                        const ii = group.indices[0];
                                                                        const item = dayItems[ii];
                                                                        const key = `${pilotIdx}-${dayIdx}-${ii}`;
                                                                        const done = checkedItems.has(key);
                                                                        const spillover = item.isSpillover === true;
                                                                        const missed = item.missedDirectional === true;
                                                                        const isHighPriority = item.priority === 'alta';

                                                                        let borderClass = 'border-slate-100 hover:border-blue-300';
                                                                        let bgClass = 'bg-white';
                                                                        if (missed) { borderClass = 'border-red-300'; bgClass = 'bg-red-50/50'; }
                                                                        else if (spillover) { borderClass = 'border-orange-300'; bgClass = 'bg-orange-50/50'; }
                                                                        const hasNote = !!item.note?.trim();
                                                                        if (hasNote) borderClass = borderClass.replace('border-slate-100', 'border-amber-300');

                                                                        return (
                                                                            <div
                                                                                key={`single-${ii}`}
                                                                                draggable
                                                                                onDragStart={(e) => {
                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIdx: ii }));
                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                }}
                                                                                className={`flex items-start gap-1 text-xs rounded p-1 border cursor-grab active:cursor-grabbing transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${done ? 'opacity-40 grayscale' : ''} ${borderClass} ${bgClass}`}
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
                                                                                    {spillover && !missed && !isHighPriority && (
                                                                                        <span className="block text-[8px] font-bold text-orange-500 uppercase leading-none mb-0.5">↩ redir</span>
                                                                                    )}
                                                                                    <span className="font-medium text-slate-800">{item.client}</span>
                                                                                    <span className="text-slate-400 mx-0.5">·</span>
                                                                                    <span className="text-slate-600">{PRODUCTION_LABELS[item.type]}</span>
                                                                                </button>
                                                                                {hasNote ? (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); openNote(pilotIdx, dayIdx, ii, item.note ?? ''); }}
                                                                                        title={item.note}
                                                                                        className="flex-shrink-0 inline-flex items-center bg-amber-100 border border-amber-300 text-amber-700 text-[9px] font-bold px-1 py-0.5 rounded hover:bg-amber-200 transition-colors leading-none"
                                                                                    >
                                                                                        💬
                                                                                    </button>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); openNote(pilotIdx, dayIdx, ii, item.note ?? ''); }}
                                                                                        title="Adicionar nota"
                                                                                        className="flex-shrink-0 text-[10px] leading-none text-slate-200 hover:text-amber-400 transition-colors px-0.5 rounded"
                                                                                    >
                                                                                        📝
                                                                                    </button>
                                                                                )}
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
                                                                    const groupHasNote = group.indices.some(i => !!dayItems[i].note?.trim());
                                                                    if (groupHasNote && !group.missedDirectional && !group.isSpillover) groupBorder = 'border-amber-300';

                                                                    return (
                                                                        <div key={`group-${group.client}-${group.type}`} className={`rounded border ${groupBorder} ${groupBg} text-xs overflow-hidden transition-all duration-150 ${!isExpanded ? 'hover:-translate-y-0.5 hover:shadow-sm' : ''}`}>
                                                                            {/* Group header — always visible */}
                                                                            <div
                                                                                draggable={!isExpanded}
                                                                                onDragStart={!isExpanded ? (e) => {
                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIndices: group.indices }));
                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                } : undefined}
                                                                                className={`flex items-center gap-1 p-1 ${!isExpanded ? 'cursor-grab active:cursor-grabbing hover:bg-black/[0.04] transition-colors duration-150' : ''} ${allDone ? 'opacity-40 grayscale' : ''}`}
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
                                                                                    {group.isSpillover && !group.missedDirectional && !hasHighPriority && (
                                                                                        <span className="block text-[8px] font-bold text-orange-500 uppercase leading-none mb-0.5">↩ redir</span>
                                                                                    )}
                                                                                    <span className="font-medium text-slate-800 truncate">{group.client}</span>
                                                                                    <span className="text-slate-400 mx-0.5">·</span>
                                                                                    <span className="text-slate-600">{PRODUCTION_LABELS[group.type]}</span>
                                                                                </div>
                                                                                <span className="flex-shrink-0 inline-flex items-center justify-center bg-slate-100 text-slate-600 font-semibold rounded-full text-[9px] px-1.5 py-0.5 min-w-[1.25rem]">
                                                                                    {group.indices.length}×
                                                                                </span>
                                                                                {groupHasNote && (
                                                                                    <span className="flex-shrink-0 inline-flex items-center bg-amber-100 border border-amber-300 text-amber-700 text-[9px] font-bold px-1 py-0.5 rounded leading-none" title="Este grupo contém notas — expanda para ver">💬</span>
                                                                                )}
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
                                                                                        const expHasNote = !!item.note?.trim();

                                                                                        return (
                                                                                            <div
                                                                                                key={`exp-${ii}`}
                                                                                                draggable
                                                                                                onDragStart={(e) => {
                                                                                                    e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIdx: ii }));
                                                                                                    e.dataTransfer.effectAllowed = 'move';
                                                                                                }}
                                                                                                className={`flex items-start gap-1 px-1.5 py-1 cursor-grab active:cursor-grabbing transition-all duration-150 hover:-translate-y-px ${done ? 'opacity-40 grayscale' : ''} ${rowBg}`}
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
                                                                                                {expHasNote ? (
                                                                                                    <button
                                                                                                        onClick={(e) => { e.stopPropagation(); openNote(pilotIdx, dayIdx, ii, item.note ?? ''); }}
                                                                                                        title={item.note}
                                                                                                        className="flex-shrink-0 inline-flex items-center bg-amber-100 border border-amber-300 text-amber-700 text-[9px] font-bold px-1 py-0.5 rounded hover:bg-amber-200 transition-colors leading-none"
                                                                                                    >
                                                                                                        💬
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <button
                                                                                                        onClick={(e) => { e.stopPropagation(); openNote(pilotIdx, dayIdx, ii, item.note ?? ''); }}
                                                                                                        title="Adicionar nota"
                                                                                                        className="flex-shrink-0 text-[10px] leading-none text-slate-200 hover:text-amber-400 transition-colors px-0.5"
                                                                                                    >
                                                                                                        📝
                                                                                                    </button>
                                                                                                )}
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
