import { useState, Fragment } from 'react';
import type { DemandItem, Pilot, DistributionResult } from './types';
import { distribute } from './utils/algorithm';
import StepConfig from './components/StepConfig';
import StepDemand from './components/StepDemand';
import StepPlanning from './components/StepPlanning';

type Step = 1 | 2 | 3;

const EXAMPLE_DEMAND: DemandItem[] = [
  { id: '1', client: 'Algar', type: 'blogpost_produce', quantity: 30, remainingQty: 30, upPerUnit: 1.5, originalIndex: 0 },
  { id: '2', client: 'Algar', type: 'category_produce', quantity: 10, remainingQty: 10, upPerUnit: 1, originalIndex: 1 },
  { id: '3', client: 'Serasa', type: 'blogpost_produce', quantity: 20, remainingQty: 20, upPerUnit: 1.5, originalIndex: 2 },
  { id: '4', client: 'Serasa', type: 'product_description_produce', quantity: 15, remainingQty: 15, upPerUnit: 0.5, originalIndex: 3 },
  { id: '5', client: 'PRECATO', type: 'blogpost_produce', quantity: 8, remainingQty: 8, upPerUnit: 1.5, originalIndex: 4 },
  { id: '6', client: 'SG Sistemas', type: 'blogpost_produce', quantity: 12, remainingQty: 12, upPerUnit: 1.5, originalIndex: 5 },
];

const EXAMPLE_PILOTS: Pilot[] = [
  { id: 'p1', name: 'Emilly', targetUP: 4 },
  { id: 'p2', name: 'Luna', targetUP: 4 },
];

export default function App() {
  const now = new Date();
  const [step, setStep] = useState<Step>(1);
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [defaultTargetUP, setDefaultTargetUP] = useState(4);
  const [demandItems, setDemandItems] = useState<DemandItem[]>([]);
  const [result, setResult] = useState<DistributionResult | null>(null);

  function handleGenerate() {
    const r = distribute(demandItems, pilots, year, month);
    setResult(r);
    setStep(3);
  }

  function loadExample() {
    setPilots(EXAMPLE_PILOTS);
    setDemandItems(EXAMPLE_DEMAND);
    setMonth(0);
    setYear(2026);
  }

  const steps = [
    { num: 1, label: 'Configuração' },
    { num: 2, label: 'Demanda' },
    { num: 3, label: 'Planejamento' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white text-sm font-bold px-2.5 py-1 rounded">
              liveSEO
            </div>
            <span className="text-slate-700 font-semibold">Motor de Planejamento</span>
          </div>

          {/* Stepper */}
          <nav className="flex items-center gap-1">
            {steps.map((s, idx) => (
              <Fragment key={s.num}>
                <button
                  onClick={() => {
                    if (s.num < step || (s.num === 2 && step >= 2)) setStep(s.num as Step);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${step === s.num
                      ? 'bg-blue-600 text-white'
                      : step > s.num
                        ? 'text-blue-600 hover:bg-blue-50'
                        : 'text-slate-400 cursor-default'
                    }`}
                >
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${step === s.num
                      ? 'bg-white text-blue-600'
                      : step > s.num
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                    {s.num}
                  </span>
                  {s.label}
                </button>
                {idx < steps.length - 1 && (
                  <span className="text-slate-300 text-xs px-1">›</span>
                )}
              </Fragment>
            ))}
          </nav>

          <button
            onClick={loadExample}
            className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Carregar dados de exemplo
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
        {step === 1 && (
          <StepConfig
            month={month}
            year={year}
            pilots={pilots}
            defaultTargetUP={defaultTargetUP}
            onMonthChange={setMonth}
            onYearChange={setYear}
            onPilotsChange={setPilots}
            onDefaultTargetUPChange={setDefaultTargetUP}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <StepDemand
            demandItems={demandItems}
            pilots={pilots}
            month={month}
            year={year}
            onDemandChange={setDemandItems}
            onBack={() => setStep(1)}
            onGenerate={handleGenerate}
          />
        )}

        {step === 3 && result && (
          <StepPlanning
            result={result}
            demandItems={demandItems}
            month={month}
            year={year}
            onBack={() => setStep(2)}
          />
        )}
      </main>
    </div>
  );
}
