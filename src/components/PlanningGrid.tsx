import type { PilotSchedule } from '../types';
import { PRODUCTION_LABELS } from '../constants/productions';
import { formatDayWeek } from '../utils/dates';

interface Props {
  schedules: PilotSchedule[];
  freeWeekStartIdx: number;
  isEditMode: boolean;
  checkedItems: Set<string>;
  onToggleCheck: (key: string) => void;
  onClickItem: (pilotIdx: number, dayIdx: number, itemIdx: number) => void;
  onAddItem: (pilotIdx: number, dayIdx: number) => void;
}

export default function PlanningGrid({
  schedules, freeWeekStartIdx, isEditMode,
  checkedItems, onToggleCheck, onClickItem, onAddItem,
}: Props) {
  if (schedules.length === 0) return null;

  const workdays = schedules[0].days.map((d) => d.date);

  // Pre-compute completed UP per pilot and per day
  const pilotCompletedUP = schedules.map((s) =>
    s.days.reduce((sum, day, di) =>
      sum + day.items.reduce((s2, _, ii) => {
        const key = `${schedules.indexOf(s)}-${di}-${ii}`;
        return s2 + (checkedItems.has(key) ? day.items[ii].up : 0);
      }, 0), 0),
  );

  const dayCompletedUP = workdays.map((_, dayIdx) =>
    schedules.reduce((sum, s, pi) =>
      sum + s.days[dayIdx].items.reduce((s2, _, ii) => {
        const key = `${pi}-${dayIdx}-${ii}`;
        return s2 + (checkedItems.has(key) ? s.days[dayIdx].items[ii].up : 0);
      }, 0), 0),
  );

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs min-w-max">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-slate-100 border border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 min-w-[160px]">
              Pilot
            </th>
            {workdays.map((date, dayIdx) => {
              const isFree = dayIdx >= freeWeekStartIdx;
              const planned = schedules.reduce((s, sch) => s + sch.days[dayIdx].totalUP, 0);
              const done = dayCompletedUP[dayIdx];
              return (
                <th
                  key={date.toISOString()}
                  className={`border border-slate-200 px-2 py-1.5 text-center font-medium text-slate-600 min-w-[130px] ${isFree ? 'bg-purple-50' : 'bg-slate-50'
                    }`}
                >
                  <div>{formatDayWeek(date)}</div>
                  {isFree && <div className="text-purple-400 text-[10px] font-normal">semana livre</div>}
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                    {planned.toFixed(1)} UP
                    {done > 0 && <span className="text-green-600 ml-1">| {done.toFixed(1)} ✓</span>}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule, pi) => {
            const pilotPlannedUP = schedule.days.reduce((s, d) => s + d.totalUP, 0);
            const pilotDone = pilotCompletedUP[pi];
            const pct = pilotPlannedUP > 0 ? (pilotDone / pilotPlannedUP * 100).toFixed(0) : '0';

            return (
              <tr key={schedule.pilot.id}>
                <td className="sticky left-0 z-10 bg-white border border-slate-200 px-3 py-2 align-top">
                  <div className="font-semibold text-slate-700">{schedule.pilot.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {pilotPlannedUP.toFixed(1)} UP planejadas
                  </div>
                  {pilotDone > 0 && (
                    <div className="text-[10px] text-green-600 mt-0.5">
                      {pilotDone.toFixed(1)} / {pilotPlannedUP.toFixed(1)} UP — {pct}% ✓
                    </div>
                  )}
                </td>

                {schedule.days.map((day, di) => {
                  const up = day.totalUP;
                  const target = schedule.pilot.targetUP;
                  const isGood = up >= target - 0.01;
                  const isEmpty = up < 0.01;
                  const isFree = di >= freeWeekStartIdx;

                  let cellBg = '';
                  if (isEmpty) cellBg = isFree ? 'bg-purple-50/40' : 'bg-slate-50';
                  else if (isGood) cellBg = 'bg-green-50';
                  else cellBg = 'bg-red-50';

                  return (
                    <td
                      key={day.date.toISOString()}
                      className={`border border-slate-200 px-2 py-1.5 align-top ${cellBg}`}
                    >
                      <div className="space-y-1">
                        {day.items.map((item, ii) => {
                          const key = `${pi}-${di}-${ii}`;
                          const done = checkedItems.has(key);
                          const spillover = item.isSpillover === true;
                          return (
                            <div
                              key={ii}
                              className={`flex items-start gap-1 ${done ? 'opacity-40' : ''} ${spillover ? 'border-l-2 border-orange-400 pl-1.5 -ml-0.5' : ''
                                }`}
                            >
                              {!isEditMode && (
                                <input
                                  type="checkbox"
                                  checked={done}
                                  onChange={() => onToggleCheck(key)}
                                  className="mt-0.5 flex-shrink-0 cursor-pointer accent-green-600"
                                />
                              )}
                              <button
                                className={`text-left leading-tight flex-1 ${isEditMode
                                    ? 'hover:bg-blue-50 rounded px-1 -mx-1 cursor-pointer'
                                    : 'cursor-default'
                                  } ${done ? 'line-through' : ''}`}
                                onClick={() => isEditMode && onClickItem(pi, di, ii)}
                                disabled={!isEditMode}
                              >
                                {spillover && (
                                  <span className="block text-[9px] font-semibold text-orange-500 uppercase tracking-wide leading-tight mb-0.5">
                                    ↩ redirecionado
                                  </span>
                                )}
                                <span className="text-slate-700 font-medium">{item.client}</span>
                                <span className="text-slate-400 mx-1">·</span>
                                <span className="text-slate-500">{PRODUCTION_LABELS[item.type]}</span>
                                <span className="text-slate-400 mx-1">·</span>
                                <span className="font-mono text-slate-600">{item.quantity}</span>
                              </button>
                            </div>
                          );
                        })}

                        {/* UP total do dia */}
                        {day.items.length > 0 && (
                          <div className={`text-right font-bold font-mono pt-1 border-t mt-1 ${isGood ? 'text-green-700 border-green-200' : 'text-red-700 border-red-200'
                            }`}>
                            {up.toFixed(2)} UP
                          </div>
                        )}

                        {/* Botão + em modo edição */}
                        {isEditMode && (
                          <button
                            onClick={() => onAddItem(pi, di)}
                            className="w-full text-center text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded py-0.5 transition-colors text-base leading-none"
                            title="Adicionar produção"
                          >
                            +
                          </button>
                        )}

                        {/* Célula vazia sem modo edição */}
                        {day.items.length === 0 && !isEditMode && (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
