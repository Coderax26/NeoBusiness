'use client';

import React, { useState } from 'react';
import { NumericKeypad } from '@neo/ui';
import { useFloorOutbox } from '../../../../src/lib/floor-outbox';

const RM_ITEMS = [
  { id: 'itm-maize', icon: '🌽', name: 'Yellow Maize Grain (Grade A)', uom: 'kg' },
  { id: 'itm-soy', icon: '🫘', name: 'Soybean Meal (46% Protein)', uom: 'kg' },
  { id: 'itm-molasses', icon: '🍯', name: 'Sugarcane Molasses', uom: 'kg' },
  { id: 'itm-mineral', icon: '🧂', name: 'Mineral Mixture Premix', uom: 'kg' },
];

export default function FloorRmRequestPage() {
  const { enqueueOrSend } = useFloorOutbox();
  const [selectedId, setSelectedId] = useState(RM_ITEMS[0].id);
  const [qty, setQty] = useState('250');
  const [neededBy, setNeededBy] = useState('2026-11-14');
  const [banner, setBanner] = useState<string | null>(null);

  const selected = RM_ITEMS.find((i) => i.id === selectedId) || RM_ITEMS[0];

  const handleSubmit = async () => {
    const res = await enqueueOrSend({
      type: 'RM_REQUEST',
      endpoint: '/api/bff/production/requisitions',
      payload: {
        itemId: selected.id,
        qty: Number(qty) || 0,
        neededBy,
      },
    });
    setBanner(`Requested ${qty} ${selected.uom} of ${selected.name}. ${res.message}`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h1 className="text-2xl font-bold text-white">Request Raw Materials</h1>
        <p className="text-base text-zinc-400">
          Pick an ingredient, enter required quantity, and send to warehouse storekeeper.
        </p>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold">
          {banner}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {RM_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedId(item.id)}
            className={`min-h-[84px] p-4 rounded-2xl border text-left ${
              selectedId === item.id
                ? 'bg-orange-500/20 border-orange-500 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300'
            }`}
          >
            <div className="text-2xl mb-1">{item.icon}</div>
            <div className="text-sm font-bold">{item.name}</div>
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div className="text-lg font-bold text-white">
            Selected: {selected.name} ({selected.uom})
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Needed By</label>
            <input
              type="date"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className="w-full min-h-[56px] bg-zinc-950 border border-zinc-700 rounded-xl px-4 text-lg text-white"
            />
          </div>
        </div>

        <NumericKeypad
          value={qty}
          onChange={setQty}
          onSubmit={handleSubmit}
          submitLabel={`Submit Request (${qty} ${selected.uom})`}
        />
      </div>
    </div>
  );
}

