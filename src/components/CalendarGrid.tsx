import type { ReactNode } from 'react';
import type { PilotSchedule } from '../types';
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

export default function CalendarGrid({
    schedules, freeWeekStartIdx,
    checkedItems, onToggleCheck, onClickItem, onAddItem, onMoveItem,
    selectedPilotIds, year, month
}: Props) {
    if (schedules.length === 0) return null;

    const workdays = schedules[0].days.map((d) => d.date);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Create mapping from day number to dayIdx in algorithm arrays
    const dateToDayIdx = new Map<number, number>();
    workdays.forEach((wd, i) => dateToDayIdx.set(wd.getDate(), i));

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [null, null, null, null, null];
    let hasDays = false;

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) {
            if (day === daysInMonth && hasDays) {
                weeks.push(currentWeek);
            }
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

    // Determine pilot colors for visual grouping if multiple pilots
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
                                    <td key={ci} className={`align-top border-b border-r border-slate-200 relative last:border-r-0 p-2 min-h-[140px] ${isFree ? 'bg-purple-50/30' : 'bg-white'
                                        }`}>
                                        {/* Header da Célula */}
                                        <div className="flex justify-between items-center mb-2">
                                            {isFree ? (
                                                <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">semana livre</span>
                                            ) : <span />}
                                            <span className="text-sm font-semibold text-slate-400">{dateNum}</span>
                                        </div>

                                        {/* Conteúdo */}
                                        {isWorkday && (
                                            <div className="space-y-2">
                                                {filteredSchedules.reduce((acc, sch) => {
                                                    const pilotIdx = schedules.findIndex(s => s.pilot.id === sch.pilot.id);
                                                    const dayItems = sch.days[dayIdx].items;

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
                                                                    onMoveItem(parsed.pilotIdx, parsed.dayIdx, parsed.itemIdx, pilotIdx, dayIdx);
                                                                } catch (err) { }
                                                            }}
                                                        >
                                                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70 flex justify-between items-center">
                                                                <span>{sch.pilot.name}</span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {dayItems.map((item, ii) => {
                                                                    const key = `${pilotIdx}-${dayIdx}-${ii}`;
                                                                    const done = checkedItems.has(key);
                                                                    const spillover = item.isSpillover === true;
                                                                    const missed = item.missedDirectional === true;

                                                                    let borderClass = 'border-slate-100 hover:border-blue-300';
                                                                    let bgClass = 'bg-white';
                                                                    if (missed) {
                                                                        borderClass = 'border-red-300';
                                                                        bgClass = 'bg-red-50/50';
                                                                    } else if (spillover) {
                                                                        borderClass = 'border-orange-300';
                                                                        bgClass = 'bg-orange-50/50';
                                                                    }

                                                                    return (
                                                                        <div
                                                                            key={ii}
                                                                            draggable
                                                                            onDragStart={(e) => {
                                                                                e.dataTransfer.setData('application/json', JSON.stringify({ pilotIdx, dayIdx, itemIdx: ii }));
                                                                                e.dataTransfer.effectAllowed = 'move';
                                                                            }}
                                                                            className={`flex items-start gap-1 text-xs rounded p-1 border cursor-grab active:cursor-grabbing transition-colors ${done ? 'opacity-40 grayscale' : ''
                                                                                } ${borderClass} ${bgClass}`}
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
                                                                                    <span className="block text-[8px] font-bold text-orange-500 uppercase leading-none mb-0.5">
                                                                                        ↩ redir
                                                                                    </span>
                                                                                )}
                                                                                {missed && (
                                                                                    <span className="block text-[8px] font-bold text-red-500 uppercase leading-none mb-0.5" title="Fora da semana solicitada">
                                                                                        ⚠️ atrasado
                                                                                    </span>
                                                                                )}
                                                                                <span className="font-medium text-slate-800">{item.client}</span>
                                                                                <span className="text-slate-400 mx-0.5">·</span>
                                                                                <span className="text-slate-600">{PRODUCTION_LABELS[item.type]}</span>
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Botão de + (Sempre visível mas discreto em modo permanente) */}
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
