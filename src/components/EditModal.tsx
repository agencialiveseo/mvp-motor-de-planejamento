import { useState } from 'react';
import type { ProductionType } from '../types';
import { PRODUCTION_LABELS, PRODUCTION_TYPES } from '../constants/productions';

interface Props {
  clients: string[];
  initialClient?: string;
  initialType?: ProductionType;
  initialNote?: string;
  isNew: boolean;
  onSave: (client: string, type: ProductionType, quantity: number, note: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function EditModal({
  clients, initialClient = '', initialType = 'blogpost_produce',
  initialNote = '', isNew, onSave, onDelete, onClose,
}: Props) {
  const [client, setClient] = useState(initialClient);
  const [type, setType] = useState<ProductionType>(initialType);
  const [note, setNote] = useState(initialNote);
  const quantity = 1;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-5">
          {isNew ? 'Adicionar produção' : 'Editar produção'}
        </h3>

        <div className="space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— selecione —</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de produção</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProductionType)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRODUCTION_TYPES.map((t) => (
                <option key={t} value={t}>{PRODUCTION_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Nota */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nota para o Pilot
              <span className="ml-1 text-xs font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: usar palavra-chave X, incluir 3 FAQs..."
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-between mt-6">
          <div>
            {!isNew && onDelete && (
              <button
                onClick={onDelete}
                className="text-red-600 hover:text-red-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                Excluir produção
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { if (client) onSave(client, type, quantity, note); }}
              disabled={!client}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
