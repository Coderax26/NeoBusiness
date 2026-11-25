import React from 'react';
import { mulMoney, formatINR, addMoney } from '@neo/shared';
import { Button } from '../foundations/Button.js';
import { IconButton } from '../foundations/IconButton.js';

export interface GridLineItem {
  id: string;
  itemId: string;
  itemName: string;
  qty: string;
  uom: string;
  unitPrice: string;
  lineTotal: string; // Preview calculated with exact BigInt mulMoney
}

export interface LineItemGridProps {
  lines: GridLineItem[];
  onChange: (lines: GridLineItem[]) => void;
  availableUoms?: string[];
  readOnly?: boolean;
}

export const LineItemGrid: React.FC<LineItemGridProps> = ({
  lines,
  onChange,
  availableUoms = ['kg', 'crate', 'pcs'],
  readOnly = false,
}) => {
  const updateLine = (id: string, field: 'qty' | 'unitPrice' | 'uom' | 'itemName', val: string) => {
    const updated = lines.map((line) => {
      if (line.id !== id) return line;
      const next = { ...line, [field]: val };
      const qtyStr = field === 'qty' ? val : line.qty;
      const priceStr = field === 'unitPrice' ? val : line.unitPrice;
      try {
        next.lineTotal = mulMoney(qtyStr || '0', priceStr || '0', 2);
      } catch {
        next.lineTotal = '0.00';
      }
      return next;
    });
    onChange(updated);
  };

  const addLine = () => {
    const newLine: GridLineItem = {
      id: `line-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      itemId: '',
      itemName: 'New Item',
      qty: '1',
      uom: availableUoms[0] || 'kg',
      unitPrice: '0.00',
      lineTotal: '0.00',
    };
    onChange([...lines, newLine]);
  };

  const removeLine = (id: string) => {
    onChange(lines.filter((l) => l.id !== id));
  };

  const grandTotal = lines.reduce((acc, l) => addMoney(acc, l.lineTotal), '0.00');

  return (
    <div className="w-full border border-rule rounded-[4px] overflow-hidden bg-sheet">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="bg-paper border-b-[1.5px] border-ink text-ink-3 font-medium">
            <tr>
              <th className="py-2.5 px-3">Item Description</th>
              <th className="py-2.5 px-3 w-28 text-right">Quantity</th>
              <th className="py-2.5 px-3 w-20">UoM</th>
              <th className="py-2.5 px-3 w-32 text-right">Unit Price (₹)</th>
              <th className="py-2.5 px-3 w-36 text-right">Amount (₹)</th>
              {!readOnly && <th className="py-2.5 px-2 w-10 text-center"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule tabular-nums">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-ink-3 text-[13.5px]">
                  No line items added yet. Click &quot;Add Line Item&quot; to begin.
                </td>
              </tr>
            ) : (
              lines.map((line, idx) => (
                <tr key={line.id} className="hover:bg-paper/60 focus-within:bg-paper">
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      disabled={readOnly}
                      value={line.itemName}
                      onChange={(e) => updateLine(line.id, 'itemName', e.target.value)}
                      className="w-full bg-transparent border-b border-transparent focus:border-action text-ink text-[14px] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={readOnly}
                      value={line.qty}
                      onChange={(e) => updateLine(line.id, 'qty', e.target.value)}
                      className="w-full bg-transparent text-right font-mono border-b border-transparent focus:border-action text-ink text-[14px] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <select
                      disabled={readOnly}
                      value={line.uom}
                      onChange={(e) => updateLine(line.id, 'uom', e.target.value)}
                      className="bg-transparent text-ink-2 text-[13.5px] focus:outline-none cursor-pointer"
                    >
                      {availableUoms.map((u) => (
                        <option key={u} value={u} className="bg-sheet text-ink">
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={readOnly}
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.id, 'unitPrice', e.target.value)}
                      className="w-full bg-transparent text-right font-mono border-b border-transparent focus:border-action text-ink text-[14px] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-medium text-ink">
                    {formatINR(line.lineTotal, { showSymbol: false })}
                  </td>
                  {!readOnly && (
                    <td className="py-2 px-2 text-center">
                      <IconButton
                        size="sm"
                        variant="danger"
                        aria-label={`Remove line ${idx + 1}`}
                        onClick={() => removeLine(line.id)}
                      >
                        ✕
                      </IconButton>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-paper border-t border-rule flex items-center justify-between">
        {!readOnly ? (
          <Button size="sm" variant="secondary" onClick={addLine}>
            + Add Line Item
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <span className="text-[13px] text-ink-2">Total:</span>
          <span className="text-[18px] font-serif font-semibold text-ink bahi-double-underline pb-0.5 tabular-nums">
            {formatINR(grandTotal, { showSymbol: true })}
          </span>
        </div>
      </div>
    </div>
  );
};
