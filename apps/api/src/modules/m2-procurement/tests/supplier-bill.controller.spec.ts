import { describe, it, expect, vi } from 'vitest';
import { SupplierBillController } from '../supplier-bill.controller.js';
import { BillStatus } from '../enums/bill-status.enum.js';

describe('SupplierBillController', () => {
  const mockUser = {
    id: 'user-1',
    siteId: 'site-1',
    role: 'OPS_COORD',
  };
  const mockReq = { user: mockUser };

  it('creates supplier bill and returns data envelope', async () => {
    const mockBillService = {
      create: vi.fn().mockResolvedValue({
        id: 'bill-1',
        bill_number: 'BILL-001',
        total_amount: '10500.00',
        status: BillStatus.DRAFT,
      }),
    } as any;

    const mockKnex = vi.fn() as any;
    mockKnex.mockReturnValue({
      where: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ name: 'Milk Powder', id: 'bat-1' }),
      }),
    });

    const controller = new SupplierBillController(mockBillService, mockKnex);
    const res = await controller.create(
      {
        supplierId: 'supp-1',
        poId: 'po-1',
        items: [
          {
            itemId: 'item-1',
            quantity: '100.000',
            ratePerUnit: '100.00',
          },
        ],
      },
      mockReq,
    );

    expect(res).toHaveProperty('data');
    expect(res.data.bill_number).toBe('BILL-001');
    expect(mockBillService.create).toHaveBeenCalled();
  });

  it('approves bill and returns approved status', async () => {
    const mockBillService = {
      updateStatus: vi.fn().mockResolvedValue({
        id: 'bill-1',
        status: BillStatus.APPROVED,
      }),
    } as any;

    const controller = new SupplierBillController(mockBillService, {} as any);
    const res = await controller.approve('bill-1', {}, mockReq);

    expect(res.data.status).toBe(BillStatus.APPROVED);
    expect(mockBillService.updateStatus).toHaveBeenCalledWith(
      'bill-1',
      expect.objectContaining({ status: BillStatus.APPROVED }),
      mockUser.id,
    );
  });

  it('lists bills with filters', async () => {
    const mockBillService = {
      list: vi.fn().mockResolvedValue([
        { id: 'bill-1', bill_number: 'BILL-001' },
      ]),
    } as any;

    const controller = new SupplierBillController(mockBillService, {} as any);
    const res = await controller.list({ status: BillStatus.APPROVED }, mockReq);

    expect(res.data).toHaveLength(1);
    expect(mockBillService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        status: BillStatus.APPROVED,
      }),
    );
  });
});

