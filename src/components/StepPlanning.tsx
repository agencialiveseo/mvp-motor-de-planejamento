import { useState, useMemo, useEffect, useCallback } from 'react';
import type { DemandItem, DistributionResult, PilotSchedule, AllocationItem, ProductionType } from '../types';
import { MONTH_NAMES } from '../utils/dates';
import { PRODUCTION_LABELS, UP_CONSTANTS } from '../constants/productions';
import CalendarGrid from './CalendarGrid';
import EditModal from './EditModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generatePilotWorkbook } from '../utils/exportExcel';

const LEGEND_ITEMS: { label: string; type: ProductionType }[] = [
  { label: 'Blogpost', type: 'blogpost_produce' },
  { label: 'Categoria', type: 'category_produce' },
  { label: 'Descrição', type: 'product_description_produce' },
  { label: 'SERP', type: 'serp_produce' },
  { label: 'Plan. Blog', type: 'blogpost_plan' },
  { label: 'Plan. Cat.', type: 'category_plan' },
  { label: 'Plan. Desc.', type: 'product_description_plan' },
  { label: 'Tarefas', type: 'tarefas' },
  { label: 'Aj. Post', type: 'ajuste_post' },
  { label: 'Aj. Cat.', type: 'ajuste_cat' },
  { label: 'Aj. SERP', type: 'ajuste_serp' },
];


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

type SwapModalState =
  | { open: false }
  | { open: true; incomingClient: string; incomingType: AllocationItem['type']; incomingCount: number; incomingUP: number };

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
  const [localUnassigned, setLocalUnassigned] = useState<AllocationItem[]>(() => [...result.unassignedItems]);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [isExporting, setIsExporting] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simQty, setSimQty] = useState<Record<string, number>>({
    blogpost_produce: 0, category_produce: 0, product_description_produce: 0,
    serp_produce: 0, blogpost_plan: 0, category_plan: 0,
  });
  const [swapModal, setSwapModal] = useState<SwapModalState>({ open: false });
  const [swapCedenteKey, setSwapCedenteKey] = useState('');
  const [swapQty, setSwapQty] = useState(1);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  const { workdays, idlePilots, totalDemandUP, coveragePercent, status, diffUP, directionalStats } = result;

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
    () => mutableSchedules.reduce((s, sch) => s + sch.pilot.minUP * workdays.length, 0),
    [mutableSchedules, workdays.length],
  );

  const monthlyAvgUP = workdays.length > 0 && mutableSchedules.length > 0
    ? totalAllocatedUP / (mutableSchedules.length * workdays.length)
    : 0;

  const avgTargetUP = mutableSchedules.length > 0
    ? mutableSchedules.reduce((s, sch) => s + sch.pilot.minUP, 0) / mutableSchedules.length
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

  function handleSave(client: string, type: ProductionType, quantity: number, note: string) {
    if (!modal.open) return;
    const up = quantity / UP_CONSTANTS[type];
    const { pilotIdx, dayIdx } = modal;
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const day = next[pilotIdx].days[dayIdx];
      if (modal.isNew) {
        day.items.push({ demandId: '', client, type, quantity, up, note: note || undefined });
      } else {
        day.items[modal.itemIdx] = { ...day.items[modal.itemIdx], client, type, quantity, up, note: note || undefined };
      }
      recomputeDayUP(day);
      return next;
    });
    setModal({ open: false });
  }

  function handleEditNote(pilotIdx: number, dayIdx: number, itemIdx: number, note: string) {
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const item = next[pilotIdx].days[dayIdx].items[itemIdx];
      item.note = note || undefined;
      return next;
    });
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

  const showToast = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const allocatedGroups = useMemo(() => {
    const map: Record<string, { client: string; type: ProductionType; count: number; totalUP: number }> = {};
    mutableSchedules.forEach((sch) => {
      sch.days.forEach((day) => {
        day.items.forEach((item) => {
          const key = `${item.client}||${item.type}`;
          if (!map[key]) map[key] = { client: item.client, type: item.type, count: 0, totalUP: 0 };
          map[key].count++;
          map[key].totalUP += item.up;
        });
      });
    });
    return Object.entries(map).map(([key, v]) => ({ key, ...v }));
  }, [mutableSchedules]);

  function openSwapModal(client: string, type: AllocationItem['type'], count: number, totalUP: number) {
    setSwapModal({ open: true, incomingClient: client, incomingType: type, incomingCount: count, incomingUP: totalUP });
    setSwapCedenteKey('');
    setSwapQty(1);
  }

  function confirmSwap() {
    if (!swapModal.open || !swapCedenteKey) return;
    const cedente = allocatedGroups.find(g => g.key === swapCedenteKey);
    if (!cedente) return;
    const qty = Math.min(swapQty, cedente.count, swapModal.incomingCount);

    // Collect notes from unassigned items (incoming → going into calendar)
    const incomingNotes = localUnassigned
      .filter(it => it.client === swapModal.incomingClient && it.type === swapModal.incomingType)
      .map(it => it.note ?? '');

    // Collect notes from scheduled items (cedente → going back to unassigned)
    const cedenteNotes: string[] = [];
    let cedenteFound = 0;
    for (const sch of mutableSchedules) {
      for (const day of sch.days) {
        for (let i = day.items.length - 1; i >= 0 && cedenteFound < qty; i--) {
          if (`${day.items[i].client}||${day.items[i].type}` === swapCedenteKey) {
            cedenteNotes.push(day.items[i].note ?? '');
            cedenteFound++;
          }
        }
      }
    }

    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      let replaced = 0;
      for (const sch of next) {
        for (const day of sch.days) {
          for (let i = day.items.length - 1; i >= 0 && replaced < qty; i--) {
            const it = day.items[i];
            if (`${it.client}||${it.type}` === swapCedenteKey) {
              const incomingUpUnit = swapModal.incomingUP / swapModal.incomingCount;
              const note = incomingNotes[replaced] || undefined;
              day.items.splice(i, 1, {
                demandId: `swapped-${Date.now()}-${replaced}`,
                client: swapModal.incomingClient,
                type: swapModal.incomingType,
                quantity: 1,
                up: incomingUpUnit,
                note,
              });
              recomputeDayUP(day);
              replaced++;
            }
          }
        }
      }
      return next;
    });

    setLocalUnassigned((prev) => {
      const next = [...prev];
      let removedIncoming = 0;
      for (let i = next.length - 1; i >= 0 && removedIncoming < qty; i--) {
        if (next[i].client === swapModal.incomingClient && next[i].type === swapModal.incomingType) {
          next.splice(i, 1);
          removedIncoming++;
        }
      }
      for (let j = 0; j < qty; j++) {
        next.push({ demandId: `unassigned-${Date.now()}-${j}`, client: cedente.client, type: cedente.type, quantity: 1, up: cedente.totalUP / cedente.count, note: cedenteNotes[j] || undefined });
      }
      return next;
    });

    setSwapModal({ open: false });
    showToast(`${qty} unidade(s) trocada(s)! As demandas retiradas estão na lista de não-alocadas.`);
  }

  function handleSwapDays(pilotIdx: number, fromDay: number, toDay: number) {
    setMutableSchedules((prev) => {
      const next = deepCopySchedules(prev);
      const pilot = next[pilotIdx];
      const tempItems = pilot.days[fromDay].items;
      const tempUP = pilot.days[fromDay].totalUP;
      pilot.days[fromDay].items = pilot.days[toDay].items;
      pilot.days[fromDay].totalUP = pilot.days[toDay].totalUP;
      pilot.days[toDay].items = tempItems;
      pilot.days[toDay].totalUP = tempUP;
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
      {/* Toast global */}
      {toast && (
        <div key={toast.id} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-3 max-w-md">
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

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
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold text-base ${status === 'balanced' ? 'text-green-800' : status === 'excess' ? 'text-red-800' : 'text-blue-800'}`}>
                    {status === 'balanced' && 'Planejamento equilibrado'}
                    {status === 'excess' && `Excesso de demanda — ${diffUP.toFixed(2)} UP precisam ser redistribuídas para outro Engineer`}
                    {status === 'idle' && `Capacidade ociosa — ${diffUP.toFixed(2)} UP disponíveis para ajudar outra equipe`}
                  </p>
                  <p className={`text-sm mt-1 ${status === 'balanced' ? 'text-green-700' : status === 'excess' ? 'text-red-700' : 'text-blue-700'}`}>
                    {status === 'balanced' && `100% da demanda alocada. Média mensal: ${monthlyAvgUP.toFixed(2)} UP/dia.`}
                    {status === 'excess' && `Demanda: ${totalDemandUP.toFixed(2)} UP · Capacidade: ${totalCapacityUP.toFixed(0)} UP · Cobertura: ${coveragePercent.toFixed(1)}%`}
                    {status === 'idle' && `Média mensal: ${monthlyAvgUP.toFixed(2)} UP/dia · Demanda: ${totalDemandUP.toFixed(2)} UP`}
                  </p>
                </div>
                {status === 'idle' && (
                  <button
                    onClick={() => setShowSimulator(s => !s)}
                    className="flex-shrink-0 text-sm font-medium px-4 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
                  >
                    {showSimulator ? '– Fechar simulador' : '+ Simular o que cabe'}
                  </button>
                )}
              </div>
              {status === 'idle' && showSimulator && (() => {
                const SIM_TYPES = [
                  { key: 'blogpost_produce', label: 'Blogpost', divisor: 1.5 },
                  { key: 'category_produce', label: 'Categoria', divisor: 1.67 },
                  { key: 'product_description_produce', label: 'Descrição', divisor: 1.79 },
                  { key: 'serp_produce', label: 'SERP', divisor: 135 },
                  { key: 'blogpost_plan', label: 'Plan. blog', divisor: 5.73 },
                  { key: 'category_plan', label: 'Plan. cat.', divisor: 9.28 },
                ];
                const simTotal = SIM_TYPES.reduce((s, t) => s + (simQty[t.key] || 0) / t.divisor, 0);
                const pct = Math.min(100, (simTotal / diffUP) * 100);
                const remaining = diffUP - simTotal;
                return (
                  <div className="mt-4 border-t border-blue-200 pt-4">
                    <p className="text-xs text-blue-700 mb-3">Simule quantas produções cabem na folga disponível:</p>
                    <div className="grid grid-cols-6 gap-2 mb-4">
                      {SIM_TYPES.map(t => (
                        <div key={t.key} className="flex flex-col items-center gap-1">
                          <label className="text-[11px] font-semibold text-slate-500 text-center leading-tight">{t.label}</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={simQty[t.key] || 0}
                            onChange={(e) => setSimQty(prev => ({ ...prev, [t.key]: Math.max(0, Number(e.target.value)) }))}
                            className="w-full text-center border border-blue-200 rounded-md px-1 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm font-semibold mb-1">
                      <span className={simTotal > diffUP ? 'text-red-600' : 'text-blue-800'}>
                        Total simulado: {simTotal.toFixed(2)} UP
                      </span>
                      <span className="text-blue-700">Folga disponível: {diffUP.toFixed(2)} UP</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden mb-1">
                      <div
                        className={`h-2 rounded-full transition-all ${simTotal > diffUP ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={simTotal > diffUP ? 'text-red-500 font-medium' : 'text-slate-500'}>
                        {pct.toFixed(0)}% da folga utilizada
                      </span>
                      <span className={remaining < 0 ? 'text-red-600 font-semibold' : 'text-blue-700 font-medium'}>
                        {remaining >= 0 ? `Sobram ${remaining.toFixed(2)} UP` : `Excede em ${Math.abs(remaining).toFixed(2)} UP`}
                      </span>
                    </div>
                  </div>
                );
              })()}
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

        {localUnassigned.length > 0 && (
          <UnassignedTable items={localUnassigned} onSwap={openSwapModal} />
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
          sub={mutableSchedules.map((s) => `${s.pilot.name}: ${s.pilot.minUP}–${s.pilot.maxUP} UP/dia`).join(' · ')}
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
          label="Priorizados Alocados"
          value={`${directionalStats.obeyed} de ${directionalStats.requested}`}
          highlight={directionalStats.requested > 0 && directionalStats.overflowed === 0}
          sub={directionalStats.overflowed > 0
            ? `${directionalStats.overflowed} não couberam na janela de prioridade`
            : directionalStats.requested === 0 ? 'Nenhum solicitado' : '100% dentro da janela'}
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

      {/* Legenda de UPs */}
      <ProductionLegend />

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
          onSwapDays={handleSwapDays}
          onEditNote={handleEditNote}
          selectedPilotIds={selectedPilotIds}
          year={year}
          month={month}
        />
      </div>

      {/* Tabela UP/dia por Pilot */}
      <UPPerDayTable schedules={mutableSchedules} workdays={workdays} />

      {/* Modal de edição */}
      {swapModal.open && (
        <SwapModal
          incoming={swapModal}
          allocatedGroups={allocatedGroups}
          cedenteKey={swapCedenteKey}
          swapQty={swapQty}
          onSelectCedente={setSwapCedenteKey}
          onChangeQty={setSwapQty}
          onConfirm={confirmSwap}
          onClose={() => setSwapModal({ open: false })}
        />
      )}

      {modal.open && (
        <EditModal
          clients={clients}
          initialClient={modal.isNew
            ? ''
            : mutableSchedules[modal.pilotIdx].days[modal.dayIdx].items[modal.itemIdx].client}
          initialType={modal.isNew
            ? undefined
            : mutableSchedules[modal.pilotIdx].days[modal.dayIdx].items[modal.itemIdx].type}
          initialNote={modal.isNew
            ? ''
            : mutableSchedules[modal.pilotIdx].days[modal.dayIdx].items[modal.itemIdx].note ?? ''}
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

function UnassignedTable({
  items,
  onSwap,
}: {
  items: AllocationItem[];
  onSwap: (client: string, type: AllocationItem['type'], count: number, totalUP: number) => void;
}) {
  const displacedItems = items.filter(i => i.displacedByHighPriority);
  const needsRedirect = items.filter(i => !i.missedDirectional && !i.displacedByHighPriority);
  const missedWeek = items.filter(i => i.missedDirectional && !i.displacedByHighPriority);

  function ItemTable({ rows, borderColor, bgColor, headerColor, rowEvenBg, rowOddBg, showSwap }: {
    rows: AllocationItem[];
    borderColor: string; bgColor: string; headerColor: string;
    rowEvenBg: string; rowOddBg: string;
    showSwap?: boolean;
  }) {
    const grouped = Object.values(
      rows.reduce<Record<string, { client: string; type: AllocationItem['type']; totalUP: number; count: number }>>(
        (acc, w) => {
          const key = `${w.client}||${w.type}`;
          if (!acc[key]) acc[key] = { client: w.client, type: w.type, totalUP: 0, count: 0 };
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
              {showSwap && <th className={`text-center px-3 py-2 font-semibold ${headerColor}`}>Ação</th>}
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
                {showSwap && (
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => onSwap(w.client, w.type, w.count, w.totalUP)}
                      className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 font-semibold px-2 py-0.5 rounded transition-colors"
                      title="Trocar com um grupo alocado"
                    >
                      ↔ Trocar
                    </button>
                  </td>
                )}
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
            <p className="text-sm font-semibold text-red-800 flex-1">
              {needsRedirect.length} produção{needsRedirect.length !== 1 ? 'ões' : ''} para redirecionar — pilot preferencial sem capacidade
            </p>
          </div>
          <ItemTable rows={needsRedirect}
            borderColor="border-red-100" bgColor="bg-red-100/50"
            headerColor="text-red-700" rowEvenBg="bg-white/60" rowOddBg="bg-red-50/40" showSwap />
        </div>
      )}
      {missedWeek.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-200">
            <span className="text-lg">📅</span>
            <p className="text-sm font-semibold text-orange-800 flex-1">
              {missedWeek.length} produção{missedWeek.length !== 1 ? 'ões' : ''} fora da janela de prioridade — Engineer, realoque manualmente
            </p>
          </div>
          <ItemTable rows={missedWeek}
            borderColor="border-orange-100" bgColor="bg-orange-100/50"
            headerColor="text-orange-700" rowEvenBg="bg-white/60" rowOddBg="bg-orange-50/40" showSwap />
        </div>
      )}
      {displacedItems.length > 0 && (
        <div className="rounded-xl border border-orange-300 bg-orange-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-orange-200">
            <span className="text-lg">🔄</span>
            <p className="text-sm font-semibold text-orange-900 flex-1">
              {displacedItems.length} produção{displacedItems.length !== 1 ? 'ões' : ''} deslocadas por prioridade Alta
            </p>
            <span className="text-xs font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full flex-shrink-0">
              Deslocado por Alta
            </span>
          </div>
          <ItemTable rows={displacedItems}
            borderColor="border-orange-200" bgColor="bg-orange-100/60"
            headerColor="text-orange-800" rowEvenBg="bg-white/60" rowOddBg="bg-orange-50/40" showSwap />
        </div>
      )}
    </div>
  );
}

// ─── SwapModal ────────────────────────────────────────────────────────────────

function SwapModal({
  incoming, allocatedGroups, cedenteKey, swapQty,
  onSelectCedente, onChangeQty, onConfirm, onClose,
}: {
  incoming: Extract<SwapModalState, { open: true }>;
  allocatedGroups: { key: string; client: string; type: ProductionType; count: number; totalUP: number }[];
  cedenteKey: string;
  swapQty: number;
  onSelectCedente: (key: string) => void;
  onChangeQty: (qty: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cedente = allocatedGroups.find(g => g.key === cedenteKey);
  const maxQty = Math.min(cedente?.count ?? 1, incoming.incomingCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">↔ Trocar Produções</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Grupo entrante (não-alocado)</p>
            <p className="font-semibold text-slate-800">{incoming.incomingClient}</p>
            <p className="text-sm text-slate-600">{PRODUCTION_LABELS[incoming.incomingType]}</p>
            <p className="text-xs text-slate-500 mt-1">{incoming.incomingCount} unidade(s) · {incoming.incomingUP.toFixed(2)} UP</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Selecione o grupo cedente (alocado)</p>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {allocatedGroups.length === 0 && (
                <p className="text-sm text-slate-400 p-3 text-center">Nenhum grupo alocado disponível.</p>
              )}
              {allocatedGroups.map((g) => (
                <label key={g.key} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${g.key === cedenteKey ? 'bg-blue-50' : ''}`}>
                  <input type="radio" name="cedente" checked={g.key === cedenteKey}
                    onChange={() => { onSelectCedente(g.key); onChangeQty(1); }} className="accent-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{g.client}</p>
                    <p className="text-xs text-slate-500">{PRODUCTION_LABELS[g.type]}</p>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{g.count}× · {g.totalUP.toFixed(2)} UP</span>
                </label>
              ))}
            </div>
          </div>
          {cedenteKey && (
            <div className="flex items-center gap-4 bg-slate-50 rounded-lg p-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-600 mb-1">Quantidade a trocar (máx: {maxQty})</p>
                <input type="number" min={1} max={maxQty} value={swapQty}
                  onChange={(e) => onChangeQty(Math.min(maxQty, Math.max(1, Number(e.target.value))))}
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="text-xs text-slate-600 space-y-1 text-right">
                <p><span className="text-red-500 font-semibold">−{swapQty}</span> de {cedente?.client}</p>
                <p><span className="text-green-600 font-semibold">+{Math.min(swapQty, incoming.incomingCount)}</span> de {incoming.incomingClient}</p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 text-sm font-medium transition-colors">
              Cancelar
            </button>
            <button onClick={onConfirm} disabled={!cedenteKey}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
              Confirmar troca
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function ProductionLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 no-print">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white transition-colors shadow-sm"
      >
        <span>📊</span>
        <span className="font-medium">Legenda de UPs por produção</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex flex-wrap gap-2">
            {LEGEND_ITEMS.map(({ label, type }) => {
              const divisor = UP_CONSTANTS[type];
              const up = isFinite(divisor) ? (1 / divisor) : null;
              return (
                <div
                  key={type}
                  className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
                >
                  <span className="text-xs font-semibold text-slate-700">{label}</span>
                  <span className="text-slate-300">·</span>
                  {up !== null ? (
                    <span className="text-xs font-mono font-bold text-blue-600">{up.toFixed(3)} UP/un</span>
                  ) : (
                    <span className="text-xs font-mono text-slate-400">sem peso</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">UP = quantidade ÷ constante. Tipos marcados como "sem peso" são registrados mas não impactam métricas de capacidade.</p>
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
                const minUP = sch.pilot.minUP;
                const totalUP = sch.days.reduce((s, d) => s + d.totalUP, 0);
                const avg = workdays.length > 0 ? totalUP / workdays.length : 0;
                const hitsTarget = avg >= minUP - 0.01;
                return (
                  <tr key={sch.pilot.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="sticky left-0 bg-white px-4 py-2 font-medium text-slate-700 border-r border-slate-100">
                      {sch.pilot.name}
                      <div className="text-slate-400 font-normal">mín: {minUP} · máx: {sch.pilot.maxUP} UP/dia</div>
                    </td>
                    {sch.days.map((day, di) => {
                      const up = day.totalUP;
                      const overTarget = up >= minUP - 0.01;
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
