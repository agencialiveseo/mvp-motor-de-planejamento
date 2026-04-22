import { useState } from 'react';
import type { Pilot } from '../types';
import { MONTH_NAMES } from '../utils/dates';

const MIN_UP = 4;

interface Props {
  month: number;
  year: number;
  pilots: Pilot[];
  defaultTargetUP: number;
  defaultMinUP: number;
  defaultMaxUP: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onPilotsChange: (pilots: Pilot[]) => void;
  onNext: () => void;
}

export default function StepConfig({
  month, year, pilots,
  defaultTargetUP, defaultMinUP, defaultMaxUP,
  onMonthChange, onYearChange, onPilotsChange,
  onNext,
}: Props) {
  const [newPilotName, setNewPilotName] = useState('');

  function addPilot() {
    const name = newPilotName.trim();
    if (!name) return;
    onPilotsChange([
      ...pilots,
      {
        id: crypto.randomUUID(),
        name,
        targetUP: defaultTargetUP,
        minUP: defaultMinUP,
        maxUP: defaultMaxUP,
      },
    ]);
    setNewPilotName('');
  }

  function removePilot(id: string) {
    onPilotsChange(pilots.filter((p) => p.id !== id));
  }

  function updatePilotField(id: string, field: 'targetUP' | 'minUP' | 'maxUP', value: number) {
    onPilotsChange(
      pilots.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: Math.max(MIN_UP, value) };
        // Ensure minUP <= targetUP <= maxUP consistency (soft)
        return updated;
      })
    );
  }

  const isInvalidPilot = (p: Pilot) =>
    p.minUP < MIN_UP || p.maxUP < MIN_UP || p.maxUP < p.minUP || p.targetUP < MIN_UP;

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="max-w-2xl mx-auto">
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

      {/* Pilots — Mudança 2: três campos por pilot */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Equipe de Pilots</h3>

        {pilots.length > 0 && (
          <div className="mb-4 space-y-2">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-1">
              <span className="flex-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">Nome</span>
              <span className="w-24 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Mín UP/dia</span>
              <span className="w-24 text-xs font-semibold text-slate-400 uppercase tracking-wide text-center">Máx UP/dia</span>
              <span className="w-16" />
            </div>
            {pilots.map((pilot) => {
              const invalid = isInvalidPilot(pilot);
              return (
                <div
                  key={pilot.id}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 border ${
                    invalid ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span className="flex-1 text-slate-800 font-medium truncate">{pilot.name}</span>

                  {/* minUP */}
                  <div className="w-24 flex flex-col items-center">
                    <input
                      type="number"
                      min={MIN_UP}
                      max={20}
                      step={0.5}
                      value={pilot.minUP}
                      onChange={(e) => updatePilotField(pilot.id, 'minUP', Number(e.target.value))}
                      className={`w-20 text-center border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        pilot.minUP < MIN_UP ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {pilot.minUP < MIN_UP && (
                      <span className="text-red-500 text-xs mt-0.5">Mín: {MIN_UP}</span>
                    )}
                  </div>

                  {/* maxUP */}
                  <div className="w-24 flex flex-col items-center">
                    <input
                      type="number"
                      min={MIN_UP}
                      max={30}
                      step={0.5}
                      value={pilot.maxUP}
                      onChange={(e) => updatePilotField(pilot.id, 'maxUP', Number(e.target.value))}
                      className={`w-20 text-center border rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        pilot.maxUP < pilot.minUP ? 'border-red-400 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {pilot.maxUP < pilot.minUP && (
                      <span className="text-red-500 text-xs mt-0.5">Max &lt; Min</span>
                    )}
                  </div>

                  <button
                    onClick={() => removePilot(pilot.id)}
                    className="w-16 text-slate-400 hover:text-red-500 transition-colors text-sm text-right"
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
          disabled={pilots.length === 0 || pilots.some(isInvalidPilot)}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-medium text-base transition-colors"
        >
          Continuar → Demanda
        </button>
      </div>
    </div>
  );
}
