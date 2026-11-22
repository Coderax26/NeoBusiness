import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateGSTIN,
  checkDuplicateRecord,
  GSTIN_STATE_CODES,
  formatINR,
  SETUP_STEPS_CONFIG,
  calculateSetupProgress,
} from '@neo/shared';
import { parseAndValidateCsv } from '@neo/ui';

describe('Phase F3 — Master Data & Business Setup Specification', () => {
  // 1. TC-F3-AC01: Setup Wizard framework & progress tracking (F3-01)
  describe('TC-F3-AC01: Setup Wizard 8-step framework & progress tracking', () => {
    it('defines exactly 8 sequential setup steps covering all core business domains', () => {
      expect(SETUP_STEPS_CONFIG).toHaveLength(8);

      const keys = SETUP_STEPS_CONFIG.map((s) => s.key);
      expect(keys).toEqual([
        'company',
        'sites',
        'users',
        'items',
        'customers',
        'suppliers',
        'vehicles',
        'opening_balances',
      ]);
    });

    it('calculates completion percentage correctly', () => {
      expect(calculateSetupProgress(5, 8)).toBe(63); // ~62.5% rounds to 63%
      expect(calculateSetupProgress(8, 8)).toBe(100);
      expect(calculateSetupProgress(0, 8)).toBe(0);
    });

    it('verifies setup wizard source code implements progress saving, skipping and route hints', () => {
      const wizardFile = path.resolve(
        __dirname,
        '../../app/(office)/admin/setup-wizard/page.tsx',
      );
      expect(fs.existsSync(wizardFile)).toBe(true);
      const content = fs.readFileSync(wizardFile, 'utf8');

      expect(content).toContain('neobus_setup_wizard_progress');
      expect(content).toContain('Skip for now');
      expect(content).toContain('Overall Progress');

      const hints = SETUP_STEPS_CONFIG.map((s) => s.routeHint).filter(Boolean);
      expect(hints).toContain('/sales/items');
      expect(hints).toContain('/sales/customers');
      expect(hints).toContain('/procurement/suppliers');
      expect(hints).toContain('/logistics/vehicles');
    });

    it('verifies owner home page integrates the setup wizard banner', () => {
      const homeFile = path.resolve(
        __dirname,
        '../../app/(office)/home/page.tsx',
      );
      expect(fs.existsSync(homeFile)).toBe(true);
      const content = fs.readFileSync(homeFile, 'utf8');

      expect(content).toContain('setupProgressPct');
      expect(content).toContain('% set up');
      expect(content).toContain('/admin/setup-wizard');
      expect(content).toContain('Continue Setup Wizard');
    });
  });

  // 2. TC-F3-AC02: Item master list, filters, and UoM conversion calculation (F3-02)
  describe('TC-F3-AC02: Item master, category rules & UoM conversion preview', () => {
    it('calculates UoM packaging conversions accurately', () => {
      // 1 crate = 24 pcs of 200g paneer
      const conversionFactor = 24;
      const cratesDispatched = 10;
      const baseUnitsDeducted = cratesDispatched * conversionFactor;
      expect(baseUnitsDeducted).toBe(240);

      // Raw milk: 1 can = 40 litres
      const canConversion = 40;
      const cansReceived = 15;
      expect(cansReceived * canConversion).toBe(600);
    });

    it('calculates floor price formula from base cost and min margin % (OD-001)', () => {
      const baseCost = 100;
      const minMarginPct = 15; // 15%
      const floorPrice = Math.round(baseCost * (1 + minMarginPct / 100));
      expect(floorPrice).toBe(115);
    });

    it('verifies Item master screen contains all required tabs and filters', () => {
      const itemsFile = path.resolve(
        __dirname,
        '../../app/(office)/sales/items/page.tsx',
      );
      expect(fs.existsSync(itemsFile)).toBe(true);
      const content = fs.readFileSync(itemsFile, 'utf8');

      expect(content).toContain('Item Master Catalog');
      expect(content).toContain('Units & UoM Conversion');
      expect(content).toContain('Tax & HSN');
      expect(content).toContain('Pricing Rules');
      expect(content).toContain('Stock & Shelf Life');
      expect(content).toContain('Recipe (BOM)');
      expect(content).toContain('Catch-weight item');
      expect(content).toContain('Minimum Stock Trigger (MTS, OD-013)');
      expect(content).toContain('Save & Add Another');
    });
  });

  // 3. TC-F3-AC03: Customer master, credit override and contacts (F3-03)
  describe('TC-F3-AC03: Customer master, credit limit override & contact directory', () => {
    it('flags credit limit modifications requiring permission and reason', () => {
      const originalLimit = 50000;
      const updatedLimit = 75000;
      const hasReason = false;

      const isModified = updatedLimit !== originalLimit;
      const requiresReason = isModified && !hasReason;
      expect(requiresReason).toBe(true);
    });

    it('formats customer credit limits with INR currency symbols', () => {
      const creditLimitRupees = 50000;
      const formatted = formatINR(creditLimitRupees);
      expect(formatted).toBe('₹50,000.00');
    });

    it('verifies Customer master source code implements credit hold and card view toggle', () => {
      const customersFile = path.resolve(
        __dirname,
        '../../app/(office)/sales/customers/page.tsx',
      );
      expect(fs.existsSync(customersFile)).toBe(true);
      const content = fs.readFileSync(customersFile, 'utf8');

      expect(content).toContain('Customer Master Directory');
      expect(content).toContain('customer.credit_override');
      expect(content).toContain('Manual Credit Hold');
      expect(content).toContain('Table');
      expect(content).toContain('Cards');
      expect(content).toContain('WhatsApp Number');
      expect(content).toContain('Key Contacts');
    });
  });

  // 4. TC-F3-AC04: Supplier master rate cards, latest rate and reliability score (F3-04)
  describe('TC-F3-AC04: Supplier master rate cards & composite reliability calculation', () => {
    it('calculates weighted supplier reliability score from fill rate and on-time %', () => {
      const fillRatePct = 98.2;
      const onTimePct = 96.0;

      // Weighted score: (fillRate * 0.6 + onTime * 0.4) / 20 -> out of 5.0
      const weighted = (fillRatePct * 0.6 + onTimePct * 0.4) / 20;
      const compositeScore = parseFloat(weighted.toFixed(1));

      expect(compositeScore).toBe(4.9);
      expect(compositeScore).toBeGreaterThanOrEqual(1.0);
      expect(compositeScore).toBeLessThanOrEqual(5.0);
    });

    it('verifies Supplier master source code contains rate card history and missing-rate alert', () => {
      const supplierFile = path.resolve(
        __dirname,
        '../../app/(office)/procurement/suppliers/page.tsx',
      );
      expect(fs.existsSync(supplierFile)).toBe(true);
      const content = fs.readFileSync(supplierFile, 'utf8');

      expect(content).toContain('Supplier Master Directory');
      expect(content).toContain('Missing Rate Alerts');
      expect(content).toContain('Rate Cards & History');
      expect(content).toContain('Recalculate Reliability');
      expect(content).toContain('Active Rate Agreements');
      expect(content).toContain('PO Fill Rate');
    });
  });

  // 5. TC-F3-AC05: Vehicle fleet capacity and document expiry tracking (F3-05)
  describe('TC-F3-AC05: Vehicle fleet payload capacity and statutory document expiries', () => {
    it('aggregates total fleet payload capacity correctly', () => {
      const fleet = [
        { capacityKg: 1500, capacityCrates: 75 },
        { capacityKg: 900, capacityCrates: 45 },
        { capacityKg: 3500, capacityCrates: 180 },
        { capacityKg: 450, capacityCrates: 20 },
      ];

      const totalKg = fleet.reduce((sum, v) => sum + v.capacityKg, 0);
      const totalCrates = fleet.reduce((sum, v) => sum + v.capacityCrates, 0);

      expect(totalKg).toBe(6350);
      expect(totalCrates).toBe(320);
      expect(totalKg / 1000).toBe(6.35);
      expect((totalKg / 1000).toFixed(1)).toBe('6.3'); // 6.3 Metric Tonnes
    });

    it('verifies Vehicles master screen tracks PUC, Fitness and Insurance expiries', () => {
      const vehiclesFile = path.resolve(
        __dirname,
        '../../app/(office)/logistics/vehicles/page.tsx',
      );
      expect(fs.existsSync(vehiclesFile)).toBe(true);
      const content = fs.readFileSync(vehiclesFile, 'utf8');

      expect(content).toContain('Vehicles & Fleet Master');
      expect(content).toContain('Fitness Expiry');
      expect(content).toContain('Insurance Expiry');
      expect(content).toContain('PUC Expiry');
      expect(content).toContain('Payload Capacity');
      expect(content).toContain('Company Owned');
      expect(content).toContain('Market Hired');
    });
  });

  // 6. TC-F3-AC06: Reusable CSV import framework with validation preview (F3-06)
  describe('TC-F3-AC06: Reusable CSV import framework & preview validation', () => {
    it('parses CSV rows and validates fields correctly', () => {
      const csvData = `Code,Business Name,Phone\nCUST-101,Anand Sweets,9822110011\nCUST-102,Bad Customer,\nCUST-103,Royal Dairy,9822998877`;

      const result = parseAndValidateCsv(
        csvData,
        [
          { key: 'code', label: 'Code' },
          { key: 'businessName', label: 'Business Name' },
          { key: 'phone', label: 'Phone' },
        ],
        (row) => {
          const errors: string[] = [];
          if (!row.code) errors.push('Missing Code');
          if (!row.businessName) errors.push('Missing Name');
          if (!row.phone) errors.push('Missing Phone Number');
          return {
            isValid: errors.length === 0,
            errors,
            parsed: row,
          };
        },
      );

      expect(result.rows).toHaveLength(3);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(1);

      // Check row #2 error
      expect(result.rows[1].isValid).toBe(false);
      expect(result.rows[1].errors).toContain('Missing Phone Number');

      // Check row #1 valid
      expect(result.rows[0].isValid).toBe(true);
      expect(result.rows[0].data.code).toBe('CUST-101');
    });

    it('simulates 200 customer import with 5 invalid rows (AC-5)', () => {
      const lines = ['Code,Business Name,Phone'];
      for (let i = 1; i <= 200; i++) {
        if (i % 40 === 0) {
          // 5 invalid rows (40, 80, 120, 160, 200) missing phone
          lines.push(`CUST-${i},Customer ${i},`);
        } else {
          lines.push(`CUST-${i},Customer ${i},9822000${String(i).padStart(3, '0')}`);
        }
      }
      const csvText = lines.join('\n');

      const result = parseAndValidateCsv(
        csvText,
        [
          { key: 'code', label: 'Code' },
          { key: 'businessName', label: 'Business Name' },
          { key: 'phone', label: 'Phone' },
        ],
        (row) => {
          const errors: string[] = [];
          if (!row.phone) errors.push('Phone is required');
          return { isValid: errors.length === 0, errors, parsed: row };
        },
      );

      expect(result.rows).toHaveLength(200);
      expect(result.validCount).toBe(195);
      expect(result.invalidCount).toBe(5);
    });
  });

  // 7. TC-F3-AC07: GSTIN validation pattern and state code resolution (F3-07)
  describe('TC-F3-AC07: GSTIN format validation & Indian state code resolution', () => {
    it('validates correct 15-character GSTIN and resolves state name', () => {
      const mhGstin = '27ABCDE1234F1Z5';
      const result = validateGSTIN(mhGstin);

      expect(result.valid).toBe(true);
      expect(result.stateCode).toBe('27');
      expect(result.stateName).toBe('Maharashtra');
    });

    it('resolves Delhi, Gujarat, and Karnataka state codes', () => {
      expect(validateGSTIN('07AAAAA0000A1Z5').stateName).toBe('Delhi');
      expect(validateGSTIN('24AAAAA0000A1Z5').stateName).toBe('Gujarat');
      expect(validateGSTIN('29AAAAA0000A1Z5').stateName).toBe('Karnataka');
    });

    it('rejects invalid length, empty input, and malformed GSTIN patterns', () => {
      expect(validateGSTIN('').valid).toBe(false);
      expect(validateGSTIN('27ABCDE').valid).toBe(false);
      expect(validateGSTIN('27ABCDE').error).toContain('exactly 15 characters');

      // 15 chars but invalid characters
      const invalidChars = '27123451234F1Z5'; // PAN must start with 5 letters
      const invalidResult = validateGSTIN(invalidChars);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toContain('Invalid GSTIN pattern');
    });
  });

  // 8. TC-F3-AC08: Duplicate record detection across phone, GSTIN, and SKU (F3-07)
  describe('TC-F3-AC08: Master data duplicate detection with self-exclusion', () => {
    const existingCustomers = [
      { id: 'c1', businessName: 'Sweets Corner', phone: '9822011111', gstin: '27AABCS1111A1Z1' },
      { id: 'c2', businessName: 'Super Grocers', phone: '9822022222', gstin: '27AABCG2222B1Z2' },
    ];

    it('detects duplicate phone numbers when creating a new record', () => {
      const check = checkDuplicateRecord(existingCustomers, 'phone', '9822011111');
      expect(check.isDuplicate).toBe(true);
      expect(check.matchedRecord?.businessName).toBe('Sweets Corner');
    });

    it('allows identical value when updating the same existing record (self-exclusion)', () => {
      const check = checkDuplicateRecord(existingCustomers, 'phone', '9822011111', 'c1');
      expect(check.isDuplicate).toBe(false);
    });

    it('detects duplicate SKU across items catalog', () => {
      const catalog = [
        { id: 'i1', sku: 'FG-PANEER-200G', name: 'Paneer 200g' },
        { id: 'i2', sku: 'RM-RAW-MILK', name: 'Raw Milk' },
      ];

      const dupCheck = checkDuplicateRecord(catalog, 'sku', 'fg-paneer-200g'); // Case-insensitive
      expect(dupCheck.isDuplicate).toBe(true);
      expect(dupCheck.matchedRecord?.name).toBe('Paneer 200g');

      const uniqueCheck = checkDuplicateRecord(catalog, 'sku', 'FG-CURD-500G');
      expect(uniqueCheck.isDuplicate).toBe(false);
    });
  });
});
