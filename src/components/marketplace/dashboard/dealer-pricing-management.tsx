"use client";

import { useState, useMemo, useRef } from "react";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { formatUsd, formatKhr } from "@/lib/format";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import {
  CarFront, Check, ChevronDown, Download, FileSpreadsheet, Filter, Flame,
  Loader2, Pencil, Percent, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck,
  Sparkles, Tag, Trash2, TriangleAlert, Upload, X, Calendar, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DealerPricingVehicle {
  id: string;
  listingCategory: string;
  make: string;
  model: string;
  variant?: string | null;
  year: number;
  stockNo?: string | null;
  chassisNo?: string | null;
  basePriceUsd: number;
  effectivePriceUsd: number;
  floorPriceUsd?: number | null;
  floorEnforced: boolean;
  isOnSale: boolean;
  activePriceType?: {
    id: string;
    code: string;
    label: string;
    badgeColor: string;
    mode: string;
  } | null;
  activeItemPrice?: {
    id: string;
    value: number;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  branch?: {
    id: string;
    name: string;
    city: string;
  } | null;
  images: string[];
  status: string;
}

interface PriceTypeDTO {
  id: string;
  code: string;
  label: string;
  mode: string;
  badgeColor: string;
  priority: number;
}

export function DealerPricingManagement() {
  const t = useT();
  const [category, setCategory] = useState<string>("ALL");
  const [branchId, setBranchId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [singleVehicle, setSingleVehicle] = useState<DealerPricingVehicle | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bulk promo form state
  const [bulkPriceTypeId, setBulkPriceTypeId] = useState("");
  const [bulkValue, setBulkValue] = useState("10");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");

  // Single vehicle promo form state
  const [singlePriceTypeId, setSinglePriceTypeId] = useState("");
  const [singleValue, setSingleValue] = useState("");
  const [singleFloorPrice, setSingleFloorPrice] = useState("");
  const [singleStartDate, setSingleStartDate] = useState("");
  const [singleEndDate, setSingleEndDate] = useState("");

  // CSV import state
  const [csvText, setCsvText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch branches
  const { data: branchData } = useFetch<{ branches: { id: string; name: string; city: string }[] }>("/api/tenant/branches");
  const branches = branchData?.branches ?? [];

  // Fetch available promo tiers
  const { data: promoTypesData } = useFetch<{ types: PriceTypeDTO[] }>("/api/seller/pricing/available-types");
  const priceTypes = promoTypesData?.types ?? [];

  // Fetch pricing inventory
  const queryParams = new URLSearchParams();
  if (category !== "ALL") queryParams.set("category", category);
  if (branchId !== "ALL") queryParams.set("branchId", branchId);
  if (search.trim()) queryParams.set("q", search.trim());
  if (onSaleOnly) queryParams.set("onSaleOnly", "true");

  const { data, loading, refetch } = useFetch<{
    vehicles: DealerPricingVehicle[];
    totalCount: number;
    onSaleCount: number;
  }>(`/api/seller/pricing/inventory?${queryParams.toString()}`);

  const vehicles = data?.vehicles ?? [];
  const totalCount = data?.totalCount ?? 0;
  const onSaleCount = data?.onSaleCount ?? 0;

  // Selected promo type for bulk
  const selectedBulkType = useMemo(
    () => priceTypes.find((p) => p.id === bulkPriceTypeId) ?? priceTypes[0],
    [priceTypes, bulkPriceTypeId]
  );

  // Bulk preflight preview calculation
  const bulkPreviewStats = useMemo(() => {
    if (selectedIds.length === 0 || !selectedBulkType) {
      return { totalSelected: 0, clampedCount: 0, avgDiscount: 0 };
    }
    const val = Number(bulkValue) || 0;
    const selectedVehicles = vehicles.filter((v) => selectedIds.includes(v.id));
    let clampedCount = 0;
    let totalDiscount = 0;

    for (const v of selectedVehicles) {
      const base = v.basePriceUsd;
      let candidate = base;
      if (selectedBulkType.mode === "PERCENT") {
        candidate = Math.round(base * (1 - Math.min(val, 100) / 100));
      } else {
        candidate = Math.max(0, Math.round(base - val));
      }
      const floor = v.floorPriceUsd;
      if (floor != null && floor > 0 && candidate < floor) {
        clampedCount++;
        candidate = floor;
      }
      totalDiscount += Math.max(0, base - candidate);
    }

    return {
      totalSelected: selectedVehicles.length,
      clampedCount,
      avgDiscount: selectedVehicles.length > 0 ? Math.round(totalDiscount / selectedVehicles.length) : 0,
    };
  }, [vehicles, selectedIds, selectedBulkType, bulkValue]);

  // Single vehicle live preview
  const singlePreview = useMemo(() => {
    if (!singleVehicle) return null;
    const base = singleVehicle.basePriceUsd;
    const floor = singleFloorPrice ? Number(singleFloorPrice) : null;
    const promoVal = Number(singleValue) || 0;
    const selectedType = priceTypes.find((p) => p.id === singlePriceTypeId);

    let candidate = base;
    if (selectedType && promoVal > 0) {
      if (selectedType.mode === "PERCENT") {
        candidate = Math.round(base * (1 - Math.min(promoVal, 100) / 100));
      } else {
        if (promoVal < base) {
          candidate = Math.round(promoVal);
        }
      }
    }

    const floorClamped = floor != null && floor > 0 && candidate < floor;
    const effective = floorClamped ? (floor as number) : candidate;
    const discountUsd = Math.max(0, base - effective);
    const discountPercent = base > 0 ? Math.round((discountUsd / base) * 100) : 0;

    return {
      base,
      candidate,
      effective,
      floor,
      floorClamped,
      discountUsd,
      discountPercent,
      selectedType,
    };
  }, [singleVehicle, singlePriceTypeId, singleValue, singleFloorPrice, priceTypes]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.length === vehicles.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(vehicles.map((v) => v.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Open single promo dialog
  const openSinglePromo = (v: DealerPricingVehicle) => {
    setSingleVehicle(v);
    setSinglePriceTypeId(v.activePriceType?.id || (priceTypes[0]?.id ?? ""));
    setSingleValue(v.activeItemPrice?.value ? String(v.activeItemPrice.value) : "10");
    setSingleFloorPrice(v.floorPriceUsd ? String(v.floorPriceUsd) : "");
    setSingleStartDate(v.activeItemPrice?.startDate ? v.activeItemPrice.startDate.slice(0, 16) : "");
    setSingleEndDate(v.activeItemPrice?.endDate ? v.activeItemPrice.endDate.slice(0, 16) : "");
  };

  // Submit single vehicle promotion
  const handleSaveSinglePromo = async () => {
    if (!singleVehicle) return;
    const val = Number(singleValue);
    if (!val || val <= 0) {
      toast.warning("Please enter a valid promotional discount value");
      return;
    }

    setSubmitting(true);
    try {
      await apiSend("/api/seller/pricing/item", "POST", {
        vehicleId: singleVehicle.id,
        priceTypeId: singlePriceTypeId || priceTypes[0]?.id,
        value: val,
        floorPriceUsd: singleFloorPrice ? Number(singleFloorPrice) : null,
        startDate: singleStartDate ? new Date(singleStartDate).toISOString() : null,
        endDate: singleEndDate ? new Date(singleEndDate).toISOString() : null,
      });
      toast.success("Promotional tier applied successfully!");
      setSingleVehicle(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to update vehicle pricing");
    } finally {
      setSubmitting(false);
    }
  };

  // Remove promotion from single vehicle
  const handleClearSinglePromo = async (vehicleId: string) => {
    setSubmitting(true);
    try {
      await apiSend(`/api/seller/pricing/item?vehicleId=${vehicleId}`, "DELETE");
      toast.success("Promotion removed. Listing restored to base price.");
      setSingleVehicle(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove promotion");
    } finally {
      setSubmitting(false);
    }
  };

  // Apply bulk promotion to selected vehicles
  const handleApplyBulk = async () => {
    if (selectedIds.length === 0) return;
    const val = Number(bulkValue);
    if (!val || val <= 0) {
      toast.warning("Please enter a valid promotion discount value");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiSend<{
        success: boolean;
        updatedCount: number;
        floorEnforcedCount: number;
      }>("/api/seller/pricing/bulk", "POST", {
        vehicleIds: selectedIds,
        priceTypeId: bulkPriceTypeId || priceTypes[0]?.id,
        value: val,
        startDate: bulkStartDate ? new Date(bulkStartDate).toISOString() : null,
        endDate: bulkEndDate ? new Date(bulkEndDate).toISOString() : null,
      });

      toast.success(
        `Applied promo to ${res.updatedCount} listings.${res.floorEnforcedCount > 0 ? ` (${res.floorEnforcedCount} clamped by floor protection)` : ""}`
      );
      setBulkModalOpen(false);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply bulk pricing");
    } finally {
      setSubmitting(false);
    }
  };

  // 1-Click Clear Bulk Promotions
  const handleClearBulkPromos = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to remove active promotions from ${selectedIds.length} listings?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiSend<{ success: boolean; vehicleCount: number }>("/api/seller/pricing/bulk", "DELETE", {
        vehicleIds: selectedIds,
      });
      toast.success(`Removed promotions from ${res.vehicleCount} listings.`);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to clear promotions");
    } finally {
      setSubmitting(false);
    }
  };

  // Export current inventory pricing to CSV
  const handleExportCsv = () => {
    if (vehicles.length === 0) {
      toast.warning("No listings to export");
      return;
    }

    const headers = [
      "vehicle_id",
      "stock_no",
      "make",
      "model",
      "year",
      "base_price_usd",
      "floor_price_usd",
      "effective_price_usd",
      "on_sale",
      "price_type_code",
      "promo_value",
      "start_date",
      "end_date",
    ];

    const lines = [headers.join(",")];

    for (const v of vehicles) {
      lines.push([
        v.id,
        v.stockNo || "",
        `"${v.make}"`,
        `"${v.model}"`,
        v.year,
        v.basePriceUsd,
        v.floorPriceUsd || "",
        v.effectivePriceUsd,
        v.isOnSale ? "TRUE" : "FALSE",
        v.activePriceType?.code || "",
        v.activeItemPrice?.value || "",
        v.activeItemPrice?.startDate || "",
        v.activeItemPrice?.endDate || "",
      ].join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dealership_pricing_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pricing CSV downloaded");
  };

  // Handle CSV file selection
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText((event.target?.result as string) || "");
    };
    reader.readAsText(file);
  };

  // Submit CSV import
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      toast.warning("Please select or paste CSV data");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiSend<{
        success: boolean;
        updatedCount: number;
        floorEnforcedCount: number;
        errorCount: number;
        errors?: Array<{ row: number; identifier: string; error: string }>;
      }>("/api/seller/pricing/csv", "POST", { csv: csvText });

      if (res.updatedCount > 0) {
        toast.success(`Successfully updated ${res.updatedCount} listings from CSV!`);
      }
      if (res.errorCount > 0) {
        toast.warning(`${res.errorCount} rows skipped due to invalid data.`);
      }
      setCsvModalOpen(false);
      setCsvText("");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to import CSV");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Total Listings</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalCount}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Dealership inventory</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-900">Active Campaigns</p>
            <Flame className="h-4 w-4 text-amber-600 animate-pulse" />
          </div>
          <p className="mt-1 text-2xl font-black text-amber-950">{onSaleCount}</p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            {totalCount > 0 ? `${Math.round((onSaleCount / totalCount) * 100)}% of stock on sale` : "No vehicles"}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-900">Floor Protection</p>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-black text-emerald-950">
            {vehicles.filter((v) => v.floorPriceUsd != null && v.floorPriceUsd > 0).length}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-800">Protected against undercutting</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">Available Tiers</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{priceTypes.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Hot Price, Discount, Flash</p>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {["ALL", "CAR", "MOTOR", "SPARE_PART"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                  category === c ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {c === "ALL" ? "All" : c === "CAR" ? "Cars" : c === "MOTOR" ? "Motors" : "Parts"}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="text-xs h-9 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCsvModalOpen(true)}
              className="text-xs h-9 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              Import CSV
            </Button>

            <Button
              size="sm"
              onClick={() => {
                if (selectedIds.length === 0) {
                  toast.info("Please select one or more listings below to apply a promotion");
                  return;
                }
                setBulkModalOpen(true);
              }}
              disabled={selectedIds.length === 0}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-xs h-9 cursor-pointer"
            >
              <Flame className="h-3.5 w-3.5 mr-1.5" />
              Apply Promo ({selectedIds.length})
            </Button>

            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearBulkPromos}
                className="text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear Promo ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>

        {/* Search, Branch filter, and On-Sale toggle */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          <div className="sm:col-span-6 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by make, model, stock no..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {branches.length > 0 && (
            <div className="sm:col-span-3">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Showrooms</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.city})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="sm:col-span-3 flex items-center justify-end gap-2 px-1">
            <Label htmlFor="dealer-on-sale" className="text-xs font-semibold text-slate-600 cursor-pointer">
              On-Sale Only
            </Label>
            <Switch
              id="dealer-on-sale"
              checked={onSaleOnly}
              onCheckedChange={setOnSaleOnly}
            />
          </div>
        </div>
      </div>

      {/* Inventory Pricing Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading && vehicles.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500 mb-2" />
            <p className="text-xs">Loading promotional inventory...</p>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CarFront className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No listings found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === vehicles.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer h-4 w-4"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="py-3 px-4">Vehicle Listing</th>
                  <th className="py-3 px-4">Showroom</th>
                  <th className="py-3 px-4">Base Price</th>
                  <th className="py-3 px-4">Floor Price</th>
                  <th className="py-3 px-4">Effective Price</th>
                  <th className="py-3 px-4">Active Promo</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map((v) => {
                  const isChecked = selectedIds.includes(v.id);
                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        "transition-colors hover:bg-slate-50/70",
                        isChecked && "bg-amber-50/30"
                      )}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(v.id)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer h-4 w-4"
                          aria-label={`Select ${v.make} ${v.model}`}
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-14 shrink-0 rounded-lg overflow-hidden bg-slate-100">
                            {v.images[0] ? (
                              <img src={v.images[0]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <CarFront className="h-4 w-4 text-slate-300" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">
                              {v.make} {v.model} {v.variant || ""} {v.year}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {v.stockNo ? `Stock: ${v.stockNo} · ` : ""}{v.listingCategory}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-600">
                          {v.branch ? v.branch.name : "Main Showroom"}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {formatUsd(v.basePriceUsd)}
                      </td>

                      <td className="py-3 px-4">
                        {v.floorPriceUsd != null && v.floorPriceUsd > 0 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            {formatUsd(v.floorPriceUsd)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-extrabold text-slate-900">
                            {formatUsd(v.effectivePriceUsd)}
                          </span>
                          {v.isOnSale && v.effectivePriceUsd < v.basePriceUsd && (
                            <span className="text-[10px] text-slate-400 line-through">
                              {formatUsd(v.basePriceUsd)}
                            </span>
                          )}
                          {v.floorEnforced && (
                            <span className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5 mt-0.5">
                              <ShieldAlert className="h-2.5 w-2.5" /> Clamped to floor
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {v.isOnSale && v.activePriceType ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide text-white shadow-xs"
                            style={{ backgroundColor: v.activePriceType.badgeColor || "#ef4444" }}
                          >
                            <Flame className="h-2.5 w-2.5" />
                            {v.activePriceType.label}
                          </span>
                        ) : (
                          <span className="text-slate-400">Regular</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSinglePromo(v)}
                            className="h-7 text-xs px-2.5 font-medium cursor-pointer"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Pricing
                          </Button>

                          {v.isOnSale && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleClearSinglePromo(v.id)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Clear promotion"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Promo Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-amber-600" />
              Apply Bulk Promotion ({selectedIds.length} Vehicles)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Promotional Tier</Label>
              <div className="mt-1.5">
                <Select value={bulkPriceTypeId} onValueChange={setBulkPriceTypeId}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Select Promotional Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {priceTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>
                        {pt.label} ({pt.mode === "PERCENT" ? "% off" : "Fixed USD $"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">
                {selectedBulkType?.mode === "PERCENT" ? "Discount Percentage (%)" : "Reduction Amount (USD $)"}
              </Label>
              <div className="relative mt-1.5">
                <Input
                  type="number"
                  min={1}
                  max={selectedBulkType?.mode === "PERCENT" ? 99 : undefined}
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder={selectedBulkType?.mode === "PERCENT" ? "10" : "1500"}
                  className="pr-8"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  {selectedBulkType?.mode === "PERCENT" ? "%" : "$"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Start Date</Label>
                <Input
                  type="datetime-local"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="mt-1.5 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">End Date</Label>
                <Input
                  type="datetime-local"
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                  className="mt-1.5 h-9 text-xs"
                />
              </div>
            </div>

            {/* Impact Calculation Summary */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 text-xs">
              <p className="font-bold text-slate-900">Pre-Flight Promotion Summary</p>
              <p className="text-slate-600">
                Target listings: <span className="font-bold text-slate-900">{bulkPreviewStats.totalSelected}</span>
              </p>
              <p className="text-slate-600">
                Average discount: <span className="font-bold text-slate-900">{formatUsd(bulkPreviewStats.avgDiscount)}</span>
              </p>
              {bulkPreviewStats.clampedCount > 0 && (
                <div className="flex items-start gap-1.5 pt-1 text-amber-800 font-medium">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Floor Price Protection active: <span className="font-bold">{bulkPreviewStats.clampedCount} listings</span> will clamp to their minimum floor price.
                  </span>
                </div>
              )}
            </div>
          </div>

            <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyBulk}
              disabled={submitting}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Flame className="h-4 w-4 mr-1" />}
              Apply to {selectedIds.length} Listings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Vehicle Promo Modal */}
      {singleVehicle && (
        <Dialog open={Boolean(singleVehicle)} onOpenChange={(o) => !o && setSingleVehicle(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Tag className="h-5 w-5 text-amber-600" />
                Configure Pricing & Promotions
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center gap-3">
                <div className="h-12 w-16 shrink-0 rounded-lg overflow-hidden bg-slate-200">
                  {singleVehicle.images[0] ? (
                    <img src={singleVehicle.images[0]} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {singleVehicle.make} {singleVehicle.model} {singleVehicle.variant || ""} {singleVehicle.year}
                  </p>
                  <p className="text-xs text-slate-500">
                    Base: <span className="font-semibold text-slate-800">{formatUsd(singleVehicle.basePriceUsd)}</span>
                    {singleVehicle.stockNo ? ` · Stock: ${singleVehicle.stockNo}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-600">Base Price (USD $)</Label>
                  <Input
                    disabled
                    value={singleVehicle.basePriceUsd}
                    className="mt-1.5 bg-slate-100 font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-600">Floor Price Protection ($)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={singleFloorPrice}
                    onChange={(e) => setSingleFloorPrice(e.target.value)}
                    placeholder="e.g. 16500"
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-600">Promotional Tier</Label>
                <div className="mt-1.5">
                  <Select value={singlePriceTypeId} onValueChange={setSinglePriceTypeId}>
                    <SelectTrigger className="h-10 text-xs">
                      <SelectValue placeholder="Select Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {priceTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id}>
                          {pt.label} ({pt.mode === "PERCENT" ? "% off" : "Fixed Target $"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-600">
                  {singlePreview?.selectedType?.mode === "PERCENT" ? "Discount Percentage (%)" : "Promotional Target Price (USD $)"}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={singleValue}
                  onChange={(e) => setSingleValue(e.target.value)}
                  placeholder={singlePreview?.selectedType?.mode === "PERCENT" ? "10" : "17500"}
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-600">Start Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={singleStartDate}
                    onChange={(e) => setSingleStartDate(e.target.value)}
                    className="mt-1.5 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600">End Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={singleEndDate}
                    onChange={(e) => setSingleEndDate(e.target.value)}
                    className="mt-1.5 h-9 text-xs"
                  />
                </div>
              </div>

              {/* Real-time Preview */}
              {singlePreview && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Pricing Resolution Preview</span>
                    {singlePreview.discountUsd > 0 && (
                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px]">
                        Save {formatUsd(singlePreview.discountUsd)} ({singlePreview.discountPercent}% OFF)
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    {singlePreview.discountUsd > 0 && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatUsd(singlePreview.base)}
                      </span>
                    )}
                    <span className="text-xl font-black text-slate-900">
                      {formatUsd(singlePreview.effective)}
                    </span>
                    {singlePreview.selectedType && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs"
                        style={{ backgroundColor: singlePreview.selectedType.badgeColor || "#ef4444" }}
                      >
                        {singlePreview.selectedType.label}
                      </span>
                    )}
                  </div>

                  {singlePreview.floorClamped && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 font-medium">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        Floor Price Enforced: Candidate price of {formatUsd(singlePreview.candidate)} was clamped to your minimum floor price of {formatUsd(singlePreview.floor || 0)}.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-between gap-2">
              {singleVehicle.isOnSale ? (
                <Button
                  variant="outline"
                  onClick={() => handleClearSinglePromo(singleVehicle.id)}
                  disabled={submitting}
                  className="text-rose-600 hover:text-rose-700 border-rose-200"
                >
                  Clear Promo
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSingleVehicle(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveSinglePromo}
                  disabled={submitting}
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save Pricing
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* CSV Import Modal */}
      <Dialog open={csvModalOpen} onOpenChange={setCsvModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Batch Pricing CSV Import
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload a CSV file containing promotional pricing updates. Supported columns:
              <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">vehicle_id</code>,
              <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">price_type</code>,
              <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">value</code>,
              <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">start_date</code>,
              <code className="mx-1 px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">end_date</code>.
            </p>

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileUpload}
                className="hidden"
              />
              <Upload className="h-6 w-6 text-slate-400 mx-auto mb-2" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                Choose CSV File
              </Button>
              <p className="text-[11px] text-slate-400 mt-2">or paste CSV text directly below</p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">CSV Raw Content</Label>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="vehicle_id,price_type,value,start_date,end_date&#10;veh_123,HOT_PRICE,18500,,&#10;veh_456,DISCOUNT_PRICE,10,,"
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCsvModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportCsv}
              disabled={submitting || !csvText.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-500 font-bold text-xs"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Import & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

