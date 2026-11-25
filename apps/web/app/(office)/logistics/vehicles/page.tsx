'use client';

import React, { useState, useEffect } from 'react';
import {
  DataTable,
  type ColumnDef,
  Button,
  KpiCard,
  Badge,
  StatusPill,
  Dialog,
  exportToCsv,
} from '@neo/ui';

export interface VehicleRecord {
  id: string;
  registrationNumber: string;
  vehicleType: 'MINI_TRUCK' | '14FT_TRUCK' | 'REEFER' | '3_WHEELER';
  capacityKg: number;
  capacityCrates: number;
  ownershipType: 'OWNED' | 'HIRED';
  defaultDriverName?: string;
  defaultDriverPhone?: string;
  fitnessExpiryDate: string;
  insuranceExpiryDate: string;
  pucExpiryDate: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'MAINTENANCE' | 'INACTIVE';
  active: boolean;
}


export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/proxy/vehicles')
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setVehicles(
          rows.map((v: any) => ({
            id: String(v.id),
            registrationNumber: String(v.registration_no || v.registrationNumber || v.regNo || ''),
            vehicleType: (v.vehicle_type || v.vehicleType || 'MINI_TRUCK') as VehicleRecord['vehicleType'],
            capacityKg: Number(v.capacity_kg ?? v.capacityKg ?? 1000),
            capacityCrates: Number(v.capacity_crates ?? v.capacityCrates ?? 50),
            ownershipType: (v.ownership_type || v.ownershipType || 'OWNED') as VehicleRecord['ownershipType'],
            defaultDriverName: v.default_driver_name || v.defaultDriverName || '',
            defaultDriverPhone: v.default_driver_phone || v.defaultDriverPhone || '',
            fitnessExpiryDate: String(v.fitness_expiry || v.fitnessExpiryDate || '').slice(0, 10),
            insuranceExpiryDate: String(v.insurance_expiry || v.insuranceExpiryDate || '').slice(0, 10),
            pucExpiryDate: String(v.puc_expiry || v.pucExpiryDate || '').slice(0, 10),
            status: (v.status || 'AVAILABLE') as VehicleRecord['status'],
            active: v.is_active !== false,
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<string>('ALL');

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleRecord | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Form fields
  const [regNo, setRegNo] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleRecord['vehicleType']>('MINI_TRUCK');
  const [capacityKg, setCapacityKg] = useState('1000');
  const [capacityCrates, setCapacityCrates] = useState('50');
  const [ownershipType, setOwnershipType] = useState<VehicleRecord['ownershipType']>('OWNED');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [fitnessExpiry, setFitnessExpiry] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [pucExpiry, setPucExpiry] = useState('');

  const openNewForm = () => {
    setEditingVehicle(null);
    setRegNo('MH-12-');
    setVehicleType('MINI_TRUCK');
    setCapacityKg('1000');
    setCapacityCrates('50');
    setOwnershipType('OWNED');
    setDriverName('');
    setDriverPhone('');
    setFitnessExpiry('2027-12-31');
    setInsuranceExpiry('2027-12-31');
    setPucExpiry('2027-06-30');
    setFormErrors({});
    setFormOpen(true);
  };

  const openEditForm = (v: VehicleRecord) => {
    setEditingVehicle(v);
    setRegNo(v.registrationNumber);
    setVehicleType(v.vehicleType);
    setCapacityKg(String(v.capacityKg));
    setCapacityCrates(String(v.capacityCrates));
    setOwnershipType(v.ownershipType);
    setDriverName(v.defaultDriverName || '');
    setDriverPhone(v.defaultDriverPhone || '');
    setFitnessExpiry(v.fitnessExpiryDate);
    setInsuranceExpiry(v.insuranceExpiryDate);
    setPucExpiry(v.pucExpiryDate);
    setFormErrors({});
    setFormOpen(true);
  };

  const handleSaveVehicle = () => {
    const errors: Record<string, string> = {};
    const cleanReg = regNo.trim().toUpperCase();
    if (!cleanReg) errors.regNo = 'Registration number is required.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const newRec: VehicleRecord = {
      id: editingVehicle ? editingVehicle.id : `veh-${Date.now()}`,
      registrationNumber: cleanReg,
      vehicleType,
      capacityKg: parseInt(capacityKg, 10) || 1000,
      capacityCrates: parseInt(capacityCrates, 10) || 50,
      ownershipType,
      defaultDriverName: driverName.trim(),
      defaultDriverPhone: driverPhone.trim(),
      fitnessExpiryDate: fitnessExpiry,
      insuranceExpiryDate: insuranceExpiry,
      pucExpiryDate: pucExpiry,
      status: editingVehicle ? editingVehicle.status : 'AVAILABLE',
      active: editingVehicle ? editingVehicle.active : true,
    };

    if (editingVehicle) {
      setVehicles((prev) => prev.map((v) => (v.id === editingVehicle.id ? newRec : v)));
    } else {
      setVehicles((prev) => [newRec, ...prev]);
    }
    setFormOpen(false);
  };

  // Helper for expiry check
  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr) return false;
    const diffDays = (new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    return diffDays < 30; // within 30 days
  };

  // KPIs
  const totalVehicles = vehicles.length;
  const onTripCount = vehicles.filter((v) => v.status === 'ON_TRIP').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'MAINTENANCE').length;
  const totalCapacityKg = vehicles.reduce((sum, v) => sum + v.capacityKg, 0);

  const filteredVehicles = vehicles.filter((v) => {
    if (typeFilter !== 'ALL' && v.vehicleType !== typeFilter) return false;
    if (ownershipFilter !== 'ALL' && v.ownershipType !== ownershipFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        v.registrationNumber.toLowerCase().includes(q) ||
        (v.defaultDriverName && v.defaultDriverName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const columns: ColumnDef<VehicleRecord>[] = [
    {
      id: 'regNo',
      header: 'Registration No.',
      accessorKey: 'registrationNumber',
      cell: (info) => (
        <span className="font-mono text-xs font-bold text-action">
          {info.getValue() as string}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Vehicle Type & Ownership',
      cell: (info) => {
        const v = info.row.original;
        return (
          <div className="text-xs">
            <div className="font-bold text-ink">{v.vehicleType.replace('_', ' ')}</div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              <Badge tone={v.ownershipType === 'OWNED' ? 'brand' : 'neutral'}>
                {v.ownershipType}
              </Badge>
            </div>
          </div>
        );
      },
    },
    {
      id: 'capacity',
      header: 'Payload Capacity',
      cell: (info) => {
        const v = info.row.original;
        return (
          <div className="text-xs font-mono">
            <div className="font-bold text-ink">{v.capacityKg} kg</div>
            <div className="text-ink-3 text-[11px]">{v.capacityCrates} crates</div>
          </div>
        );
      },
    },
    {
      id: 'driver',
      header: 'Assigned Driver',
      cell: (info) => {
        const v = info.row.original;
        return (
          <div className="text-xs">
            <div className="font-semibold text-ink">{v.defaultDriverName || 'Unassigned'}</div>
            {v.defaultDriverPhone && (
              <a href={`tel:${v.defaultDriverPhone}`} className="text-action font-mono text-[11px] hover:underline">
                📞 {v.defaultDriverPhone}
              </a>
            )}
          </div>
        );
      },
    },
    {
      id: 'documents',
      header: 'Compliance & Expiries',
      cell: (info) => {
        const v = info.row.original;
        const pucAlert = isExpiringSoon(v.pucExpiryDate);
        const fitAlert = isExpiringSoon(v.fitnessExpiryDate);
        return (
          <div className="text-[11px] space-y-0.5">
            <div className={fitAlert ? 'text-amber-400 font-semibold' : 'text-ink-3'}>
              Fitness: {v.fitnessExpiryDate} {fitAlert && '⚠️'}
            </div>
            <div className={pucAlert ? 'text-rose-400 font-semibold' : 'text-ink-3'}>
              PUC: {v.pucExpiryDate} {pucAlert && '⚠️'}
            </div>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      cell: (info) => {
        const status = info.getValue() as VehicleRecord['status'];
        const tone =
          status === 'AVAILABLE' ? 'success' : status === 'ON_TRIP' ? 'info' : status === 'MAINTENANCE' ? 'warning' : 'neutral';
        return <StatusPill tone={tone} label={status.replace('_', ' ')} />;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const v = info.row.original;
        return (
          <button
            onClick={() => openEditForm(v)}
            className="text-xs text-action hover:text-action font-medium"
          >
            Edit
          </button>
        );
      },
    },
  ];

  const handleExportCsv = () => {
    exportToCsv(
      'vehicles-fleet.csv',
      filteredVehicles,
      [
        { key: 'registrationNumber', label: 'Registration No' },
        { key: 'vehicleType', label: 'Type' },
        { key: 'ownershipType', label: 'Ownership' },
        { key: (v) => `${v.capacityKg} kg`, label: 'Capacity (Kg)' },
        { key: (v) => `${v.capacityCrates} crates`, label: 'Capacity (Crates)' },
        { key: 'defaultDriverName', label: 'Driver' },
        { key: 'fitnessExpiryDate', label: 'Fitness Expiry' },
        { key: 'pucExpiryDate', label: 'PUC Expiry' },
        { key: 'status', label: 'Status' },
      ],
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action/10 text-action border border-action/30 mb-1.5">
            <span>🚛 Dispatch Logistics</span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">Vehicles & Fleet Master</h1>
          <p className="text-xs text-ink-3 mt-0.5">
            Track owned and hired logistics delivery vehicles, crate capacities, driver defaults, and statutory document expiries.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            📤 Export Fleet CSV
          </Button>
          <Button variant="primary" size="sm" onClick={openNewForm}>
            + Add New Vehicle
          </Button>
        </div>
      </div>

      {/* 2. KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Registered Fleet"
          value={String(totalVehicles)}
          subtitle="Owned & hired vehicles"
          tone="default"
        />
        <KpiCard
          title="Active On Trip"
          value={String(onTripCount)}
          subtitle="Currently on delivery runs"
          tone="default"
        />
        <KpiCard
          title="In Maintenance"
          value={String(maintenanceCount)}
          subtitle="Temporarily unavailable"
          tone={maintenanceCount > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          title="Total Fleet Capacity"
          value={`${(totalCapacityKg / 1000).toFixed(1)} MT`}
          subtitle="Aggregate payload"
          tone="brand"
        />
      </div>

      {/* 3. Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-sheet border border-rule p-4 rounded-[4px]">
        <div className="flex items-center gap-3 flex-1">
          <input
            type="text"
            placeholder="Search by registration number or driver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink placeholder-ink-3 focus:outline-none focus:border-action/30"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink-2 focus:outline-none focus:border-action/30"
          >
            <option value="ALL">All Types</option>
            <option value="MINI_TRUCK">Mini Truck</option>
            <option value="REEFER">Reefer (Cold Van)</option>
            <option value="14FT_TRUCK">14ft Truck</option>
            <option value="3_WHEELER">3-Wheeler</option>
          </select>
          <select
            value={ownershipFilter}
            onChange={(e) => setOwnershipFilter(e.target.value)}
            className="bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink-2 focus:outline-none focus:border-action/30"
          >
            <option value="ALL">All Ownership</option>
            <option value="OWNED">Owned Fleet</option>
            <option value="HIRED">Hired / Third-Party</option>
          </select>
        </div>
      </div>

      {/* 4. DataTable */}
      <DataTable columns={columns} data={filteredVehicles} pageSize={10} />

      {/* 5. Vehicle Form Dialog */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingVehicle ? `Edit Vehicle: ${editingVehicle.registrationNumber}` : 'Register New Vehicle'}
        maxWidth="md"
      >
        <div className="space-y-4 my-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Registration Number *</label>
              <input
                type="text"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                placeholder="e.g. MH-12-RN-4821"
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono uppercase focus:outline-none focus:border-action/30"
              />
              {formErrors.regNo && <p className="text-xs text-madder mt-1">{formErrors.regNo}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Vehicle Type</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as any)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              >
                <option value="MINI_TRUCK">Mini Truck</option>
                <option value="REEFER">Reefer (Insulated Cold Van)</option>
                <option value="14FT_TRUCK">14ft Truck</option>
                <option value="3_WHEELER">3-Wheeler Auto</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Payload Capacity (kg)</label>
              <input
                type="number"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Crate Capacity</label>
              <input
                type="number"
                value={capacityCrates}
                onChange={(e) => setCapacityCrates(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Ownership</label>
              <select
                value={ownershipType}
                onChange={(e) => setOwnershipType(e.target.value as any)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              >
                <option value="OWNED">Company Owned</option>
                <option value="HIRED">Market Hired</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Default Assigned Driver</label>
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver full name"
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Driver Phone</label>
              <input
                type="text"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="Driver mobile number"
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink font-mono focus:outline-none focus:border-action/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Fitness Expiry</label>
              <input
                type="date"
                value={fitnessExpiry}
                onChange={(e) => setFitnessExpiry(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Insurance Expiry</label>
              <input
                type="date"
                value={insuranceExpiry}
                onChange={(e) => setInsuranceExpiry(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">PUC Expiry</label>
              <input
                type="date"
                value={pucExpiry}
                onChange={(e) => setPucExpiry(e.target.value)}
                className="w-full bg-paper border border-rule rounded-[3px] px-3 py-2 text-xs text-ink focus:outline-none focus:border-action/30"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-rule flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveVehicle}>
              {editingVehicle ? 'Save Vehicle' : 'Register Vehicle'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
