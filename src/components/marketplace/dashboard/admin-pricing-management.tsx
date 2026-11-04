"use client";

import { useState, useMemo } from "react";
import { useT } from "@/hooks/use-t";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { formatUsd } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Tag,
  Plus,
  Flame,
  Calendar,
  Clock,
  ShieldCheck,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  Percent,
  Search,
  Filter,
  Layers,
  ArrowRight,
  Loader2,
  Trash2,
  Edit2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PriceType {
  id: string;
  code: string;
  label: string;
  mode: "FIXED" | "PERCENT";
  badgeColor: string;
  priority: number;
  stackable: boolean;
  active: boolean;
  createdAt: string;
}

export interface AdminVehicleItem {
  id: string;
  make: string;
  model: string;
  year: number;
  priceUsd: number;
  effectivePriceUsd?: number;
  floorPriceUsd?: number | null;
  floorEnforced?: boolean;
  isOnSale?: boolean;
  activePriceType?: { code: string; label: string; badgeColor: string; mode: string } | null;
  stockNo?: string | null;
  chassisNo?: string | null;
  listingCategory?: string;
  status: string;
}

export function AdminPricingManagement() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"types" | "items" | "bulk">("types");

  // Price types query
  const {
    data: typesData,
    loading: loadingTypes,
    refetch: refetchTypes,
  } = useFetch<{ priceTypes: PriceType[] }>("/api/pricing/types");

  // Vehicles query for item price assignment
  const [vehicleSearch, setVehicleSearch] = useState("");
  const {
    data: vehiclesData,
    loading: loadingVehicles,
    refetch: refetchVehicles,
  } = useFetch<{ items: AdminVehicleItem[] }>(
    `/api/vehicles?limit=48&status=ALL${vehicleSearch ? `&q=${encodeURIComponent(vehicleSearch)}` : ""}`,
  );

  const priceTypes = typesData?.priceTypes ?? [];
  const vehicles = vehiclesData?.items ?? [];

  // Modals state
  const [isNewTypeOpen, setIsNewTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<PriceType | null>(null);
  const [newTypeForm, setNewTypeForm] = useState({
    code: "",
    label: "",
    mode: "PERCENT",
    badgeColor: "#EF4444",
    priority: 50,
    stackable: false,
    active: true,
  });

  // Single Item pricing modal
  const [selectedVehicle, setSelectedVehicle] = useState<AdminVehicleItem | null>(null);
  const [itemPriceForm, setItemPriceForm] = useState({
    priceTypeId: "",
    value: "",
    startDate: "",
    endDate: "",
    active: true,
  });

  // Bulk pricing form
  const [bulkCategory, setBulkCategory] = useState("ALL");
  const [bulkPriceTypeId, setBulkPriceTypeId] = useState("");
  const [bulkPercent, setBulkPercent] = useState("10");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // CSV Import state
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvImportResult, setCsvImportResult] = useState<any>(null);
  const [isCsvSubmitting, setIsCsvSubmitting] = useState(false);

  // Stats
  const activePromoCount = useMemo(
    () => vehicles.filter((v) => v.isOnSale).length,
    [vehicles],
  );

  // Save new Price Type
  const handleCreatePriceType = async () => {
    if (!newTypeForm.code || !newTypeForm.label) {
      toast.error("Please fill in Code and Label");
      return;
    }

    try {
      await apiSend("/api/pricing/types", "POST", {
        ...newTypeForm,
        priority: Number(newTypeForm.priority) || 0,
      });
      toast.success("Price type created successfully");
      setIsNewTypeOpen(false);
      setNewTypeForm({
        code: "",
        label: "",
        mode: "PERCENT",
        badgeColor: "#EF4444",
        priority: 50,
        stackable: false,
        active: true,
      });
      refetchTypes();
    } catch (err: any) {
      toast.error(err.message || "Failed to create price type");
    }
  };

  // Update existing Price Type
  const handleUpdatePriceType = async () => {
    if (!editingType) return;
    try {
      await apiSend(`/api/pricing/types/${editingType.id}`, "PATCH", {
        label: editingType.label,
        mode: editingType.mode,
        badgeColor: editingType.badgeColor,
        priority: Number(editingType.priority) || 0,
        stackable: editingType.stackable,
        active: editingType.active,
      });
      toast.success("Price type updated");
      setEditingType(null);
      refetchTypes();
    } catch (err: any) {
      toast.error(err.message || "Failed to update price type");
    }
  };

  // Save individual item price
  const handleSaveItemPrice = async () => {
    if (!selectedVehicle || !itemPriceForm.priceTypeId || !itemPriceForm.value) {
      toast.error("Please select a price type and enter an amount");
      return;
    }

    try {
      await apiSend("/api/pricing/items", "POST", {
        vehicleId: selectedVehicle.id,
        priceTypeId: itemPriceForm.priceTypeId,
        value: Number(itemPriceForm.value),
        startDate: itemPriceForm.startDate ? new Date(itemPriceForm.startDate).toISOString() : null,
        endDate: itemPriceForm.endDate ? new Date(itemPriceForm.endDate).toISOString() : null,
        active: itemPriceForm.active,
      });
      toast.success(`Promotional price applied to ${selectedVehicle.make} ${selectedVehicle.model}`);
      setSelectedVehicle(null);
      refetchVehicles();
    } catch (err: any) {
      toast.error(err.message || "Failed to set promotional price");
    }
  };

  // Apply X% to category or selection
  const handleApplyBulkPricing = async () => {
    if (!bulkPriceTypeId || !bulkPercent) {
      toast.error("Please choose a price type and discount percentage");
      return;
    }

    const filteredVehicles = vehicles.filter((v) =>
      bulkCategory === "ALL" ? true : v.listingCategory === bulkCategory,
    );

    if (filteredVehicles.length === 0) {
      toast.warning("No listings found matching the selected category");
      return;
    }

    setIsBulkSubmitting(true);
    try {
      const res = await apiSend<any>("/api/pricing/bulk", "POST", {
        vehicleIds: filteredVehicles.map((v) => v.id),
        priceTypeId: bulkPriceTypeId,
        value: Number(bulkPercent),
        startDate: bulkStartDate ? new Date(bulkStartDate).toISOString() : null,
        endDate: bulkEndDate ? new Date(bulkEndDate).toISOString() : null,
      });

      toast.success(
        `Applied to ${res.updatedCount} listings (${res.floorEnforcedCount} clamped by floor price)`,
      );
      refetchVehicles();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply bulk pricing");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // CSV Import Submit
  const handleCsvImport = async () => {
    if (!csvText.trim()) {
      toast.error("No CSV data to import");
      return;
    }

    setIsCsvSubmitting(true);
    try {
      const res = await apiSend<any>("/api/pricing/csv-import", "POST", {
        csv: csvText,
      });
      setCsvImportResult(res);
      toast.success(`Imported ${res.importedCount} rows successfully`);
      refetchVehicles();
    } catch (err: any) {
      toast.error(err.message || "CSV import failed");
    } finally {
      setIsCsvSubmitting(false);
    }
  };

  const handleCsvFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const downloadSampleCsv = () => {
    const sample = `stock_no,price_type,value,start_date,end_date\nSTK-1001,HOT_PRICE,21000,2026-11-01,2026-12-01\nSTK-1002,PROMOTE_PRICE,15,2026-11-05,2026-11-20\nSTK-1003,DISCOUNT_PRICE,10,,\n`;
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "khlan_pricing_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in-50">
      {/* Platform Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white font-bold">
              <DollarSign className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Flexible Pricing & Promotional Engine
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Configure priority-based promotional tiers, schedule start/end dates, enforce floor prices, and execute bulk discounts.
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2 text-center">
            <span className="text-[11px] font-medium text-slate-500">Active Price Types</span>
            <div className="text-base font-bold text-slate-900">{priceTypes.filter((p) => p.active).length}</div>
          </div>

          <div className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-2 text-center">
            <span className="text-[11px] font-medium text-rose-700">Listings on Sale</span>
            <div className="text-base font-bold text-rose-800">{activePromoCount}</div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2 text-center">
            <span className="text-[11px] font-medium text-emerald-700">Floor Price Shield</span>
            <div className="flex items-center justify-center gap-1 text-base font-bold text-emerald-800">
              <ShieldCheck className="h-4 w-4" /> Enforced
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("types")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "types"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Price Types Config</span>
          <Badge className="ml-1 bg-slate-700 text-white text-[10px]">{priceTypes.length}</Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "items"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          <DollarSign className="h-3.5 w-3.5" />
          <span>Item Pricing & Schedule</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bulk")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "bulk"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Bulk Pricing & CSV Import</span>
        </button>
      </div>

      {/* TAB 1: PRICE TYPES MANAGEMENT */}
      {activeTab === "types" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Marketplace Promotional Price Tiers</h3>
            <Button
              type="button"
              size="sm"
              onClick={() => setIsNewTypeOpen(true)}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Price Type
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Code</th>
                    <th className="px-4 py-3 font-semibold">Label</th>
                    <th className="px-4 py-3 font-semibold">Mode</th>
                    <th className="px-4 py-3 font-semibold">Badge Preview</th>
                    <th className="px-4 py-3 font-semibold">Active</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {priceTypes.map((pt) => (
                    <tr key={pt.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-800">{pt.priority}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {pt.code}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{pt.label}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">
                          {pt.mode === "PERCENT" ? "PERCENT (%)" : "FIXED ($)"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className="text-white border-0 text-[10px] gap-1 font-bold"
                          style={{ backgroundColor: pt.badgeColor }}
                        >
                          <Flame className="h-3 w-3 fill-white" />
                          {pt.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={pt.active}
                          onCheckedChange={async (active) => {
                            await apiSend(`/api/pricing/types/${pt.id}`, "PATCH", { active });
                            refetchTypes();
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingType(pt)}
                          className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ITEM PRICING & DATE SCHEDULING */}
      {activeTab === "items" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800">Listing Promotional Prices & Schedules</h3>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Search listing by make, model, stock#..."
                className="h-8.5 pl-9 text-xs"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Stock / Chassis</th>
                    <th className="px-4 py-3 font-semibold">Base Price</th>
                    <th className="px-4 py-3 font-semibold">Floor Price</th>
                    <th className="px-4 py-3 font-semibold">Effective Price</th>
                    <th className="px-4 py-3 font-semibold">Active Promo</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {v.make} {v.model} ({v.year})
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">
                          {v.listingCategory || "CAR"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {v.stockNo || v.chassisNo || "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        {formatUsd(v.priceUsd)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        {v.floorPriceUsd ? formatUsd(v.floorPriceUsd) : "—"}
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-600">
                        {formatUsd(v.effectivePriceUsd || v.priceUsd)}
                        {v.floorEnforced && (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] text-amber-800 font-bold">
                            FLOOR
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {v.activePriceType && v.isOnSale ? (
                          <Badge
                            className="text-white text-[10px] gap-1 font-bold"
                            style={{ backgroundColor: v.activePriceType.badgeColor }}
                          >
                            <Flame className="h-2.5 w-2.5 fill-white" />
                            {v.activePriceType.label}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">Regular</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedVehicle(v);
                            setItemPriceForm({
                              priceTypeId: priceTypes[0]?.id || "",
                              value: "",
                              startDate: "",
                              endDate: "",
                              active: true,
                            });
                          }}
                          className="h-7 text-xs font-semibold"
                        >
                          Set Price
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BULK PRICING & CSV IMPORT */}
      {activeTab === "bulk" && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Tool 1: Apply X% to Selection */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 font-bold">
                <Percent className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Apply % Discount to Selection</h3>
            </div>
            <p className="text-xs text-slate-500">
              Bulk update listings by category with a promotional rate, scheduled launch date, and auto floor price enforcement.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs text-slate-600">Target Category</Label>
                <Select value={bulkCategory} onValueChange={setBulkCategory}>
                  <SelectTrigger className="mt-1 h-9 bg-slate-50 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Categories</SelectItem>
                    <SelectItem value="CAR">Cars Only</SelectItem>
                    <SelectItem value="MOTOR">Motorcycles Only</SelectItem>
                    <SelectItem value="SPARE_PART">Spare Parts Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-slate-600">Promotional Price Type</Label>
                <Select value={bulkPriceTypeId} onValueChange={setBulkPriceTypeId}>
                  <SelectTrigger className="mt-1 h-9 bg-slate-50 text-xs">
                    <SelectValue placeholder="Select Price Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id} className="text-xs">
                        {pt.label} ({pt.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-slate-600">Discount Percentage (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                  placeholder="e.g. 15 for 15% off"
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-slate-600">Start Date (Optional)</Label>
                  <Input
                    type="date"
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">End Date (Optional)</Label>
                  <Input
                    type="date"
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Floor price safety active: Any item whose promotional price falls below its configured floor price will be clamped to its floor price.
                </span>
              </div>

              <Button
                type="button"
                onClick={handleApplyBulkPricing}
                disabled={isBulkSubmitting}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9"
              >
                {isBulkSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Layers className="h-4 w-4 mr-1" />}
                Apply Discount to Listings
              </Button>
            </div>
          </div>

          {/* Tool 2: Bulk CSV Pricing Import */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold">
                  <Upload className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Bulk CSV Pricing Import</h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={downloadSampleCsv}
                className="h-7 text-xs text-slate-600 hover:text-slate-900 gap-1"
              >
                <Download className="h-3 w-3" />
                Sample CSV
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Upload a spreadsheet CSV with vehicle identifiers (`stock_no` or `vehicle_id`), promo code, value, and scheduling dates.
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <Upload className="h-6 w-6 text-slate-400 mb-2" />
                <label className="cursor-pointer text-xs font-semibold text-sky-600 hover:text-sky-700">
                  <span>Browse CSV file</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFilePick}
                    className="sr-only"
                  />
                </label>
                {csvFileName && (
                  <span className="mt-1 text-[11px] font-mono text-slate-600">{csvFileName}</span>
                )}
              </div>

              {csvText && (
                <div>
                  <Label className="text-xs text-slate-600">CSV Raw Preview</Label>
                  <textarea
                    rows={4}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 font-mono text-[11px] text-slate-700 bg-white"
                  />
                </div>
              )}

              {csvImportResult && (
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-800 text-[11px]">
                  <p className="font-bold">Import Status:</p>
                  <p>Applied {csvImportResult.importedCount} of {csvImportResult.totalRows} rows.</p>
                  {csvImportResult.failedCount > 0 && (
                    <p className="text-rose-700">{csvImportResult.failedCount} rows failed.</p>
                  )}
                </div>
              )}

              <Button
                type="button"
                onClick={handleCsvImport}
                disabled={isCsvSubmitting || !csvText.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9"
              >
                {isCsvSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Import & Update Prices
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: CREATE NEW PRICE TYPE */}
      <Dialog open={isNewTypeOpen} onOpenChange={setIsNewTypeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Price Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div>
              <Label className="text-xs">Price Type Code</Label>
              <Input
                placeholder="e.g. CLEARANCE, FLASH_SALE, MEMBER"
                value={newTypeForm.code}
                onChange={(e) => setNewTypeForm({ ...newTypeForm, code: e.target.value })}
                className="mt-1 h-8.5 font-mono text-xs uppercase"
              />
            </div>
            <div>
              <Label className="text-xs">Display Label</Label>
              <Input
                placeholder="e.g. Flash Sale, Clearance Sale"
                value={newTypeForm.label}
                onChange={(e) => setNewTypeForm({ ...newTypeForm, label: e.target.value })}
                className="mt-1 h-8.5 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Calculation Mode</Label>
                <Select
                  value={newTypeForm.mode}
                  onValueChange={(val: any) => setNewTypeForm({ ...newTypeForm, mode: val })}
                >
                  <SelectTrigger className="mt-1 h-8.5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">PERCENT (% Discount)</SelectItem>
                    <SelectItem value="FIXED">FIXED ($ Dollar Promo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Input
                  type="number"
                  value={newTypeForm.priority}
                  onChange={(e) => setNewTypeForm({ ...newTypeForm, priority: Number(e.target.value) })}
                  className="mt-1 h-8.5 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Badge Color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={newTypeForm.badgeColor}
                  onChange={(e) => setNewTypeForm({ ...newTypeForm, badgeColor: e.target.value })}
                  className="h-8.5 w-10 cursor-pointer rounded border border-slate-200 p-0.5"
                />
                <Input
                  value={newTypeForm.badgeColor}
                  onChange={(e) => setNewTypeForm({ ...newTypeForm, badgeColor: e.target.value })}
                  className="h-8.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setIsNewTypeOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreatePriceType} className="bg-slate-900 text-white">
              Create Price Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDIT PRICE TYPE */}
      {editingType && (
        <Dialog open={Boolean(editingType)} onOpenChange={() => setEditingType(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Price Type ({editingType.code})</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs">Label</Label>
                <Input
                  value={editingType.label}
                  onChange={(e) => setEditingType({ ...editingType, label: e.target.value })}
                  className="mt-1 h-8.5 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Mode</Label>
                  <Select
                    value={editingType.mode}
                    onValueChange={(val: any) => setEditingType({ ...editingType, mode: val })}
                  >
                    <SelectTrigger className="mt-1 h-8.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENT">PERCENT (%)</SelectItem>
                      <SelectItem value="FIXED">FIXED ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={editingType.priority}
                    onChange={(e) => setEditingType({ ...editingType, priority: Number(e.target.value) })}
                    className="mt-1 h-8.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Badge Color</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={editingType.badgeColor}
                    onChange={(e) => setEditingType({ ...editingType, badgeColor: e.target.value })}
                    className="h-8.5 w-10 cursor-pointer rounded border border-slate-200 p-0.5"
                  />
                  <Input
                    value={editingType.badgeColor}
                    onChange={(e) => setEditingType({ ...editingType, badgeColor: e.target.value })}
                    className="h-8.5 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={editingType.active}
                  onCheckedChange={(active) => setEditingType({ ...editingType, active })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setEditingType(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleUpdatePriceType} className="bg-slate-900 text-white">
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: SET ITEM PROMOTIONAL PRICE */}
      {selectedVehicle && (
        <Dialog open={Boolean(selectedVehicle)} onOpenChange={() => setSelectedVehicle(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Set Promo Price: {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500">Base Price:</span>
                  <div className="font-bold text-slate-800">{formatUsd(selectedVehicle.priceUsd)}</div>
                </div>
                <div>
                  <span className="text-slate-500">Floor Price:</span>
                  <div className="font-bold text-amber-700">
                    {selectedVehicle.floorPriceUsd ? formatUsd(selectedVehicle.floorPriceUsd) : "None"}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">Price Type Tier</Label>
                <Select
                  value={itemPriceForm.priceTypeId}
                  onValueChange={(val) => setItemPriceForm({ ...itemPriceForm, priceTypeId: val })}
                >
                  <SelectTrigger className="mt-1 h-8.5 text-xs">
                    <SelectValue placeholder="Choose Price Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id} className="text-xs">
                        {pt.label} ({pt.mode === "PERCENT" ? "% Discount" : "Fixed $ Price"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Promotional Value</Label>
                <Input
                  type="number"
                  placeholder="e.g. 15 for 15% off, or 21000 for fixed $21,000"
                  value={itemPriceForm.value}
                  onChange={(e) => setItemPriceForm({ ...itemPriceForm, value: e.target.value })}
                  className="mt-1 h-8.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={itemPriceForm.startDate}
                    onChange={(e) => setItemPriceForm({ ...itemPriceForm, startDate: e.target.value })}
                    className="mt-1 h-8.5 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={itemPriceForm.endDate}
                    onChange={(e) => setItemPriceForm({ ...itemPriceForm, endDate: e.target.value })}
                    className="mt-1 h-8.5 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs">Active Immediately</Label>
                <Switch
                  checked={itemPriceForm.active}
                  onCheckedChange={(active) => setItemPriceForm({ ...itemPriceForm, active })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setSelectedVehicle(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveItemPrice} className="bg-slate-900 text-white">
                Save Price
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

