'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  INITIAL_TRIPS,
  INITIAL_TRIP_EXPENSES,
  type TripExpenseRecord,
} from '../../../src/lib/logistics-data';

const CATEGORIES: Array<TripExpenseRecord['category']> = ['FUEL', 'TOLL', 'LOADING', 'FOOD', 'REPAIR'];

export default function TripExpensesPage() {
  const [expenses, setExpenses] = useState<TripExpenseRecord[]>(INITIAL_TRIP_EXPENSES);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | TripExpenseRecord['category']>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newTripId, setNewTripId] = useState(INITIAL_TRIPS[0].id);
  const [newCategory, setNewCategory] = useState<TripExpenseRecord['category']>('FUEL');
  const [newAmount, setNewAmount] = useState('1200');
  const [newNotes, setNewNotes] = useState('');

  const filteredExpenses = useMemo(
    () => expenses.filter((e) => (categoryFilter === 'ALL' ? true : e.category === categoryFilter)),
    [expenses, categoryFilter],
  );

  const totalByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const exp of expenses) {
      map.set(exp.vehicleRegNo, (map.get(exp.vehicleRegNo) ?? 0) + exp.amount);
    }
    return Array.from(map.entries());
  }, [expenses]);

  function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const trip = INITIAL_TRIPS.find((t) => t.id === newTripId) ?? INITIAL_TRIPS[0];
    const parsedAmount = Number(newAmount) || 0;
    if (parsedAmount <= 0) return;

    const record: TripExpenseRecord = {
      id: `exp-${Date.now()}`,
      tripId: trip.id,
      tripNo: trip.tripNo,
      vehicleRegNo: trip.vehicleRegNo,
      category: newCategory,
      amount: parsedAmount,
      date: '2026-11-13',
      notes: newNotes || `${newCategory} expense`,
      receiptName: 'receipt-uploaded.jpg',
    };
    setExpenses((prev) => [record, ...prev]);
    setShowAddModal(false);
    setNewNotes('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trip Expenses</h1>
          <p className="text-sm text-slate-500">
            Track fuel, toll, loading, food, and repair expenses per trip and summarise monthly spend by vehicle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Log Expense
        </button>
      </div>

      {/* Vehicle Monthly Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {totalByVehicle.map(([regNo, total]) => (
          <div key={regNo} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">Monthly Spend · {regNo}</div>
            <div className="mt-1 text-xl font-bold text-slate-900">₹{total.toLocaleString('en-IN')}</div>
          </div>
        ))}
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              categoryFilter === cat
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Trip / Vehicle</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Notes & Receipt</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredExpenses.map((exp) => (
              <tr key={exp.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{exp.date}</td>
                <td className="px-4 py-3">
                  <Link href={`/logistics/trips/${exp.tripId}`} className="font-semibold text-blue-600 hover:underline">
                    {exp.tripNo}
                  </Link>
                  <div className="text-xs text-slate-500">{exp.vehicleRegNo}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{exp.category}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-800">{exp.notes}</div>
                  {exp.receiptName && <div className="font-mono text-xs text-slate-400">🧾 {exp.receiptName}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                  ₹{exp.amount.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={addExpense} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Log Trip Expense</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Trip</label>
                <select
                  value={newTripId}
                  onChange={(e) => setNewTripId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {INITIAL_TRIPS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tripNo} ({t.vehicleRegNo})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as TripExpenseRecord['category'])}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Amount (₹)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Notes</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Pump name, toll plaza, or repair memo"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                Save Expense
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

