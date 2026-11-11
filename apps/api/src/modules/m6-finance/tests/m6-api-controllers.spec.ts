import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceController } from '../invoice.controller.js';
import { CollectionController } from '../collection.controller.js';
import { CustomerLedgerController } from '../customer-ledger.controller.js';
import { HandoverController } from '../handover.controller.js';
import { ChequeController } from '../cheque.controller.js';
import { PtpController } from '../ptp.controller.js';
import { EodController } from '../eod.controller.js';
import { CreditNoteController } from '../credit-note.controller.js';
import { CodSettlementController } from '../cod-settlement.controller.js';
import { TallyExportController } from '../tally-export.controller.js';
import { OpeningBalanceController } from '../opening-balance.controller.js';

describe('M6 API Controllers — Contract & Envelope Verification', () => {
  const mockUser = {
    id: '11111111-1111-1111-1111-111111111111',
    siteId: '22222222-2222-2222-2222-222222222222',
    role: 'OPS_COORD',
  };
  const mockReq = { user: mockUser };

  describe('InvoiceController', () => {
    it('generates invoice and returns standard data envelope', async () => {
      const mockInvoiceService = {
        generateFromOrder: vi.fn().mockResolvedValue({
          invoiceId: 'inv-1',
          invoiceNo: 'INV-001',
          totalAmount: '1250.00',
        }),
      } as any;

      const controller = new InvoiceController(mockInvoiceService);
      const res = await controller.generate(
        { orderId: 'order-1', isCOD: false },
        mockReq,
      );

      expect(res).toHaveProperty('data');
      expect(res.data.invoiceNo).toBe('INV-001');
      expect(mockInvoiceService.generateFromOrder).toHaveBeenCalledWith(
        'order-1',
        mockUser.siteId,
        mockUser.id,
        expect.anything(),
      );
    });

    it('lists invoices with meta pagination in envelope', async () => {
      const mockInvoiceService = {
        listInvoices: vi.fn().mockResolvedValue({
          items: [{ id: 'inv-1' }],
          total: 1,
          limit: 50,
          offset: 0,
        }),
      } as any;

      const controller = new InvoiceController(mockInvoiceService);
      const res = await controller.list({}, mockReq);

      expect(res.data).toHaveLength(1);
      expect(res.meta).toEqual({ total: 1, limit: 50, offset: 0 });
    });
  });

  describe('CollectionController', () => {
    it('logs collection with idempotency and returns receipt envelope', async () => {
      const mockCollectionService = {
        logCollection: vi.fn().mockResolvedValue({
          success: true,
          receiptId: 'rec-1',
          receiptNo: 'REC-001',
        }),
      } as any;

      const controller = new CollectionController(mockCollectionService, {} as any);
      const res = await controller.logCollection(
        {
          customerId: 'cust-1',
          amount: '500.00',
          paymentMode: 'CASH',
          idempotencyKey: 'idem-1',
        },
        mockReq,
      );

      expect(res.data.receiptNo).toBe('REC-001');
      expect(mockCollectionService.logCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          amount: '500.00',
          idempotencyKey: 'idem-1',
        }),
      );
    });
  });

  describe('CustomerLedgerController', () => {
    it('returns customer balance and open invoices', async () => {
      const mockLedgerService = {
        getCustomerBalance: vi.fn().mockResolvedValue({
          toStorageString: () => '1500.00',
        }),
        getOpenInvoices: vi.fn().mockResolvedValue([{ id: 'inv-1', balance_due: '1500.00' }]),
      } as any;

      const controller = new CustomerLedgerController(mockLedgerService, {} as any);
      const res = await controller.getCustomerBalance('cust-1');

      expect(res.data.customerId).toBe('cust-1');
      expect(res.data.balance).toBe('1500.00');
      expect(res.data.openInvoiceCount).toBe(1);
    });

    it('returns AR aging summary', async () => {
      const mockLedgerService = {
        getArAging: vi.fn().mockResolvedValue({
          totalOutstanding: '50000.00',
          buckets: { '0_to_7_days': '20000.00' },
        }),
      } as any;

      const controller = new CustomerLedgerController(mockLedgerService, {} as any);
      const res = await controller.getArAging({}, mockReq);

      expect(res.data.totalOutstanding).toBe('50000.00');
    });
  });

  describe('HandoverController', () => {
    it('verifies cash handover and returns resolution status', async () => {
      const mockHandoverService = {
        verifyHandover: vi.fn().mockResolvedValue({
          handoverId: 'ho-1',
          status: 'VERIFIED',
          variance: '0.00',
        }),
      } as any;

      const controller = new HandoverController(mockHandoverService);
      const res = await controller.verifyHandover(
        'ho-1',
        { countedAmount: '10000.00' },
        mockReq,
      );

      expect(res.data.status).toBe('VERIFIED');
    });

    it('resolves disputed handover variance', async () => {
      const mockHandoverService = {
        resolveDispute: vi.fn().mockResolvedValue({
          success: true,
          handoverId: 'ho-1',
          status: 'VERIFIED',
        }),
      } as any;

      const controller = new HandoverController(mockHandoverService);
      const res = await controller.resolveDispute(
        'ho-1',
        { action: 'ACCEPT_COUNTED', notes: 'Owner approved variance' },
        mockReq,
      );

      expect(res.data.success).toBe(true);
    });
  });

  describe('ChequeController', () => {
    it('deposits cheque with slip reference', async () => {
      const mockChequeService = {
        depositCheque: vi.fn().mockResolvedValue({
          success: true,
          cheque: { id: 'ch-1', status: 'DEPOSITED' },
        }),
      } as any;

      const controller = new ChequeController(mockChequeService);
      const res = await controller.deposit(
        'ch-1',
        { depositSlipNo: 'SLIP-101' },
        mockReq,
      );

      expect(res.data.cheque.status).toBe('DEPOSITED');
    });

    it('marks cheque as bounced with reversals', async () => {
      const mockChequeService = {
        bounceCheque: vi.fn().mockResolvedValue({
          success: true,
          cheque: { id: 'ch-1', status: 'BOUNCED' },
        }),
      } as any;

      const controller = new ChequeController(mockChequeService);
      const res = await controller.bounce(
        'ch-1',
        { bounceReason: 'INSUFFICIENT_FUNDS' },
        mockReq,
      );

      expect(res.data.cheque.status).toBe('BOUNCED');
    });
  });

  describe('PtpController', () => {
    it('creates PTP promise record', async () => {
      const mockPtpService = {
        createPTP: vi.fn().mockResolvedValue({
          id: 'ptp-1',
          status: 'OPEN',
          promised_date: '2026-11-20',
        }),
      } as any;

      const controller = new PtpController(mockPtpService, {} as any);
      const res = await controller.create(
        {
          customerId: 'cust-1',
          promisedDate: '2026-11-20',
          reasonCode: 'OWNER_ABSENT',
        },
        mockReq,
      );

      expect(res.data.status).toBe('OPEN');
    });
  });

  describe('EodController', () => {
    it('initiates EOD closing checklist', async () => {
      const mockEodService = {
        initiateClosing: vi.fn().mockResolvedValue({
          eodId: 'eod-1',
          status: 'OPEN',
          checklist: { trips: { passed: true } },
        }),
      } as any;

      const controller = new EodController(mockEodService);
      const res = await controller.initiateClosing({}, mockReq);

      expect(res.data.status).toBe('OPEN');
    });
  });

  describe('OpeningBalanceController', () => {
    it('generates CSV template', () => {
      const mockObService = {
        getTemplate: vi.fn().mockReturnValue('entity_type,party_id,amount,date,note'),
      } as any;

      const mockRes = {
        setHeader: vi.fn(),
        send: vi.fn(),
      } as any;

      const controller = new OpeningBalanceController(mockObService);
      controller.getTemplate(mockRes);

      expect(mockRes.send).toHaveBeenCalledWith('entity_type,party_id,amount,date,note');
    });

    it('validates draft opening balances', async () => {
      const mockObService = {
        validateDraft: vi.fn().mockResolvedValue({
          totalCount: 1,
          validCount: 1,
          invalidCount: 0,
        }),
      } as any;

      const controller = new OpeningBalanceController(mockObService);
      const res = await controller.validateDraft({
        rows: [{ entityType: 'CUSTOMER', partyId: 'cust-1', amount: '1000.00' }],
      });

      expect(res.data.validCount).toBe(1);
    });
  });
});

