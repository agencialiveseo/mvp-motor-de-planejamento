import { useRef, useState } from 'react';
import type { DemandItem, Pilot, ProductionType, Priority } from '../types';
import { PRIORITY_OPTIONS, PRIORITY_LABELS } from '../types';
import { PRODUCTION_LABELS, PRODUCTION_TYPES, calcUP } from '../constants/productions';
import { getWorkdays, MONTH_NAMES } from '../utils/dates';

interface Props {
  demandItems: DemandItem[];
  pilots: Pilot[];
  month: number;
  year: number;
  onDemandChange: (items: DemandItem[]) => void;
  onBack: () => void;
  onGenerate: () => void;
}

const MAX_PILOTS = 4;

function newItem(index: number): DemandItem {
  return { id: crypto.randomUUID(), client: '', type: 'blogpost_produce', quantity: 1, remainingQty: 1, upPerUnit: 1, originalIndex: index, preferredPilotIds: [], priority: null, note: '' };
}

/** Normalise a production type string from CSV (label or key). */
function parseProductionType(raw: string): ProductionType | null {
  const trimmed = raw.trim();
  if (PRODUCTION_TYPES.includes(trimmed as ProductionType)) return trimmed as ProductionType;
  const byLabel = PRODUCTION_TYPES.find(
    (t) => PRODUCTION_LABELS[t].toLowerCase() === trimmed.toLowerCase(),
  );
  return byLabel ?? null;
}

/** Download a string as a file. */
function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Multi-pilot checkbox dropdown for one demand row. */
function PilotMultiSelect({
  pilots,
  selectedIds,
  onChange,
}: {
  pilots: Pilot[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const label =
    selectedIds.length === 0
      ? 'Qualquer'
      : pilots
        .filter((p) => selectedIds.includes(p.id))
        .map((p) => p.name)
        .join(', ');

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      if (selectedIds.length >= MAX_PILOTS) return; // max 4
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left border border-slate-200 rounded px-2 py-1 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm truncate"
      >
        <span className={selectedIds.length === 0 ? 'text-slate-400' : ''}>{label}</span>
        <span className="float-right text-slate-400 ml-1">▾</span>
      </button>

      {open && (
        <>
          {/* Overlay to close dropdown */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 left-0 min-w-max bg-white border border-slate-200 rounded-lg shadow-lg py-1">
            {pilots.map((p) => {
              const checked = selectedIds.includes(p.id);
              const disabled = !checked && selectedIds.length >= MAX_PILOTS;
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(p.id)}
                    className="accent-blue-600"
                  />
                  {p.name}
                </label>
              );
            })}
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:text-red-500 hover:bg-slate-50 border-t border-slate-100 mt-0.5"
              >
                Limpar seleção
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function StepDemand({
  demandItems, pilots, month, year,
  onDemandChange, onBack, onGenerate,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(() => new Set());

  function toggleNote(id: string) {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const workdays = getWorkdays(year, month);
  const totalDemandUP = demandItems.reduce((sum, i) => sum + calcUP(i.type, i.quantity), 0);
  const totalCapacityUP = pilots.reduce((s, p) => s + p.minUP * workdays.length, 0);
  const diff = totalCapacityUP - totalDemandUP;
  const monthlyAvgPerPilot =
    workdays.length > 0 && pilots.length > 0
      ? totalDemandUP / (workdays.length * pilots.length)
      : 0;
  const avgTargetUP =
    pilots.length > 0 ? pilots.reduce((s, p) => s + p.minUP, 0) / pilots.length : 4;

  function updateItem(id: string, changes: Partial<DemandItem>) {
    onDemandChange(demandItems.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
  function removeItem(id: string) {
    onDemandChange(demandItems.filter((item) => item.id !== id));
  }
  function addItem() {
    onDemandChange([...demandItems, newItem(demandItems.length)]);
  }

  // ── CSV template download ─────────────────────────────────────────────────
  function downloadTemplate() {
    const header = 'cliente,tipo,quantidade,pilots_preferenciais,prioridade';
    const ex1 = `Loja Exemplo,${PRODUCTION_TYPES[0]},4,${pilots[0]?.name ?? 'PilotA'},alta`;
    const ex2 = `Cliente Beta,${PRODUCTION_TYPES[1]},2,${pilots[0]?.name ?? 'PilotA'};${pilots[1]?.name ?? 'PilotB'},`;
    downloadFile([header, ex1, ex2].join('\n'), 'modelo_demanda.csv', 'text/csv');
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = (ev.target?.result as string) ?? '';
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lines.length < 2) throw new Error('O arquivo precisa ter pelo menos uma linha de dados além do cabeçalho.');

        // Detect separator (comma or semicolon-based headers)
        const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';

        // Parse header to find column positions (case-insensitive, trimmed)
        const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
        const colCliente = headers.indexOf('cliente');
        const colTipo = headers.indexOf('tipo');
        const colQtd = headers.indexOf('quantidade');
        const colPilots = headers.indexOf('pilots_preferenciais');
        const colSemana = headers.indexOf('prioridade');

        if (colCliente === -1 || colTipo === -1 || colQtd === -1) {
          throw new Error('Colunas obrigatórias não encontradas. O CSV precisa ter: cliente, tipo, quantidade.');
        }

        const newItems: DemandItem[] = [];
        for (let i = 1; i < lines.length; i++) {
          // Handle quoted fields with commas inside
          const cols = parseCSVLine(lines[i], sep);
          const client = cols[colCliente]?.trim() ?? '';
          const typeRaw = cols[colTipo]?.trim() ?? '';
          const qtyRaw = cols[colQtd]?.trim() ?? '';

          const type = parseProductionType(typeRaw);
          if (!type) throw new Error(`Linha ${i + 1}: tipo "${typeRaw}" não reconhecido.`);

          const quantity = parseInt(qtyRaw, 10);
          if (isNaN(quantity) || quantity < 1) throw new Error(`Linha ${i + 1}: quantidade inválida "${qtyRaw}".`);

          let preferredPilotIds: string[] = [];
          if (colPilots !== -1 && cols[colPilots]) {
            const names = cols[colPilots].split(';').map((n) => n.trim()).filter(Boolean);
            preferredPilotIds = names
              .map((name) => pilots.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id)
              .filter((id): id is string => id !== undefined)
              .slice(0, MAX_PILOTS);
          }

          let priority: Priority | null = null;
          if (colSemana !== -1 && cols[colSemana]) {
            const pInfo = cols[colSemana].trim() as Priority;
            if (PRIORITY_OPTIONS.includes(pInfo)) {
              priority = pInfo;
            }
          }

          newItems.push({
            id: crypto.randomUUID(),
            client,
            type,
            quantity,
            remainingQty: quantity,
            upPerUnit: calcUP(type, 1),
            originalIndex: demandItems.length + newItems.length + i,
            preferredPilotIds,
            priority,
          });
        }

        setCsvError(null);
        onDemandChange([...demandItems, ...newItems]);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Erro ao processar o CSV.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  const statusColor = diff > 0.05 ? 'text-blue-600' : diff < -0.05 ? 'text-red-600' : 'text-green-600';
  const statusLabel =
    diff > 0.05
      ? `Capacidade ociosa: ${diff.toFixed(2)} UP livres`
      : diff < -0.05
        ? `Excesso de demanda: ${Math.abs(diff).toFixed(2)} UP a mais`
        : 'Demanda equilibrada com a capacidade';

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-slate-800 mb-1">Entrada de demanda</h2>
        <p className="text-slate-500 mb-6">
          {MONTH_NAMES[month]} {year} · {pilots.length} Pilot{pilots.length !== 1 ? 's' : ''} · {workdays.length} dias úteis
        </p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-3 font-semibold text-slate-600 rounded-tl-xl">Cliente</th>
                <th className="text-left px-3 py-3 font-semibold text-slate-600">Tipo de produção</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600">Qtd.</th>
                <th className="text-right px-3 py-3 font-semibold text-slate-600">UP</th>
                <th className="text-left px-3 py-3 font-semibold text-slate-600">
                  Pilots preferenciais
                </th>
                <th className="text-left px-3 py-3 font-semibold text-slate-600">Prioridade</th>
                <th className="px-3 py-3 font-semibold text-slate-600 text-center" title="Nota para o Pilot">📝</th>
                <th className="px-3 py-3 rounded-tr-xl" />
              </tr>
            </thead>
            <tbody>
              {demandItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-slate-400 py-8">
                    Nenhum item adicionado. Clique em "Adicionar linha" ou importe um CSV.
                  </td>
                </tr>
              )}
              {demandItems.map((item, idx) => {
                const hasNote = !!item.note?.trim();
                const noteOpen = openNoteIds.has(item.id);
                return (
                  <>
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.client}
                          onChange={(e) => updateItem(item.id, { client: e.target.value })}
                          placeholder="Cliente..."
                          className="w-full border border-slate-200 rounded px-2 py-1 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.type}
                          onChange={(e) => updateItem(item.id, { type: e.target.value as ProductionType })}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {PRODUCTION_TYPES.map((t) => (
                            <option key={t} value={t}>{PRODUCTION_LABELS[t]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                          className="w-16 text-right border border-slate-200 rounded px-2 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700 font-medium whitespace-nowrap">
                        {calcUP(item.type, item.quantity).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 min-w-[160px]">
                        <PilotMultiSelect
                          pilots={pilots}
                          selectedIds={item.preferredPilotIds ?? []}
                          onChange={(ids) => updateItem(item.id, { preferredPilotIds: ids })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.priority || ''}
                          onChange={(e) => updateItem(item.id, { priority: (e.target.value as Priority) || null })}
                          className="w-full border border-slate-200 rounded px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">Livre</option>
                          {PRIORITY_OPTIONS.map((p) => (
                            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => toggleNote(item.id)}
                          title={hasNote ? 'Ver/editar nota' : 'Adicionar nota'}
                          className={`text-base transition-all rounded px-1 ${hasNote ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'}`}
                        >
                          📝
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {noteOpen && (
                      <tr key={`note-${item.id}`} className={idx % 2 === 0 ? 'bg-amber-50/60' : 'bg-amber-50/40'}>
                        <td colSpan={9} className="px-4 py-2">
                          <div className="flex items-start gap-2">
                            <span className="text-amber-500 mt-1.5 text-sm flex-shrink-0">📝</span>
                            <textarea
                              value={item.note ?? ''}
                              onChange={(e) => updateItem(item.id, { note: e.target.value })}
                              placeholder="Nota para o Pilot: palavra-chave, FAQs, referências..."
                              rows={2}
                              className="flex-1 border border-amber-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons row */}
        <div className="flex gap-3 mb-2">
          <button
            onClick={addItem}
            className="flex-1 border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-500 hover:text-blue-600 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Adicionar linha
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 border-2 border-dashed border-emerald-300 hover:border-emerald-400 text-emerald-600 hover:text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ⬆ Importar CSV
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 text-slate-400 hover:text-blue-600 px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-transparent hover:border-slate-200"
            title="Baixar modelo CSV"
          >
            ↓ Modelo CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* CSV error message */}
        {csvError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{csvError}</span>
            <button onClick={() => setCsvError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* CSV format hint */}
        <p className="text-xs text-slate-400 mb-6">
          Formato CSV: <code className="bg-slate-100 px-1 rounded">cliente, tipo, quantidade, pilots_preferenciais, prioridade</code> — valores válidos para prioridade: <code className="bg-slate-100 px-1 rounded">alta</code> (1ª e 2ª semana) ou deixar em branco para Livre
        </p>

        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="text-slate-600 hover:text-slate-800 px-6 py-3 rounded-lg font-medium border border-slate-300 hover:border-slate-400 transition-colors"
          >
            ← Voltar
          </button>
          <button
            onClick={onGenerate}
            disabled={demandItems.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium text-base transition-colors"
          >
            Gerar planejamento →
          </button>
        </div>
      </div>

      {/* Painel lateral */}
      <div className="w-64 flex-shrink-0">
        <div className="sticky top-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Resumo</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Total UP da demanda</p>
                <p className="text-2xl font-bold text-slate-800">{totalDemandUP.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Capacidade total</p>
                <p className="text-2xl font-bold text-slate-800">{totalCapacityUP.toFixed(0)}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pilots.map((p) => `${p.name}: ${p.minUP}–${p.maxUP} UP/dia`).join(' · ')}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Média mensal estimada</p>
                <p className={`text-lg font-bold ${monthlyAvgPerPilot >= avgTargetUP ? 'text-green-600' : 'text-slate-800'}`}>
                  {monthlyAvgPerPilot.toFixed(2)} UP/dia
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <p className={`text-sm font-semibold ${statusColor}`}>{statusLabel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Com prioridade definida</p>
                <p className="text-sm font-semibold text-slate-800">
                  {demandItems.filter(i => !!i.priority).length}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Ocupação</span>
                  <span>{Math.min(100, totalCapacityUP > 0 ? (totalDemandUP / totalCapacityUP) * 100 : 0).toFixed(0)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${diff < -0.05 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, totalCapacityUP > 0 ? (totalDemandUP / totalCapacityUP) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Parse a single CSV line respecting quoted fields. */
function parseCSVLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}
