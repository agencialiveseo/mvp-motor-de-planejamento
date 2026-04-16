import { useState } from 'react';
import type { Pilot } from '../types';
import { MONTH_NAMES } from '../utils/dates';

const MIN_TARGET_UP = 4;

interface Props {
  month: number;
  year: number;
  pilots: Pilot[];
  defaultTargetUP: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onPilotsChange: (pilots: Pilot[]) => void;
  onDefaultTargetUPChange: (up: number) => void;
  onNext: () => void;
}

export default function StepConfig({
  month, year, pilots, defaultTargetUP,
  onMonthChange, onYearChange, onPilotsChange, onDefaultTargetUPChange, onNext,
}: Props) {
  const [newPilotName, setNewPilotName] = useState('');

  function addPilot() {
    const name = newPilotName.trim();
    if (!name) return;
    onPilotsChange([...pilots, {
      id: crypto.randomUUID(),
      name,
      minUP: defaultTargetUP,
      maxUP: defaultTargetUP,
    }]);
    setNewPilotName('');
  }

  function removePilot(id: string) {
    onPilotsChange(pilots.filter((p) => p.id !== id));
  }

  function updatePilot(id: string, changes: Partial<Pilot>) {
    onPilotsChange(pilots.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, ...changes };
      // Garantir mínimos
      if (changes.minUP !== undefined) updated.minUP = Math.max(MIN_TARGET_UP, changes.minUP);
      if (changes.maxUP !== undefined) updated.maxUP = Math.max(updated.minUP, changes.maxUP);
      // Se minUP subiu acima de maxUP, ajusta maxUP
      if (updated.minUP > updated.maxUP) updated.maxUP = updated.minUP;
      return updated;
    }));
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const hasInvalidPilot = pilots.some((p) => p.minUP < MIN_TARGET_UP || p.maxUP < p.minUP);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-slate-800 mb-1">Configuração do mês</h2>
      <p className="text-slate-500 mb-8">Defina o período, a equipe e as metas de produção.</p>

      {/* Mês e Ano */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Período de referência</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Mês</label>
            <select
              value={month}
              onChange={(e) => onMonthChange(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Ano</label>
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Meta padrão */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Meta padrão para novos Pilots</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">UP/dia (padrão)</label>
            <input
              type="number"
              min={MIN_TARGET_UP}
              max={20}
              step={0.5}
              value={defaultTargetUP}
              onChange={(e) => onDefaultTargetUPChange(Math.max(MIN_TARGET_UP, Number(e.target.value)))}
              className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-sm text-slate-500 mt-5">
            Aplicado como UP mínimo e máximo ao adicionar um novo Pilot. Pode ser ajustado individualmente.
          </p>
        </div>
      </div>

      {/* Pilots */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">Equipe de Pilots</h3>
        <p className="text-xs text-slate-400 mb-4">
          UP mín/máx definem o intervalo diário do algoritmo. Os campos de tarefas são informativos e não afetam o cálculo.
        </p>

        {pilots.length > 0 && (
          <div className="mb-4 space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_80px_80px_70px_70px_70px_70px_60px] gap-2 px-3 py-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nome</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">UP mín/dia</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">UP máx/dia</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Tarefas</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Aj. Post</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Aj. Cat</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Aj. SERP</span>
              <span className="w-14" />
            </div>

            {pilots.map((pilot) => {
              const minInvalid = pilot.minUP < MIN_TARGET_UP;
              const maxInvalid = pilot.maxUP < pilot.minUP;
              const hasError = minInvalid || maxInvalid;
              return (
                <div
                  key={pilot.id}
                  className={`grid grid-cols-[1fr_80px_80px_70px_70px_70px_70px_60px] gap-2 items-center rounded-lg px-3 py-2 border ${
                    hasError ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span className="text-slate-800 font-medium truncate">{pilot.name}</span>

                  {/* UP mínimo */}
                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={MIN_TARGET_UP}
                      max={20}
                      step={0.5}
                      value={pilot.minUP}
                      onChange={(e) => updatePilot(pilot.id, { minUP: Number(e.target.value) })}
                      className={`w-full text-center border rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        minInvalid ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {minInvalid && <span className="text-red-500 text-xs">Mín: {MIN_TARGET_UP}</span>}
                  </div>

                  {/* UP máximo */}
                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      min={pilot.minUP}
                      max={30}
                      step={0.5}
                      value={pilot.maxUP}
                      onChange={(e) => updatePilot(pilot.id, { maxUP: Number(e.target.value) })}
                      className={`w-full text-center border rounded-md px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        maxInvalid ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {maxInvalid && <span className="text-red-500 text-xs">≥ mín</span>}
                  </div>

                  {/* Tarefas (informativo) */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={pilot.tarefas ?? ''}
                    placeholder="—"
                    onChange={(e) => updatePilot(pilot.id, { tarefas: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full text-center border border-slate-200 rounded-md px-1 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                  />

                  {/* Ajuste Post (informativo) */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={pilot.ajustePost ?? ''}
                    placeholder="—"
                    onChange={(e) => updatePilot(pilot.id, { ajustePost: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full text-center border border-slate-200 rounded-md px-1 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                  />

                  {/* Ajuste Cat (informativo) */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={pilot.ajusteCat ?? ''}
                    placeholder="—"
                    onChange={(e) => updatePilot(pilot.id, { ajusteCat: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full text-center border border-slate-200 rounded-md px-1 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                  />

                  {/* Ajuste SERP (informativo) */}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={pilot.ajusteSerp ?? ''}
                    placeholder="—"
                    onChange={(e) => updatePilot(pilot.id, { ajusteSerp: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="w-full text-center border border-slate-200 rounded-md px-1 py-1 text-sm text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50"
                  />

                  <button
                    onClick={() => removePilot(pilot.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors text-sm text-right"
                  >
                    Remover
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {pilots.length === 0 && (
          <p className="text-sm text-slate-400 mb-4">Nenhum Pilot adicionado ainda.</p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nome do Pilot..."
            value={newPilotName}
            onChange={(e) => setNewPilotName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPilot()}
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addPilot}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            + Adicionar
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={pilots.length === 0 || hasInvalidPilot}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium text-base transition-colors"
        >
          Continuar → Demanda
        </button>
      </div>
    </div>
  );
}
