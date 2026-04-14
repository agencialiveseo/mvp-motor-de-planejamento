import { useState, useMemo } from 'react';
import type { DemandItem, DistributionResult, PilotSchedule, AllocationItem, ProductionType } from '../types';
import { MONTH_NAMES } from '../utils/dates';
import { PRODUCTION_LABELS, UP_CONSTANTS } from '../constants/productions';
import CalendarGrid from './CalendarGrid';
import EditModal from './EditModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generatePilotWorkbook } from '../utils/exportExcel';


interface Props {
  result: DistributionResult;
  demandItems: DemandItem[];
  month: number;
  year: number;
  onBack: () => void;
}

type ModalState =
  | { open: false }
  | { open: true; isNew: true; pilotIdx: number; dayIdx: number }
  | { open: true; isNew: false; pilotIdx: number; dayIdx: number; itemIdx: number };

function deepCopySchedules(schedules: PilotSchedule[]): PilotSchedule[] {
  return schedules.map((s) => ({
    ...s,
    days: s.days.map((d) => ({
      ...d,
      items: d.items.map((i) => ({ ...i })),
    })),
  }));
}

function recomputeDayUP(day: { items: AllocationItem[]; totalUP: number }): void {
  day.totalUP = day.items.reduce((s, i) => s + i.up, 0);
}
export default function StepPlanning({ result, demandItems, month, year, onBack }: Props) {
  const [mutableSchedules, setMutableSchedules] = useState(() => deepCopySchedules(result.schedules));
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [isExporting, setIsExporting] = useState(false);

  const { workdays, unassignedItems, idlePilots, totalDemandUP, coveragePercent, status, diffUP, directionalStats } = result;

  // Pilot Filter State (Initially all selected)
  const [selectedPilotIds, setSelectedPilotIds] = useState<Set<string>>(() =>
    new Set(result.schedules.map((s) => s.pilot.id))
  );

  const freeWeekStartIdx = Math.max(0, workdays.length - 5);

  const totalAllocatedUP = useMemo(
    () => mutableSchedules.reduce((s, sch) => s + sch.days.reduce((s2, d) => s2 + d.totalUP, 0), 0),
    [mutableSchedules],
  );

  const totalCapacityUP = useMemo(
    () => mutableSchedules.reduce((s, sch) => s + sch.pilot.targetUP * workdays.length, 0),
    [mutableSchedules, workdays.length],
  );

  const monthlyAvgUP = workdays.length > 0 && mutableSchedules.length > 0
    ? totalAllocatedUP / (mutableSchedules.length * workdays.length)
    : 0;

  const avgTargetUP = mutableSchedules.length > 0
    ? mutableSchedules.reduce((s, sch) => s + sch.pilot.targetUP, 0) / mutableSchedules.length
    : 4;

  const clients = useMemo(() => {
    const set = new Set<string>();
    demandItems.forEach((i) => { if (i.client) set.add(i.client); });
    mutableSchedules.forEach((s) => s.days.forEach((d) => d.items.forEach((i) => set.add(i.client))));
    return [...set].sort();
  }, [demandItems, mutableSchedules]);

  function handleToggleCheck(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleClickItem(pilotIdx: number, dayIdx: number, itemIdx: number) {
    setModal({ open: true, isNew: false, pilotIdx, dayIdx, itemIdx });
  }

  function handleAddItem(pilotIdx: number, dayIdx: number) {
    setModal({ open: true, isNew: true, pilotIdx, dayIdx });
  }

  function handleSave(client: string, type: ProductionType, quantity: number) {
    if (!modal.open) return;
    const up = quantity / UP_CONSTANTS[type];
    const { pilotIdx, dayIdx } = modal;
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const day = next[pilotIdx].days[dayIdx];
      if (modal.isNew) {
        day.items.push({ demandId: '', client, type, quantity, up });
      } else {
        day.items[modal.itemIdx] = { ...day.items[modal.itemIdx], client, type, quantity, up };
      }
      recomputeDayUP(day);
      return next;
    });
    setModal({ open: false });
  }

  function handleDelete() {
    if (!modal.open || modal.isNew) return;
    const { pilotIdx, dayIdx, itemIdx } = modal;
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const day = next[pilotIdx].days[dayIdx];
      day.items.splice(itemIdx, 1);
      recomputeDayUP(day);
      return next;
    });
    setModal({ open: false });
  }

  function handleTogglePilot(pilotId: string) {
    setSelectedPilotIds((prev) => {
      const next = new Set(prev);
      if (next.has(pilotId)) {
        if (next.size > 1) next.delete(pilotId); // At least one must be selected
      } else {
        next.add(pilotId);
      }
      return next;
    });
  }

  function handleMoveItem(fromPilotIdx: number, fromDayIdx: number, fromItemIdx: number, toPilotIdx: number, toDayIdx: number) {
    if (fromPilotIdx === toPilotIdx && fromDayIdx === toDayIdx) return;
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const fromDay = next[fromPilotIdx].days[fromDayIdx];
      const toDay = next[toPilotIdx].days[toDayIdx];

      const [item] = fromDay.items.splice(fromItemIdx, 1);
      toDay.items.push(item);

      recomputeDayUP(fromDay);
      recomputeDayUP(toDay);
      return next;
    });
  }

  async function handleDownloadExcel() {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      let hasFiles = false;

      for (const schedule of mutableSchedules) {
        // Build items list
        const items: any[] = [];
        schedule.days.forEach((day, dayIdx) => {
          day.items.forEach(item => {
            items.push({
              ...item,
              date: workdays[dayIdx]
            });
          });
        });

        if (items.length > 0) {
          const buffer = await generatePilotWorkbook(schedule.pilot.name, items, workdays.length);
          zip.file(`Planejamento_${MONTH_NAMES[month]}_${year}_${schedule.pilot.name}.xlsx`, buffer);
          hasFiles = true;
        }
      }

      if (!hasFiles) {
        alert("Nenhum item alocado para exportar.");
        setIsExporting(false);
        return;
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `Planejamentos_Pilots_${MONTH_NAMES[month]}_${year}.zip`);
    } catch (error) {
      console.error('Erro ao gerar exportação Excel:', error);
      alert('Erro ao gerar arquivos de exportação.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800 mb-1">
            Planejamento — {MONTH_NAMES[month]} {year}
          </h2>
          <p className="text-slate-500">
            {mutableSchedules.length} Pilot{mutableSchedules.length !== 1 ? 's' : ''} · {workdays.length} dias úteis
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={onBack}
            className="text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg font-medium border border-slate-300 hover:border-slate-400 transition-colors text-sm"
          >
            ← Editar demanda
          </button>
          <button
            onClick={handleDownloadExcel}
            disabled={isExporting}
            className="bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
          >
            {isExporting ? '⏳ Processando...' : '↓ Baixar Planilhas (.zip)'}
          </button>
          <button
            onClick={() => window.print()}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-slate-200"
          >
            Imprimir
          </button>
        </div>
      </div>

      {/* Alert cards */}
      <div className="space-y-3 mb-6">
        <div className={`rounded-xl p-4 border ${status === 'balanced'
          ? 'bg-green-50 border-green-200'
          : status === 'excess'
            ? 'bg-red-50 border-red-200'
            : 'bg-blue-50 border-blue-200'
          }`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">
              {status === 'balanced' ? '✅' : status === 'excess' ? '⚠️' : '💡'}
            </span>
            <div>
              <p className={`font-semibold text-base ${status === 'balanced' ? 'text-green-800' : status === 'excess' ? 'text-red-800' : 'text-blue-800'
                }`}>
                {status === 'balanced' && 'Planejamento equilibrado'}
                {status === 'excess' && `Excesso de demanda — ${diffUP.toFixed(2)} UP precisam ser redistribuídas para outro Engineer`}
                {status === 'idle' && `Capacidade ociosa — ${diffUP.toFixed(2)} UP disponíveis para ajudar outra equipe`}
              </p>
              <p className={`text-sm mt-1 ${status === 'balanced' ? 'text-green-700' : status === 'excess' ? 'text-red-700' : 'text-blue-700'
                }`}>
                {status === 'balanced' && `100% da demanda alocada. Média mensal: ${monthlyAvgUP.toFixed(2)} UP/dia.`}
                {status === 'excess' && `Demanda: ${totalDemandUP.toFixed(2)} UP · Capacidade: ${totalCapacityUP.toFixed(0)} UP · Cobertura: ${coveragePercent.toFixed(1)}%`}
                {status === 'idle' && `Média mensal: ${monthlyAvgUP.toFixed(2)} UP/dia · Demanda: ${totalDemandUP.toFixed(2)} UP`}
              </p>
            </div>
          </div>
        </div>

        {idlePilots.length > 0 && (
          <div className="rounded-xl p-4 border bg-yellow-50 border-yellow-200 no-print">
            <div className="flex items-start gap-3">
              <span className="text-xl">📋</span>
              <div>
                <p className="text-sm font-semibold text-yellow-800">
                  Pilots com dias sem conteúdo — Engineer, busque produções para preencher!
                </p>
                <div className="mt-2 text-sm text-yellow-700 space-y-1">
                  {idlePilots.map((p, i) => (
                    <div key={i}>
                      <strong>{p.name}:</strong> {p.emptyDays} dia{p.emptyDays !== 1 ? 's' : ''} sem produção planejada
                      {' '}(planejado {p.planned.toFixed(1)} UP / meta {p.target.toFixed(1)} UP)
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {unassignedItems.length > 0 && (
          <UnassignedTable items={unassignedItems} />
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <MetricCard
          label="Demanda total"
          value={`${totalDemandUP.toFixed(2)} UP`}
          sub={`${mutableSchedules.flatMap((s) => s.days.flatMap((d) => d.items)).length} alocações`}
        />
        <MetricCard
          label="Capacidade total"
          value={`${totalCapacityUP.toFixed(0)} UP`}
          sub={mutableSchedules.map((s) => `${s.pilot.name}: ${s.pilot.targetUP} UP/dia`).join(' · ')}
        />
        <MetricCard
          label="Média mensal / Pilot"
          value={`${monthlyAvgUP.toFixed(2)} UP/dia`}
          highlight={monthlyAvgUP >= avgTargetUP - 0.01}
          sub={monthlyAvgUP >= avgTargetUP - 0.01
            ? `≥ meta média de ${avgTargetUP.toFixed(1)} UP/dia ✓`
            : `abaixo da meta média de ${avgTargetUP.toFixed(1)} UP/dia`}
        />
        <MetricCard
          label="Cobertura da demanda"
          value={`${coveragePercent.toFixed(1)}%`}
          highlight={coveragePercent >= 99.9}
          sub={coveragePercent >= 99.9
            ? '100% alocado'
            : `${(totalDemandUP * (1 - coveragePercent / 100)).toFixed(2)} UP não alocadas`}
        />
        <MetricCard
          label="Direcionais Ocupados"
          value={`${directionalStats.obeyed} de ${directionalStats.requested}`}
          highlight={directionalStats.requested > 0 && directionalStats.overflowed === 0}
          sub={directionalStats.overflowed > 0
            ? `${directionalStats.overflowed} transbordaram semana`
            : directionalStats.requested === 0 ? 'Nenhum solicitado' : '100% no prazo certo'}
        />
      </div>

      {/* Legenda */}
      <div className="flex gap-4 mb-4 text-xs text-slate-600 no-print">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>≥ meta UP/dia</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-300" />
          <span>&lt; meta UP/dia</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-purple-100 border border-purple-300" />
          <span>Semana livre (últimos 5 dias)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3 rounded bg-orange-400" />
          <span className="text-orange-600">Redirecionado (Sem preferência)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3 rounded bg-red-400" />
          <span className="text-red-600">Atrasado (Passou da semana pedida)</span>
        </div>
        <span className="text-slate-400 ml-2">
          Cores são informativas — validade determinada pela média mensal
        </span>
      </div>

      {/* Filtro de Pilots */}
      <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm no-print">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Filtro de Pilots na Grade</h3>
        <div className="flex flex-wrap gap-2">
          {mutableSchedules.map((sch) => {
            const isSelected = selectedPilotIds.has(sch.pilot.id);
            return (
              <label
                key={sch.pilot.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors text-sm font-medium ${isSelected
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
              >
                <input
                  type="checkbox"
                  className="accent-blue-600 w-4 h-4"
                  checked={isSelected}
                  onChange={() => handleTogglePilot(sch.pilot.id)}
                />
                {sch.pilot.name}
              </label>
            );
          })}
        </div>
      </div>

      {/* Grade em Calendário */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-8">
        <CalendarGrid
          schedules={mutableSchedules}
          freeWeekStartIdx={freeWeekStartIdx}
          checkedItems={checkedItems}
          onToggleCheck={handleToggleCheck}
          onClickItem={handleClickItem}
          onAddItem={handleAddItem}
          onMoveItem={handleMoveItem}
          selectedPilotIds={selectedPilotIds}
          year={year}
          month={month}
        />
      </div>

      {/* Tabela UP/dia por Pilot */}

      <UPPerDayTable schedules={mutableSchedules} workdays={workdays} />

      {/* Modal de edição */}
      {modal.open && (
        <EditModal
          clients={clients}
          initialClient={modal.isNew
            ? ''
            : mutableSchedules[modal.pilotIdx].days[modal.dayIdx].items[modal.itemIdx].client}
          initialType={modal.isNew
            ? undefined
            : mutableSchedules[modal.pilotIdx].days[modal.dayIdx].items[modal.itemIdx].type}
            isNew={modal.isNew}
          onSave={handleSave}
          onDelete={modal.isNew ? undefined : handleDelete}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border shadow-sm ${highlight ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-green-700' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function UnassignedTable({ items }: { items: AllocationItem[] }) {
  const needsRedirect = items.filter(i => !i.missedDirectional);
  const missedWeek = items.filter(i => i.missedDirectional);

  function ItemTable({ rows, borderColor, bgColor, headerColor, rowEvenBg, rowOddBg }: {
    rows: AllocationItem[];
    borderColor: string; bgColor: string; headerColor: string;
    rowEvenBg: string; rowOddBg: string;
  }) {
    const grouped = Object.values(
      rows.reduce<Record<string, { client: string; type: AllocationItem['type']; totalUP: number; count: number }>>(
        (acc, w) => {
          const key = `${w.client}||${w.type}`;
          if (!acc[key]) {
            acc[key] = { client: w.client, type: w.type, totalUP: 0, count: 0 };
          }
          acc[key].totalUP += w.up;
          acc[key].count += 1;
          return acc;
        },
        {},
      ),
    ).sort((a, b) => a.client.localeCompare(b.client) || a.type.localeCompare(b.type));

    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className={`border-b ${borderColor} ${bgColor}`}>
              <th className={`text-left px-4 py-2 font-semibold ${headerColor}`}>Cliente</th>
              <th className={`text-left px-3 py-2 font-semibold ${headerColor}`}>Tipo</th>
              <th className={`text-center px-3 py-2 font-semibold ${headerColor}`}>Qtd</th>
              <th className={`text-right px-3 py-2 font-semibold ${headerColor}`}>UP total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((w, i) => (
              <tr key={i} className={`border-b ${borderColor} ${i % 2 === 0 ? rowEvenBg : rowOddBg}`}>
                <td className="px-4 py-2 font-medium text-slate-800">{w.client}</td>
                <td className="px-3 py-2 text-slate-600">{PRODUCTION_LABELS[w.type]}</td>
                <td className="px-3 py-2 text-center font-mono text-slate-500">
                  {w.count > 1 ? (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-xs min-w-[1.5rem]">
                      {w.count}×
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">{w.totalUP.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {needsRedirect.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200">
            <span className="text-lg">🔀</span>
            <p className="text-sm font-semibold text-red-800">
              {needsRedirect.length} produção{needsRedirect.length !== 1 ? 'ões' : ''} para redirecionar — pilot preferencial sem capacidade
            </p>
          </div>
          <ItemTable rows={needsRedirect}
            borderColor="border-red-100" bgColor="bg-red-100/50"
            headerColor="text-red-700" rowEvenBg="bg-white/60" rowOddBg="bg-red-50/40" />
        </div>
      )}
      {missedWeek.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-200">
            <span className="text-lg">📅</span>
            <p className="text-sm font-semibold text-orange-800">
              {missedWeek.length} produção{missedWeek.length !== 1 ? 'ões' : ''} fora da semana preferencial — Engineer, realoque manualmente
            </p>
          </div>
          <ItemTable rows={missedWeek}
            borderColor="border-orange-100" bgColor="bg-orange-100/50"
            headerColor="text-orange-700" rowEvenBg="bg-white/60" rowOddBg="bg-orange-50/40" />
        </div>
      )}

    </div>
  );
}

function UPPerDayTable({
  schedules,
  workdays,
}: {
  schedules: PilotSchedule[];
  workdays: Date[];
}) {
  const [open, setOpen] = useState(true);

  const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden no-print">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-700">📊 UP planejadas por dia · por Pilot</span>
        <span className="text-slate-400 text-xs">{open ? '▲ Recolher' : '▼ Expandir'}</span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="sticky left-0 bg-white px-4 py-2 text-left font-semibold text-slate-600 min-w-[120px] border-r border-slate-100">
                  Pilot
                </th>
                {workdays.map((d, i) => (
                  <th
                    key={i}
                    className="px-1.5 py-2 text-center font-medium text-slate-500 min-w-[42px]"
                  >
                    <div>{DAY_NAMES[d.getDay()]}</div>
                    <div className="text-slate-400 font-normal">{d.getDate()}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-slate-600 border-l border-slate-100 min-w-[80px]">
                  Média/dia
                </th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600 min-w-[60px]">
                  Meta
                </th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((sch) => {
                const target = sch.pilot.targetUP;
                const totalUP = sch.days.reduce((s, d) => s + d.totalUP, 0);
                const avg = workdays.length > 0 ? totalUP / workdays.length : 0;
                const hitsTarget = avg >= target - 0.01;
                return (
                  <tr key={sch.pilot.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="sticky left-0 bg-white px-4 py-2 font-medium text-slate-700 border-r border-slate-100">
                      {sch.pilot.name}
                      <div className="text-slate-400 font-normal">meta: {target} UP/dia</div>
                    </td>
                    {sch.days.map((day, di) => {
                      const up = day.totalUP;
                      const overTarget = up >= target - 0.01;
                      const isEmpty = up < 0.01;
                      const cellBg = isEmpty
                        ? 'bg-slate-50 text-slate-300'
                        : overTarget
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-600';
                      return (
                        <td key={di} className={`px-1 py-2 text-center font-mono ${cellBg}`}>
                          {isEmpty ? '—' : up.toFixed(1)}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right font-mono font-semibold border-l border-slate-100 ${hitsTarget ? 'text-green-700' : 'text-red-600'
                      }`}>
                      {avg.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {hitsTarget
                        ? <span className="text-green-600 font-bold">✓</span>
                        : <span className="text-red-500 font-bold">✗</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
