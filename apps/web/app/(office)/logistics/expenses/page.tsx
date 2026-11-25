'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import {
  type TripExpenseRecord,
  type TripRecord,
} from '../../../../src/lib/logistics-data';

const CATEGORIES: Array<TripExpenseRecord['category']> = ['FUEL', 'TOLL', 'LOADING', 'FOOD', 'REPAIR'];

export default function TripExpensesPage() {
  const [expenses, setExpenses] = useState<TripExpenseRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | TripExpenseRecord['category']>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const [newTripId, setNewTripId] = useState('');
  const [newCategory, setNewCategory] = useState<TripExpenseRecord['category']>('FUEL');
  const [newAmount, setNewAmount] = useState('1200');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/proxy/trip-expenses').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/proxy/trips').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([expRes, trpRes]) => {
        if (!active) return;
        const eRows = Array.isArray(expRes) ? expRes : Array.isArray(expRes?.data) ? expRes.data : [];
        const tRows = Array.isArray(trpRes) ? trpRes : Array.isArray(trpRes?.data) ? trpRes.data : [];
        setExpenses(eRows);
        setTrips(tRows);
        if (tRows.length > 0) setNewTripId(String(tRows[0].id));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const trip = trips.find((t) => t.id === newTripId) ?? trips[0];
    const parsedAmount = Number(newAmount) || 0;
    if (parsedAmount <= 0 || !trip) return;

    const record: TripExpenseRecord = {
      id: `exp-${Date.now()}`,
      tripId: trip.id,
      tripNo: trip.tripNo,
      vehicleRegNo: trip.vehicleRegNo,
      category: newCategory,
      amount: parsedAmount,
      date: new Date().toISOString().slice(0, 10),
      notes: newNotes || `${newCategory} expense`,
      receiptName: 'receipt-uploaded.jpg',
    };
    await fetch('/api/proxy/trip-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripId: trip.id,
        category: newCategory,
        amount: parsedAmount,
        notes: record.notes,
      }),
    }).catch(() => {});
    setExpenses((prev) => [record, ...prev]);
    setShowAddModal(false);
    setNewNotes('');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Trip Expenses</h1>
          <p className="text-sm text-ink-3">
            Track fuel, toll, loading, food, and repair expenses per trip and summarise monthly spend by vehicle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Log Expense
        </button>
      </div>

      {/* Vehicle Monthly Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {totalByVehicle.map(([regNo, total]) => (
          <div key={regNo} className="rounded-[3px] border border-rule bg-sheet p-4">
            <div className="text-xs font-medium text-ink-3">Monthly Spend · {regNo}</div>
            <div className="mt-1 text-xl font-bold text-ink">₹{total.toLocaleString('en-IN')}</div>
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
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold${
              categoryFilter === cat
                ? 'bg-blue-600 text-white'
                : 'border border-rule bg-sheet text-ink-2 hover:bg-sunken'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[3px] border border-rule bg-sheet">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-ink-3">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Trip / Vehicle</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Notes &amp; Receipt</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-3">
                  No trip expenses recorded.
                </td>
              </tr>
            ) : (
              filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-sunken">
                  <td className="px-4 py-3 text-ink-3">{exp.date}</td>
                  <td className="px-4 py-3">
                    <Link href={`/logistics/trips/${exp.tripId}`} className="font-semibold text-action hover:underline">
                      {exp.tripNo}
                    </Link>
                    <div className="text-xs text-ink-3">{exp.vehicleRegNo}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-2">{exp.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{exp.notes}</div>
                    {exp.receiptName && <div className="font-mono text-xs text-ink-3">🧾 {exp.receiptName}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-ink">
                    ₹{exp.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form onSubmit={addExpense} className="w-full max-w-md rounded-[4px] border border-rule bg-sheet p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">Log Trip Expense</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-ink-3">Trip</label>
                <select
                  value={newTripId}
                  onChange={(e) => setNewTripId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tripNo} ({t.vehicleRegNo})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-3">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as TripExpenseRecord['category'])}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-3">Amount (₹)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-3">Notes</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Pump name, toll plaza, or repair memo"
                  className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-ink"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-rule-strong bg-paper px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-sunken"
              >
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Save Expense
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
