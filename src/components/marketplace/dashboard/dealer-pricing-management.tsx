"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { formatUsd, formatKhr } from "@/lib/format";
import { useT } from "@/hooks/use-t";
import { useAppStore } from "@/lib/store";
import {
  getPromoTierLabel,
  bodyTypeLabels,
  transmissionLabels,
  fuelLabels,
  motorBodyTypeLabels,
  partCategoryLabels,
} from "@/lib/i18n/labels";
import {
  CarFront, Bike, Wrench, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Filter, Flame,
  Loader2, Pencil, Percent, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck,
  Sparkles, Tag, Trash2, TriangleAlert, Upload, X, Calendar, DollarSign,
  MoreHorizontal, ExternalLink, Eye, EyeOff, CheckCircle2, Palette, Settings2,
  Boxes, PackagePlus, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingEditorDialog } from "@/components/marketplace/listing-editor";
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
  stockQuantity?: number;
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
  stackable?: boolean;
  active?: boolean;
}

function formatForDateTimeLocal(isoString?: string | null): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
}

export function DealerPricingManagement() {
  const t = useT();
  const locale = useAppStore((s) => s.locale);
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

  // Listing editor & Delete state
  const [editorVehicleId, setEditorVehicleId] = useState<string | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<DealerPricingVehicle | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  // Promo Tiers Management state
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<PriceTypeDTO | null>(null);
  const [tierCode, setTierCode] = useState("");
  const [tierLabel, setTierLabel] = useState("");
  const [tierMode, setTierMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [tierBadgeColor, setTierBadgeColor] = useState("#EF4444");
  const [tierPriority, setTierPriority] = useState("50");
  const [tierActive, setTierActive] = useState(true);
  const [tierSubmitting, setTierSubmitting] = useState(false);

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

  // Quick Add Listing State
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<"CAR" | "MOTOR" | "SPARE_PART">("CAR");
  const [addForm, setAddForm] = useState({
    make: "",
    model: "",
    variant: "",
    year: new Date().getFullYear(),
    quantity: "1",
    priceUsd: "",
    floorPriceUsd: "",
    stockNo: "",
    chassisNo: "",
    branchId: "",
    condition: "USED",
    // Car
    bodyType: "SUV",
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    mileageKm: "0",
    engineCc: "",
    drivetrain: "FWD",
    exteriorColor: "",
    // Motor
    motorType: "SCOOTER",
    hasAbs: false,
    startType: "ELECTRIC",
    // Part
    partCategory: "ENGINE_TRANSMISSION",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "",
    oemBrand: "",
    isOem: true,
    position: "FRONT",
    compatibleMake: "",
    compatibleModel: "",
    compatibleYearMin: "",
    compatibleYearMax: "",
    // Promotional pricing
    attachPromo: false,
    promoPriceTypeId: "",
    promoValue: "10",
    promoStartDate: "",
    promoEndDate: "",
  });

  // CSV import state
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState<"CREATE_LISTINGS" | "UPDATE_PRICING">("CREATE_LISTINGS");
  const [csvResult, setCsvResult] = useState<{
    importedCount?: number;
    updatedCount?: number;
    createdCount?: number;
    failedCount?: number;
    errors?: Array<{ row: number; identifier: string; error: string }>;
    message?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live duplicate detection in Quick Add
  const [detectedDuplicate, setDetectedDuplicate] = useState<any | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // 'Include from Inventory' modal state
  const [includeInventoryOpen, setIncludeInventoryOpen] = useState(false);
  const [includeSearch, setIncludeSearch] = useState("");
  const [includeCategory, setIncludeCategory] = useState("ALL");
  const [includeSelectedIds, setIncludeSelectedIds] = useState<string[]>([]);
  const [includePromoTypeId, setIncludePromoTypeId] = useState<string>("");
  const [includePromoValue, setIncludePromoValue] = useState<string>("10");

  // Debounced duplicate detection in Quick Add
  useEffect(() => {
    if (!quickAddOpen) {
      setDetectedDuplicate(null);
      return;
    }
    const stock = addForm.stockNo.trim();
    const chassis = addForm.chassisNo.trim();
    const part = addForm.partNumber.trim();

    if (!stock && !chassis && !part) {
      setDetectedDuplicate(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        const sp = new URLSearchParams();
        if (stock) sp.set("stockNo", stock);
        if (chassis) sp.set("chassisNo", chassis);
        if (part) sp.set("partNumber", part);
        sp.set("category", addCategory);

        const res = await fetch(`/api/seller/inventory/lookup?${sp.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (json.found && json.vehicle) {
          setDetectedDuplicate(json.vehicle);
        } else {
          setDetectedDuplicate(null);
        }
      } catch {
        setDetectedDuplicate(null);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [quickAddOpen, addForm.stockNo, addForm.chassisNo, addForm.partNumber, addCategory]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch branches
  const { data: branchData } = useFetch<{ branches: { id: string; name: string; city: string }[] }>("/api/tenant/branches");
  const branches = branchData?.branches ?? [];

  // Fetch available promo tiers (supports both priceTypes and types key)
  const { data: promoTypesData, refetch: refetchTypes } = useFetch<{
    types?: PriceTypeDTO[];
    priceTypes?: PriceTypeDTO[];
  }>("/api/seller/pricing/available-types");
  const priceTypes = promoTypesData?.priceTypes ?? promoTypesData?.types ?? [];

  // Ensure default tier selection when single vehicle modal opens
  useEffect(() => {
    if (singleVehicle && priceTypes.length > 0) {
      const currentMatched = priceTypes.find(
        (p) => p.id === singlePriceTypeId || p.code === singlePriceTypeId
      );
      if (!currentMatched) {
        const vehicleMatched = priceTypes.find(
          (p) => p.id === singleVehicle.activePriceType?.id || p.code === singleVehicle.activePriceType?.code
        );
        setSinglePriceTypeId(vehicleMatched?.id || priceTypes[0].id);
      } else if (singlePriceTypeId !== currentMatched.id) {
        setSinglePriceTypeId(currentMatched.id);
      }
    }
  }, [singleVehicle, singlePriceTypeId, priceTypes]);

  useEffect(() => {
    if (bulkModalOpen && priceTypes.length > 0) {
      const exists = priceTypes.some((p) => p.id === bulkPriceTypeId);
      if (!exists) {
        setBulkPriceTypeId(priceTypes[0].id);
      }
    }
  }, [bulkModalOpen, bulkPriceTypeId, priceTypes]);

  // Fetch pricing inventory with server-side pagination
  const queryParams = new URLSearchParams();
  if (category !== "ALL") queryParams.set("category", category);
  if (branchId !== "ALL") queryParams.set("branchId", branchId);
  if (search.trim()) queryParams.set("q", search.trim());
  if (onSaleOnly) queryParams.set("onSaleOnly", "true");
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(pageSize));

  const { data, loading, refetch } = useFetch<{
    vehicles: DealerPricingVehicle[];
    totalCount: number;
    onSaleCount: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
  }>(`/api/seller/pricing/inventory?${queryParams.toString()}`);

  const vehicles = data?.vehicles ?? [];
  const totalCount = data?.totalCount ?? 0;
  const onSaleCount = data?.onSaleCount ?? 0;
  const totalPages = data?.totalPages ?? Math.max(1, Math.ceil(totalCount / pageSize));

  // Selected promo type for bulk
  const selectedBulkType = useMemo(
    () => priceTypes.find((p) => p.id === bulkPriceTypeId || p.code === bulkPriceTypeId) ?? priceTypes[0],
    [priceTypes, bulkPriceTypeId]
  );
  const bulkSelectedTier = selectedBulkType;

  // Selected promo type for single vehicle edit
  const singleSelectedTier = useMemo(() => {
    return (
      priceTypes.find((p) => p.id === singlePriceTypeId || p.code === singlePriceTypeId) ||
      (singleVehicle?.activePriceType
        ? priceTypes.find(
            (p) => p.id === singleVehicle.activePriceType?.id || p.code === singleVehicle.activePriceType?.code
          )
        : undefined) ||
      priceTypes[0]
    );
  }, [priceTypes, singlePriceTypeId, singleVehicle]);

  // Selected promo type for quick add
  const quickAddSelectedTier = useMemo(() => {
    return (
      priceTypes.find((p) => p.id === addForm.promoPriceTypeId || p.code === addForm.promoPriceTypeId) ??
      priceTypes[0]
    );
  }, [priceTypes, addForm.promoPriceTypeId]);

  // Selected promo type for include from inventory
  const includeSelectedTier = useMemo(() => {
    return (
      priceTypes.find((p) => p.id === includePromoTypeId || p.code === includePromoTypeId) ??
      priceTypes[0]
    );
  }, [priceTypes, includePromoTypeId]);

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
    const selectedType = singleSelectedTier;

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
  }, [singleVehicle, singleValue, singleFloorPrice, singleSelectedTier]);

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
    const matched = priceTypes.find(
      (p) => p.id === v.activePriceType?.id || p.code === v.activePriceType?.code
    );
    const defaultTypeId = matched?.id || v.activePriceType?.id || priceTypes[0]?.id || "";
    setSinglePriceTypeId(defaultTypeId);
    setSingleValue(v.activeItemPrice?.value ? String(v.activeItemPrice.value) : "10");
    setSingleFloorPrice(v.floorPriceUsd ? String(v.floorPriceUsd) : "");
    setSingleStartDate(formatForDateTimeLocal(v.activeItemPrice?.startDate));
    setSingleEndDate(formatForDateTimeLocal(v.activeItemPrice?.endDate));
  };

  // Submit single vehicle promotion
  const handleSaveSinglePromo = async () => {
    if (!singleVehicle) return;
    const val = Number(singleValue);
    if (!val || val <= 0) {
      toast.warning(t("dealerPricingEnterDiscountToast"));
      return;
    }

    const priceTypeIdToSave = singlePriceTypeId || singleSelectedTier?.id || priceTypes[0]?.id;
    if (!priceTypeIdToSave) {
      toast.warning(t("dealerPricingSelectValidTierToast"));
      return;
    }

    setSubmitting(true);
    try {
      await apiSend("/api/seller/pricing/item", "POST", {
        vehicleId: singleVehicle.id,
        priceTypeId: priceTypeIdToSave,
        value: val,
        floorPriceUsd: singleFloorPrice ? Number(singleFloorPrice) : null,
        startDate: singleStartDate ? new Date(singleStartDate).toISOString() : null,
        endDate: singleEndDate ? new Date(singleEndDate).toISOString() : null,
      });
      toast.success(t("dealerPricingPromoAppliedToast"));
      setSingleVehicle(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingUpdatePricingFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Remove promotion from single vehicle
  const handleClearSinglePromo = async (vehicleId: string) => {
    setSubmitting(true);
    try {
      await apiSend(`/api/seller/pricing/item?vehicleId=${vehicleId}`, "DELETE");
      toast.success(t("dealerPricingPromoRemovedToast"));
      setSingleVehicle(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingRemovePromoFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Quick listing status patch
  const handlePatchStatus = async (vehicleId: string, newStatus: string) => {
    setStatusBusyId(vehicleId);
    try {
      await apiSend(`/api/vehicles/${vehicleId}`, "PATCH", { status: newStatus });
      toast.success(t("dealerPricingStatusUpdatedToast", { status: newStatus }));
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingStatusUpdateFailedToast"));
    } finally {
      setStatusBusyId(null);
    }
  };

  // Soft delete / archive listing
  const handleDeleteListing = async (vehicleId: string) => {
    setStatusBusyId(vehicleId);
    try {
      await apiSend(`/api/vehicles/${vehicleId}`, "DELETE");
      toast.success(t("dealerPricingListingArchivedToast"));
      setDeletingVehicle(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingDeleteFailedToast"));
    } finally {
      setStatusBusyId(null);
    }
  };

  // Tier management helpers
  const openCreateTier = () => {
    setEditingTier(null);
    setTierCode("");
    setTierLabel("");
    setTierMode("PERCENT");
    setTierBadgeColor("#EF4444");
    setTierPriority("50");
    setTierActive(true);
    setTierFormOpen(true);
  };

  const openEditTier = (pt: PriceTypeDTO) => {
    setEditingTier(pt);
    setTierCode(pt.code);
    setTierLabel(pt.label);
    setTierMode(pt.mode === "FIXED" ? "FIXED" : "PERCENT");
    setTierBadgeColor(pt.badgeColor || "#EF4444");
    setTierPriority(String(pt.priority ?? 50));
    setTierActive(pt.active !== false);
    setTierFormOpen(true);
  };

  const handleSaveTier = async () => {
    if (!tierLabel.trim()) {
      toast.warning(t("dealerPricingEnterTierLabelToast"));
      return;
    }
    const code = tierCode.trim() || tierLabel.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    setTierSubmitting(true);
    try {
      if (editingTier) {
        await apiSend(`/api/pricing/types/${editingTier.id}`, "PATCH", {
          label: tierLabel.trim(),
          mode: tierMode,
          badgeColor: tierBadgeColor,
          priority: Number(tierPriority) || 0,
          active: tierActive,
        });
        toast.success(t("dealerPricingTierUpdatedToast", { tier: tierLabel }));
      } else {
        await apiSend("/api/pricing/types", "POST", {
          code,
          label: tierLabel.trim(),
          mode: tierMode,
          badgeColor: tierBadgeColor,
          priority: Number(tierPriority) || 0,
          active: tierActive,
        });
        toast.success(t("dealerPricingTierCreatedToast", { tier: tierLabel }));
      }
      setTierFormOpen(false);
      setEditingTier(null);
      refetchTypes();
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingSaveTierFailedToast"));
    } finally {
      setTierSubmitting(false);
    }
  };

  const handleDeleteTier = async (tierId: string, label: string) => {
    setTierSubmitting(true);
    try {
      await apiSend(`/api/pricing/types/${tierId}`, "DELETE");
      toast.success(t("dealerPricingTierRemovedToast", { tier: label }));
      refetchTypes();
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingRemoveTierFailedToast"));
    } finally {
      setTierSubmitting(false);
    }
  };

  // Apply bulk promotion to selected vehicles
  const handleApplyBulk = async () => {
    if (selectedIds.length === 0) return;
    const val = Number(bulkValue);
    if (!val || val <= 0) {
      toast.warning(t("dealerPricingEnterDiscountToast"));
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
        t("dealerPricingBulkAppliedToast", {
          count: res.updatedCount,
          clamped: res.floorEnforcedCount > 0 ? t("dealerPricingFloorClampedSuffix", { count: res.floorEnforcedCount }) : "",
        })
      );
      setBulkModalOpen(false);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingBulkApplyFailedToast"));
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
      toast.success(t("dealerPricingClearedPromosToast", { count: res.vehicleCount }));
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingClearPromosFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Export current inventory pricing to CSV
  const handleExportCsv = () => {
    if (vehicles.length === 0) {
      toast.warning(t("dealerPricingNoListingsExportToast"));
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
    toast.success(t("dealerPricingCsvDownloadedToast"));
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

  // Download CSV Templates
  const downloadCsvTemplate = (type: "CARS" | "MOTORS" | "PARTS" | "PRICING") => {
    let content = "";
    let filename = "";

    if (type === "CARS") {
      filename = "khlan_cars_import_template.csv";
      content = "category,make,model,variant,year,base_price,floor_price,stock_no,promo_code,promo_value\n" +
        "CAR,Toyota,Camry,XSE,2022,35000,32000,STK-CAR-101,DISCOUNT_PRICE,10\n" +
        "CAR,Ford,Ranger Raptor,3.0L V6,2023,69000,62000,STK-CAR-102,HOT_PRICE,62100\n" +
        "CAR,Lexus,LX 570,Super Sport,2020,115000,102000,STK-CAR-103,CLEARANCE,105000\n";
    } else if (type === "MOTORS") {
      filename = "khlan_motors_import_template.csv";
      content = "category,make,model,variant,year,base_price,floor_price,stock_no,promo_code,promo_value\n" +
        "MOTOR,Honda,Scoopy,Club12,2024,2450,2200,STK-MOT-201,FLASH_SALE,5\n" +
        "MOTOR,Yamaha,NVX 155,ABS,2023,3800,3500,STK-MOT-202,DISCOUNT_PRICE,10\n" +
        "MOTOR,Ducati,Panigale V2,,2022,16500,15000,STK-MOT-203,HOT_PRICE,15200\n";
    } else if (type === "PARTS") {
      filename = "khlan_parts_import_template.csv";
      content = "category,make,model,variant,year,base_price,floor_price,stock_no,promo_code,promo_value\n" +
        "SPARE_PART,Brembo,Ceramic Brake Pads,Front Set,2024,180,150,PART-BRK-301,DISCOUNT_PRICE,15\n" +
        "SPARE_PART,Michelin,Pilot Sport 4,245/45R18,2024,220,190,PART-TIR-302,CLEARANCE,190\n" +
        "SPARE_PART,Denso,Iridium Spark Plugs,Pack of 4,2024,65,55,PART-ENG-303,FLASH_SALE,10\n";
    } else {
      filename = "khlan_pricing_update_template.csv";
      content = "vehicle_id,price_type,value,start_date,end_date\n" +
        "STK-SK-001,HOT_PRICE,105000,,\n" +
        "STK-SK-002,PROMOTE_PRICE,20,,\n";
    }

    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("dealerPricingTemplateDownloadedToast", { filename }));
  };

  // Submit CSV import
  const handleImportCsv = async () => {
    if (!csvText.trim()) {
      toast.warning(t("dealerPricingSelectPasteCsvToast"));
      return;
    }

    setSubmitting(true);
    setCsvResult(null);
    try {
      const res = await apiSend<{
        success: boolean;
        mode: string;
        importedCount: number;
        createdCount?: number;
        updatedCount?: number;
        failedCount: number;
        totalRows: number;
        message: string;
        errors?: Array<{ row: number; identifier: string; error: string }>;
      }>("/api/seller/pricing/csv", "POST", {
        csv: csvText,
        mode: csvMode,
      });

      setCsvResult(res);
      toast.success(res.message || t("dealerPricingProcessedRowsToast", { count: res.importedCount }));
      if (res.importedCount > 0) {
        refetch();
      }
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingImportCsvFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Quick Add Listing
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.make.trim()) {
      toast.warning(t("dealerPricingEnterMakeToast"));
      return;
    }
    if (!addForm.model.trim()) {
      toast.warning(t("dealerPricingEnterModelToast"));
      return;
    }
    const price = Number(addForm.priceUsd);
    if (!price || price <= 0) {
      toast.warning(t("dealerPricingEnterBasePriceToast"));
      return;
    }
    const floor = addForm.floorPriceUsd ? Number(addForm.floorPriceUsd) : undefined;
    if (floor != null && floor > price) {
      toast.error(t("dealerPricingFloorExceedsBaseToast", { floor: String(floor), base: String(price) }));
      return;
    }

    setSubmitting(true);
    try {
      const res: any = await apiSend("/api/seller/inventory/quick-add", "POST", {
        listingCategory: addCategory,
        make: addForm.make.trim(),
        model: addForm.model.trim(),
        variant: addForm.variant.trim() || undefined,
        year: Number(addForm.year) || new Date().getFullYear(),
        quantity: Math.max(1, parseInt(addForm.quantity, 10) || 1),
        priceUsd: price,
        floorPriceUsd: floor,
        stockNo: addForm.stockNo.trim() || undefined,
        chassisNo: addForm.chassisNo.trim() || undefined,
        branchId: addForm.branchId || undefined,
        condition: addForm.condition,
        // Car
        bodyType: addForm.bodyType,
        transmission: addForm.transmission,
        fuel: addForm.fuel,
        mileageKm: Number(addForm.mileageKm) || 0,
        engineCc: addForm.engineCc ? Number(addForm.engineCc) : undefined,
        drivetrain: addForm.drivetrain,
        exteriorColor: addForm.exteriorColor.trim() || undefined,
        // Motor
        motorType: addForm.motorType,
        hasAbs: addForm.hasAbs,
        startType: addForm.startType,
        // Part
        partCategory: addForm.partCategory,
        partTarget: addForm.partTarget,
        partCondition: addForm.partCondition,
        partNumber: addForm.partNumber.trim() || undefined,
        oemBrand: addForm.oemBrand.trim() || undefined,
        isOem: addForm.isOem,
        position: addForm.position,
        compatibleMake: addForm.compatibleMake.trim() || undefined,
        compatibleModel: addForm.compatibleModel.trim() || undefined,
        compatibleYearMin: addForm.compatibleYearMin ? Number(addForm.compatibleYearMin) : undefined,
        compatibleYearMax: addForm.compatibleYearMax ? Number(addForm.compatibleYearMax) : undefined,
        // Promo
        promoPriceTypeId: addForm.attachPromo ? (addForm.promoPriceTypeId || priceTypes[0]?.id) : undefined,
        promoValue: addForm.attachPromo ? Number(addForm.promoValue) : undefined,
        promoStartDate: addForm.attachPromo && addForm.promoStartDate ? new Date(addForm.promoStartDate).toISOString() : undefined,
        promoEndDate: addForm.attachPromo && addForm.promoEndDate ? new Date(addForm.promoEndDate).toISOString() : undefined,
      });

      if (res?.action === "INCREMENTED") {
        toast.success(t("dealerPricingStockIncrementedToast", { stock: res.newStock, added: res.incrementedBy }));
      } else {
        toast.success(t("dealerPricingListingAddedToast", { category: addCategory, title: `${addForm.make} ${addForm.model}`, units: res?.newStock || 1 }));
      }
      setQuickAddOpen(false);
      setDetectedDuplicate(null);
      // Reset form
      setAddForm({
        make: "",
        model: "",
        variant: "",
        year: new Date().getFullYear(),
        quantity: "1",
        priceUsd: "",
        floorPriceUsd: "",
        stockNo: "",
        chassisNo: "",
        branchId: "",
        condition: "USED",
        bodyType: "SUV",
        transmission: "AUTOMATIC",
        fuel: "PETROL",
        mileageKm: "0",
        engineCc: "",
        drivetrain: "FWD",
        exteriorColor: "",
        motorType: "SCOOTER",
        hasAbs: false,
        startType: "ELECTRIC",
        partCategory: "ENGINE_TRANSMISSION",
        partTarget: "CAR",
        partCondition: "BRAND_NEW",
        partNumber: "",
        oemBrand: "",
        isOem: true,
        position: "FRONT",
        compatibleMake: "",
        compatibleModel: "",
        compatibleYearMin: "",
        compatibleYearMax: "",
        attachPromo: false,
        promoPriceTypeId: "",
        promoValue: "10",
        promoStartDate: "",
        promoEndDate: "",
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingAddListingFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle 'Include from Inventory' bulk promo apply
  const handleIncludeInventorySubmit = async () => {
    if (includeSelectedIds.length === 0) {
      toast.warning(t("dealerPricingSelectAtLeastOneToast"));
      return;
    }
    const val = Number(includePromoValue);
    if (!val || val <= 0) {
      toast.warning(t("dealerPricingEnterDiscountToast"));
      return;
    }

    setSubmitting(true);
    try {
      await apiSend("/api/seller/pricing/bulk", "POST", {
        vehicleIds: includeSelectedIds,
        priceTypeId: includePromoTypeId || priceTypes[0]?.id,
        value: val,
      });
      toast.success(t("dealerPricingInventoryPromoAppliedToast", { count: includeSelectedIds.length }));
      setIncludeInventoryOpen(false);
      setIncludeSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast.error(err.message || t("dealerPricingUpdatePricingFailedToast"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">{t("dealerPricingTotalListings")}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{totalCount}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{t("dealerPricingDealershipInventory")}</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-900">{t("dealerPricingActiveCampaigns")}</p>
            <Flame className="h-4 w-4 text-amber-600 animate-pulse" />
          </div>
          <p className="mt-1 text-2xl font-black text-amber-950">{onSaleCount}</p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            {totalCount > 0 ? t("dealerPricingStockOnSale", { percent: Math.round((onSaleCount / totalCount) * 100) }) : t("dealerPricingNoVehicles")}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-900">{t("dealerPricingFloorProtection")}</p>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-2xl font-black text-emerald-950">
            {vehicles.filter((v) => v.floorPriceUsd != null && v.floorPriceUsd > 0).length}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-800">{t("dealerPricingProtectedUndercut")}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-semibold text-slate-500">{t("dealerPricingAvailableTiers")}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{priceTypes.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{t("dealerPricingTiersSummary")}</p>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {[
              { id: "ALL", label: t("pricingCatAll"), icon: null },
              { id: "CAR", label: t("pricingCatCars"), icon: CarFront },
              { id: "MOTOR", label: t("pricingCatMotors"), icon: Bike },
              { id: "SPARE_PART", label: t("pricingCatParts"), icon: Wrench },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategory(c.id);
                    setPage(1);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                    category === c.id ? "bg-white text-slate-950 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => setQuickAddOpen(true)}
              className="bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs h-9 cursor-pointer gap-1.5 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("dealerPricingAddListing")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIncludeInventoryOpen(true)}
              className="text-xs h-9 cursor-pointer border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-950 font-semibold gap-1.5"
            >
              <Boxes className="h-3.5 w-3.5 text-amber-600" />
              {t("dealerPricingIncludeInventory")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTierModalOpen(true)}
              className="text-xs h-9 cursor-pointer border-slate-200 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-950 font-semibold"
            >
              <Tag className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
              {t("dealerPricingManageTiers")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="text-xs h-9 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              {t("dealerPricingExportCsv")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCsvResult(null);
                setCsvModalOpen(true);
              }}
              className="text-xs h-9 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
              {t("dealerPricingImportCsv")}
            </Button>

            <Button
              size="sm"
              onClick={() => {
                if (selectedIds.length === 0) {
                  toast.info(t("dealerPricingSelectOneOrMoreToast"));
                  return;
                }
                setBulkModalOpen(true);
              }}
              disabled={selectedIds.length === 0}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold text-xs h-9 cursor-pointer"
            >
              <Flame className="h-3.5 w-3.5 mr-1.5" />
              {t("dealerPricingApplyPromo")} ({selectedIds.length})
            </Button>

            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearBulkPromos}
                className="text-xs h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t("dealerPricingClearPromo")} ({selectedIds.length})
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t("dealerPricingSearchPlaceholder")}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {branches.length > 0 && (
            <div className="sm:col-span-3">
              <Select
                value={branchId}
                onValueChange={(val) => {
                  setBranchId(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("dealerPricingAllBranches")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("dealerPricingAllShowrooms")}</SelectItem>
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
              {t("dealerPricingOnSaleOnly")}
            </Label>
            <Switch
              id="dealer-on-sale"
              checked={onSaleOnly}
              onCheckedChange={(val) => {
                setOnSaleOnly(val);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Inventory Pricing Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {loading && vehicles.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-amber-500 mb-2" />
            <p className="text-xs">{t("dealerPricingLoading")}</p>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CarFront className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">{t("dealerPricingNoListingsFound")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("dealerPricingAdjustFilters")}</p>
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
                  <th className="py-3 px-4">{t("dealerPricingColVehicle")}</th>
                  <th className="py-3 px-4">{t("dealerPricingColShowroom")}</th>
                  <th className="py-3 px-4">{t("dealerPricingColBasePrice")}</th>
                  <th className="py-3 px-4">{t("dealerPricingColFloorPrice")}</th>
                  <th className="py-3 px-4">{t("dealerPricingColEffectivePrice")}</th>
                  <th className="py-3 px-4">{t("dealerPricingColActivePromo")}</th>
                  <th className="py-3 px-4 text-right">{t("dealerPricingColActions")}</th>
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
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {v.stockNo ? (
                                <span className="text-[11px] text-slate-400">Stock: {v.stockNo}</span>
                              ) : null}
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                <Boxes className="h-2.5 w-2.5 text-slate-500" />
                                {t("dealerPricingInStock", { count: v.stockQuantity || 1 })}
                              </span>
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono uppercase">
                                {v.listingCategory}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-600">
                          {v.branch ? v.branch.name : t("dealerPricingMainShowroom")}
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
                              <ShieldAlert className="h-2.5 w-2.5" /> {t("dealerPricingClampedToFloor")}
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
                            {getPromoTierLabel(v.activePriceType, locale)}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t("pricingRegularBadge")}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSinglePromo(v)}
                            className="h-7 text-xs px-2.5 font-medium cursor-pointer bg-white hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300"
                          >
                            <Pencil className="h-3 w-3 mr-1 text-amber-600" />
                            {t("dealerPricingPricingBtn")}
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 cursor-pointer"
                                disabled={statusBusyId === v.id}
                                aria-label={`Actions for ${v.make} ${v.model}`}
                              >
                                {statusBusyId === v.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 text-xs">
                              <DropdownMenuLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                {t("dealerPricingListingActions")}
                              </DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openSinglePromo(v)} className="cursor-pointer gap-2">
                                <Tag className="h-3.5 w-3.5 text-amber-600" />
                                <span>{t("dealerPricingConfigurePricing")}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditorVehicleId(v.id)} className="cursor-pointer gap-2">
                                <Pencil className="h-3.5 w-3.5 text-blue-600" />
                                <span>{t("dealerPricingEditListing")}</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => window.open(`/vehicles/${v.id}`, "_blank")}
                                className="cursor-pointer gap-2"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                                <span>{t("dealerPricingViewMarketplace")}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                {t("dealerPricingQuickStatus")}
                              </DropdownMenuLabel>
                              {v.status !== "PUBLISHED" && (
                                <DropdownMenuItem onClick={() => handlePatchStatus(v.id, "PUBLISHED")} className="cursor-pointer gap-2">
                                  <Eye className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>{t("dealerPricingPublishListing")}</span>
                                </DropdownMenuItem>
                              )}
                              {v.status === "PUBLISHED" && (
                                <DropdownMenuItem onClick={() => handlePatchStatus(v.id, "DRAFT")} className="cursor-pointer gap-2">
                                  <EyeOff className="h-3.5 w-3.5 text-amber-600" />
                                  <span>{t("dealerPricingUnpublishDraft")}</span>
                                </DropdownMenuItem>
                              )}
                              {v.status !== "SOLD" && (
                                <DropdownMenuItem onClick={() => handlePatchStatus(v.id, "SOLD")} className="cursor-pointer gap-2">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                                  <span>{t("dealerPricingMarkSold")}</span>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {v.isOnSale && (
                                <DropdownMenuItem onClick={() => handleClearSinglePromo(v.id)} className="cursor-pointer gap-2 text-amber-700">
                                  <Flame className="h-3.5 w-3.5 text-amber-600" />
                                  <span>{t("dealerPricingClearPromoBtn")}</span>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setDeletingVehicle(v)}
                                className="cursor-pointer gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                <span>{t("dealerPricingDeleteListing")}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70 text-xs text-slate-600">
            {/* Left: Showing range + Page Size Selector */}
            <div className="flex items-center gap-3">
              <span>
                {t("dealerPricingShowingRange", {
                  start: Math.min(totalCount, (page - 1) * pageSize + 1),
                  end: Math.min(totalCount, page * pageSize),
                  total: totalCount,
                })}
              </span>
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200">
                <span className="text-slate-400">{t("dealerPricingRowsPerPage")}</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-7 w-16 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Page navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-7 px-2 text-xs gap-1 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{t("dealerPricingPrev")}</span>
              </Button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => {
                    const prevPage = arr[idx - 1];
                    const showEllipsis = prevPage && p - prevPage > 1;
                    return (
                      <span key={p} className="flex items-center">
                        {showEllipsis && <span className="px-1 text-slate-400 font-mono">…</span>}
                        <button
                          type="button"
                          onClick={() => setPage(p)}
                          className={cn(
                            "h-7 min-w-[28px] px-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer",
                            page === p
                              ? "bg-slate-900 text-white shadow-2xs"
                              : "text-slate-700 hover:bg-slate-200 bg-white border border-slate-200"
                          )}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="h-7 px-2 text-xs gap-1 cursor-pointer"
              >
                <span>{t("dealerPricingNext")}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Promo Modal */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-amber-600" />
              {t("dealerPricingBulkTitle", { count: selectedIds.length })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-600">{t("promoTierLabel")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={openCreateTier}
                  className="h-6 px-1.5 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 gap-1 font-semibold cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  {t("dealerPricingNewTierBtn")}
                </Button>
              </div>
              <div className="mt-1.5">
                <Select
                  value={bulkSelectedTier?.id || bulkPriceTypeId}
                  onValueChange={setBulkPriceTypeId}
                >
                  <SelectTrigger className="h-10 text-xs w-full">
                    <SelectValue placeholder={t("dealerPricingSelectTierPlaceholder")}>
                      {bulkSelectedTier ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: bulkSelectedTier.badgeColor || "#ef4444" }}
                          />
                          <span className="font-semibold text-slate-900">{getPromoTierLabel(bulkSelectedTier, locale)}</span>
                          <span className="text-slate-400 text-[11px]">
                            ({bulkSelectedTier.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                          </span>
                        </span>
                      ) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {priceTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: pt.badgeColor || "#ef4444" }}
                          />
                          <span className="font-semibold text-slate-900">{getPromoTierLabel(pt, locale)}</span>
                          <span className="text-slate-400 text-[11px]">
                            ({pt.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">
                {selectedBulkType?.mode === "PERCENT" ? t("dealerPricingDiscountPercentLabel") : t("dealerPricingReductionAmountLabel")}
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
                <Label className="text-xs font-semibold text-slate-600">{t("pricingStartDate")}</Label>
                <Input
                  type="datetime-local"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="mt-1.5 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">{t("pricingEndDate")}</Label>
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
              <p className="font-bold text-slate-900">{t("dealerPricingPreflightTitle")}</p>
              <p className="text-slate-600">
                {t("dealerPricingTargetListings")} <span className="font-bold text-slate-900">{bulkPreviewStats.totalSelected}</span>
              </p>
              <p className="text-slate-600">
                {t("dealerPricingAverageDiscount")} <span className="font-bold text-slate-900">{formatUsd(bulkPreviewStats.avgDiscount)}</span>
              </p>
              {bulkPreviewStats.clampedCount > 0 && (
                <div className="flex items-start gap-1.5 pt-1 text-amber-800 font-medium">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    {t("dealerPricingFloorActiveNotice", { count: bulkPreviewStats.clampedCount })}
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkModalOpen(false)}>
              {t("pricingCancelBtn")}
            </Button>
            <Button
              onClick={handleApplyBulk}
              disabled={submitting}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Flame className="h-4 w-4 mr-1" />}
              {t("dealerPricingApplyToCount", { count: selectedIds.length })}
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
                {t("dealerPricingSingleTitle")}
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
                    {t("pricingBasePriceLabel")} <span className="font-semibold text-slate-800">{formatUsd(singleVehicle.basePriceUsd)}</span>
                    {singleVehicle.stockNo ? ` · Stock: ${singleVehicle.stockNo}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-600">{t("dealerPricingSingleBasePrice")}</Label>
                  <Input
                    disabled
                    value={singleVehicle.basePriceUsd}
                    className="mt-1.5 bg-slate-100 font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-600">{t("dealerPricingFloorProtectionLabel")}</Label>
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-600">{t("promoTierLabel")}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openCreateTier}
                    className="h-6 px-1.5 text-[11px] text-amber-700 hover:text-amber-800 hover:bg-amber-50 gap-1 font-semibold cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    {t("dealerPricingNewTierBtn")}
                  </Button>
                </div>
                <div className="mt-1.5">
                  <Select
                    value={singleSelectedTier?.id || singlePriceTypeId}
                    onValueChange={setSinglePriceTypeId}
                  >
                    <SelectTrigger className="h-10 text-xs w-full">
                      <SelectValue placeholder={t("dealerPricingSelectTierPlaceholder")}>
                        {singleSelectedTier ? (
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: singleSelectedTier.badgeColor || "#ef4444" }}
                            />
                            <span className="font-semibold text-slate-900">{getPromoTierLabel(singleSelectedTier, locale)}</span>
                            <span className="text-slate-400 text-[11px]">
                              ({singleSelectedTier.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                            </span>
                          </span>
                        ) : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priceTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: pt.badgeColor || "#ef4444" }}
                            />
                            <span className="font-semibold text-slate-900">{getPromoTierLabel(pt, locale)}</span>
                            <span className="text-slate-400 text-[11px]">
                              ({pt.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-600">
                  {singlePreview?.selectedType?.mode === "PERCENT" ? t("dealerPricingDiscountPercentLabel") : t("dealerPricingTargetPriceLabel")}
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={singlePreview?.selectedType?.mode === "PERCENT" ? 99 : undefined}
                    value={singleValue}
                    onChange={(e) => setSingleValue(e.target.value)}
                    placeholder={singlePreview?.selectedType?.mode === "PERCENT" ? "20" : "105000"}
                    className={singlePreview?.selectedType?.mode === "PERCENT" ? "pr-8" : "pl-7"}
                  />
                  {singlePreview?.selectedType?.mode === "PERCENT" ? (
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                  ) : (
                    <span className="absolute left-2.5 top-2.5 text-xs font-bold text-slate-400">$</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  {singlePreview?.selectedType?.mode === "PERCENT"
                    ? t("dealerPricingEnterPercentHint", { base: formatUsd(singleVehicle.basePriceUsd) })
                    : t("dealerPricingEnterFixedHint", { base: formatUsd(singleVehicle.basePriceUsd) })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-600">{t("pricingStartDateOpt")}</Label>
                  <Input
                    type="datetime-local"
                    value={singleStartDate}
                    onChange={(e) => setSingleStartDate(e.target.value)}
                    className="mt-1.5 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-600">{t("pricingEndDateOpt")}</Label>
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
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      {t("dealerPricingResolutionPreview")}
                    </span>
                    {singlePreview.discountUsd > 0 && (
                      <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {t("dealerPricingSaveAmount", { amount: formatUsd(singlePreview.discountUsd), percent: singlePreview.discountPercent })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    {singlePreview.discountUsd > 0 && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatUsd(singlePreview.base)}
                      </span>
                    )}
                    <span className="text-2xl font-black text-slate-900">
                      {formatUsd(singlePreview.effective)}
                    </span>
                    {singlePreview.selectedType && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase text-white shadow-xs"
                        style={{ backgroundColor: singlePreview.selectedType.badgeColor || "#ef4444" }}
                      >
                        {getPromoTierLabel(singlePreview.selectedType, locale)}
                      </span>
                    )}
                  </div>

                  {singlePreview.floorClamped && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        {t("dealerPricingFloorEnforcedDetail", {
                          candidate: formatUsd(singlePreview.candidate),
                          floor: formatUsd(singlePreview.floor || 0),
                        })}
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
                  {t("dealerPricingClearPromoBtn")}
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setSingleVehicle(null)}>
                  {t("pricingCancelBtn")}
                </Button>
                <Button
                  onClick={handleSaveSinglePromo}
                  disabled={submitting}
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {t("dealerPricingSavePricingBtn")}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* CSV Import Modal (Dual-Mode: New Listings & Pricing Updates) */}
      <Dialog open={csvModalOpen} onOpenChange={setCsvModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              {t("dealerPricingCsvTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Import Mode Selector */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setCsvMode("CREATE_LISTINGS")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer text-center",
                  csvMode === "CREATE_LISTINGS"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {t("dealerPricingCsvImportListings")}
              </button>
              <button
                type="button"
                onClick={() => setCsvMode("UPDATE_PRICING")}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer text-center",
                  csvMode === "UPDATE_PRICING"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {t("dealerPricingCsvUpdatePricing")}
              </button>
            </div>

            {/* Template Download Pills */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                {t("dealerPricingSampleTemplates")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsvTemplate("CARS")}
                  className="h-7 text-xs bg-white border-slate-200 hover:bg-slate-100 gap-1"
                >
                  <CarFront className="h-3 w-3 text-sky-600" />
                  {t("dealerPricingCarsCsv")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsvTemplate("MOTORS")}
                  className="h-7 text-xs bg-white border-slate-200 hover:bg-slate-100 gap-1"
                >
                  <Bike className="h-3 w-3 text-amber-600" />
                  {t("dealerPricingMotorsCsv")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsvTemplate("PARTS")}
                  className="h-7 text-xs bg-white border-slate-200 hover:bg-slate-100 gap-1"
                >
                  <Wrench className="h-3 w-3 text-indigo-600" />
                  {t("dealerPricingPartsCsv")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCsvTemplate("PRICING")}
                  className="h-7 text-xs bg-white border-slate-200 hover:bg-slate-100 gap-1"
                >
                  <Tag className="h-3 w-3 text-emerald-600" />
                  {t("dealerPricingPricingUpdatesCsv")}
                </Button>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {csvMode === "CREATE_LISTINGS" ? (
                <>
                  Supported columns: <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">category</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">make</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">model</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">year</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">base_price</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">floor_price</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">promo_code</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">promo_value</code>.
                </>
              ) : (
                <>
                  Supported columns: <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">vehicle_id</code> (or <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">stock_no</code>), <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">price_type</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">value</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">start_date</code>, <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-800 font-semibold">end_date</code>.
                </>
              )}
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
                {t("dealerPricingChooseCsvFile")}
              </Button>
              <p className="text-[11px] text-slate-400 mt-2">{t("dealerPricingOrPasteCsv")}</p>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-600">{t("dealerPricingCsvRawContent")}</Label>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={
                  csvMode === "CREATE_LISTINGS"
                    ? "category,make,model,year,base_price,floor_price,stock_no,promo_code,promo_value\nCAR,Toyota,Camry,2022,35000,32000,STK-CAR-101,DISCOUNT_PRICE,10\nMOTOR,Honda,Scoopy,2024,2450,2200,STK-MOT-201,FLASH_SALE,5\nSPARE_PART,Brembo,Brake Pads,2024,180,150,PART-BRK-301,CLEARANCE,150"
                    : "vehicle_id,price_type,value,start_date,end_date\nSTK-SK-001,HOT_PRICE,105000,,\nSTK-SK-002,PROMOTE_PRICE,20,,"
                }
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* CSV Result Feedback */}
            {csvResult && (
              <div className={cn(
                "rounded-xl p-3 text-xs border space-y-1",
                (csvResult.importedCount ?? 0) > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
              )}>
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {csvResult.message}
                </p>
                {csvResult.errors && csvResult.errors.length > 0 && (
                  <div className="pt-1.5 space-y-1 text-slate-600">
                    <p className="font-semibold text-slate-700">{t("dealerPricingSkippedRows")}</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {csvResult.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>Row {err.row} ({err.identifier}): {err.error}</li>
                      ))}
                      {csvResult.errors.length > 5 && (
                        <li>{t("dealerPricingAndMore", { count: csvResult.errors.length - 5 })}</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCsvModalOpen(false)}>
              {t("pricingCancelBtn")}
            </Button>
            <Button
              onClick={handleImportCsv}
              disabled={submitting || !csvText.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-500 font-bold text-xs"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              {csvMode === "CREATE_LISTINGS" ? t("dealerPricingImportListingsBtn") : t("dealerPricingApplyPricingBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Listing Dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-slate-900" />
              {t("dealerPricingQuickAddTitle")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleQuickAddSubmit} className="space-y-4 py-1">
            {/* Category Tab Selector */}
            <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
              {[
                { id: "CAR", label: t("dealerPricingCarListing"), icon: CarFront },
                { id: "MOTOR", label: t("dealerPricingMotorListing"), icon: Bike },
                { id: "SPARE_PART", label: t("dealerPricingPartListing"), icon: Wrench },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setAddCategory(c.id as any)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                      addCategory === c.id
                        ? "bg-white text-slate-950 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Live Duplicate Detection Alert */}
            {detectedDuplicate && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-3 flex items-start gap-2.5 text-xs text-amber-950 animate-in fade-in duration-200 shadow-xs">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-amber-900 flex items-center gap-1.5 flex-wrap">
                    <span>{t("dealerPricingExistingInventoryFound")}</span>
                    <span className="font-mono text-[11px] bg-amber-200/90 text-amber-950 px-1.5 py-0.2 rounded font-black">
                      {detectedDuplicate.make} {detectedDuplicate.model} {detectedDuplicate.variant || ""} ({detectedDuplicate.year})
                    </span>
                    {detectedDuplicate.stockNo && (
                      <span className="text-[10px] text-amber-800">Stock: {detectedDuplicate.stockNo}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {t("dealerPricingExistingStockNotice", {
                      current: detectedDuplicate.stockQuantity,
                      total: detectedDuplicate.stockQuantity + (Math.max(1, Number(addForm.quantity) || 1)),
                      added: Math.max(1, Number(addForm.quantity) || 1),
                    })}
                  </p>
                </div>
              </div>
            )}

            {/* General Fields */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">
                  {addCategory === "SPARE_PART" ? t("dealerPricingBrandManufacturer") : t("dealerPricingMake")}
                </Label>
                <Input
                  required
                  placeholder={addCategory === "SPARE_PART" ? "e.g. Brembo, Denso, Michelin" : "e.g. Toyota, Honda, Ford"}
                  value={addForm.make}
                  onChange={(e) => setAddForm({ ...addForm, make: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">
                  {addCategory === "SPARE_PART" ? t("dealerPricingPartName") : t("dealerPricingModel")}
                </Label>
                <Input
                  required
                  placeholder={addCategory === "SPARE_PART" ? "e.g. Front Ceramic Brake Pads" : "e.g. Camry, Scoopy, Ranger"}
                  value={addForm.model}
                  onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingYear")}</Label>
                <Input
                  type="number"
                  min={1980}
                  max={2030}
                  value={addForm.year}
                  onChange={(e) => setAddForm({ ...addForm, year: Number(e.target.value) })}
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingVariantGrade")}</Label>
                <Input
                  placeholder="e.g. XSE, Club12, GT"
                  value={addForm.variant}
                  onChange={(e) => setAddForm({ ...addForm, variant: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingCondition")}</Label>
                <Select
                  value={addForm.condition}
                  onValueChange={(val) => setAddForm({ ...addForm, condition: val })}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USED">{t("dealerPricingCondUsed")}</SelectItem>
                    <SelectItem value="LIKE_NEW">{t("dealerPricingCondLikeNew")}</SelectItem>
                    <SelectItem value="BRAND_NEW">{t("dealerPricingCondBrandNew")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingStockNoOpt")}</Label>
                <Input
                  placeholder={t("dealerPricingStockAutoGenerated")}
                  value={addForm.stockNo}
                  onChange={(e) => setAddForm({ ...addForm, stockNo: e.target.value })}
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Category-Specific Fields */}
            {addCategory === "CAR" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingBodyType")}</Label>
                  <Select
                    value={addForm.bodyType}
                    onValueChange={(val) => setAddForm({ ...addForm, bodyType: val })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SUV">{bodyTypeLabels.SUV?.[locale] ?? "SUV"}</SelectItem>
                      <SelectItem value="SEDAN">{bodyTypeLabels.SEDAN?.[locale] ?? "Sedan"}</SelectItem>
                      <SelectItem value="PICKUP">{bodyTypeLabels.PICKUP?.[locale] ?? "Pickup"}</SelectItem>
                      <SelectItem value="VAN">{bodyTypeLabels.VAN?.[locale] ?? "Van / MPV"}</SelectItem>
                      <SelectItem value="HATCHBACK">{bodyTypeLabels.HATCHBACK?.[locale] ?? "Hatchback"}</SelectItem>
                      <SelectItem value="COUPE">{bodyTypeLabels.COUPE?.[locale] ?? "Coupe"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingTransmission")}</Label>
                  <Select
                    value={addForm.transmission}
                    onValueChange={(val) => setAddForm({ ...addForm, transmission: val })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTOMATIC">{transmissionLabels.AUTOMATIC?.[locale] ?? "Automatic"}</SelectItem>
                      <SelectItem value="MANUAL">{transmissionLabels.MANUAL?.[locale] ?? "Manual"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingFuelType")}</Label>
                  <Select
                    value={addForm.fuel}
                    onValueChange={(val) => setAddForm({ ...addForm, fuel: val })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PETROL">{fuelLabels.PETROL?.[locale] ?? "Petrol"}</SelectItem>
                      <SelectItem value="DIESEL">{fuelLabels.DIESEL?.[locale] ?? "Diesel"}</SelectItem>
                      <SelectItem value="HYBRID">{fuelLabels.HYBRID?.[locale] ?? "Hybrid"}</SelectItem>
                      <SelectItem value="ELECTRIC">{fuelLabels.ELECTRIC?.[locale] ?? "Electric (EV)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingMileage")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={addForm.mileageKm}
                    onChange={(e) => setAddForm({ ...addForm, mileageKm: e.target.value })}
                    className="mt-1 h-9 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            )}

            {addCategory === "MOTOR" && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingMotorType")}</Label>
                  <Select
                    value={addForm.motorType}
                    onValueChange={(val) => setAddForm({ ...addForm, motorType: val })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCOOTER">{motorBodyTypeLabels.SCOOTER?.[locale] ?? "Scooter"}</SelectItem>
                      <SelectItem value="CUB">{motorBodyTypeLabels.CUB?.[locale] ?? "Cub / Underbone"}</SelectItem>
                      <SelectItem value="SPORT">{motorBodyTypeLabels.SPORT?.[locale] ?? "Sport Bike"}</SelectItem>
                      <SelectItem value="NAKED">{motorBodyTypeLabels.NAKED?.[locale] ?? "Naked"}</SelectItem>
                      <SelectItem value="CRUISER">{motorBodyTypeLabels.CRUISER?.[locale] ?? "Cruiser"}</SelectItem>
                      <SelectItem value="DIRT">{motorBodyTypeLabels.DIRT?.[locale] ?? "Dirt / Enduro"}</SelectItem>
                      <SelectItem value="ELECTRIC">{motorBodyTypeLabels.ELECTRIC?.[locale] ?? "Electric Motor"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingEngineDisplacement")}</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 125, 155, 300"
                    value={addForm.engineCc}
                    onChange={(e) => setAddForm({ ...addForm, engineCc: e.target.value })}
                    className="mt-1 h-9 text-xs bg-white font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingStartType")}</Label>
                  <Select
                    value={addForm.startType}
                    onValueChange={(val) => setAddForm({ ...addForm, startType: val })}
                  >
                    <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ELECTRIC">{t("filterMotorStartElectric")}</SelectItem>
                      <SelectItem value="KICK">{t("filterMotorStartKick")}</SelectItem>
                      <SelectItem value="BOTH">{t("filterMotorStartBoth")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 mt-5">
                  <Label htmlFor="add-abs" className="text-xs font-semibold text-slate-700 cursor-pointer">
                    {t("dealerPricingAbsBraking")}
                  </Label>
                  <Switch
                    id="add-abs"
                    checked={addForm.hasAbs}
                    onCheckedChange={(val) => setAddForm({ ...addForm, hasAbs: val })}
                  />
                </div>
              </div>
            )}

            {addCategory === "SPARE_PART" && (
              <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingPartCategory")}</Label>
                    <Select
                      value={addForm.partCategory}
                      onValueChange={(val) => setAddForm({ ...addForm, partCategory: val })}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ENGINE_TRANSMISSION">{partCategoryLabels.ENGINE_TRANSMISSION?.[locale] ?? "Engine & Transmission"}</SelectItem>
                        <SelectItem value="BRAKES_SUSPENSION">{partCategoryLabels.BRAKES_SUSPENSION?.[locale] ?? "Brakes & Suspension"}</SelectItem>
                        <SelectItem value="TIRES_WHEELS">{partCategoryLabels.TIRES_WHEELS?.[locale] ?? "Tires & Wheels"}</SelectItem>
                        <SelectItem value="BATTERY_ELECTRICAL">{partCategoryLabels.BATTERY_ELECTRICAL?.[locale] ?? "Electrical & Battery"}</SelectItem>
                        <SelectItem value="LIGHTS_BULBS">{partCategoryLabels.LIGHTS_BULBS?.[locale] ?? "Lights & Bulbs"}</SelectItem>
                        <SelectItem value="BODY_MIRRORS">{partCategoryLabels.BODY_MIRRORS?.[locale] ?? "Body & Mirrors"}</SelectItem>
                        <SelectItem value="ACCESSORIES">{partCategoryLabels.ACCESSORIES?.[locale] ?? "Accessories"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingPartNumber")}</Label>
                    <Input
                      placeholder="e.g. 04465-33450"
                      value={addForm.partNumber}
                      onChange={(e) => setAddForm({ ...addForm, partNumber: e.target.value })}
                      className="mt-1 h-9 text-xs bg-white font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingPosition")}</Label>
                    <Select
                      value={addForm.position}
                      onValueChange={(val) => setAddForm({ ...addForm, position: val })}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FRONT">{t("filterPosFront")}</SelectItem>
                        <SelectItem value="REAR">{t("filterPosRear")}</SelectItem>
                        <SelectItem value="LEFT">{t("filterPosLeft")}</SelectItem>
                        <SelectItem value="RIGHT">{t("filterPosRight")}</SelectItem>
                        <SelectItem value="UNIVERSAL">{t("filterPosUniversal")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 mt-5">
                    <Label htmlFor="add-oem" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      {t("dealerPricingOemGenuine")}
                    </Label>
                    <Switch
                      id="add-oem"
                      checked={addForm.isOem}
                      onCheckedChange={(val) => setAddForm({ ...addForm, isOem: val })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingCompatibleMake")}</Label>
                    <Input
                      placeholder="e.g. Toyota, Honda"
                      value={addForm.compatibleMake}
                      onChange={(e) => setAddForm({ ...addForm, compatibleMake: e.target.value })}
                      className="mt-1 h-9 text-xs bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingCompatibleModel")}</Label>
                    <Input
                      placeholder="e.g. Prius, Camry"
                      value={addForm.compatibleModel}
                      onChange={(e) => setAddForm({ ...addForm, compatibleModel: e.target.value })}
                      className="mt-1 h-9 text-xs bg-white"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingMinYear")}</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 2010"
                      value={addForm.compatibleYearMin}
                      onChange={(e) => setAddForm({ ...addForm, compatibleYearMin: e.target.value })}
                      className="mt-1 h-9 text-xs bg-white font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingMaxYear")}</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 2024"
                      value={addForm.compatibleYearMax}
                      onChange={(e) => setAddForm({ ...addForm, compatibleYearMax: e.target.value })}
                      className="mt-1 h-9 text-xs bg-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Pricing & Safeguards Section */}
            <div className="rounded-xl border border-slate-200 bg-amber-50/30 p-3.5 space-y-3">
              <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-amber-600" />
                {t("dealerPricingPricingSafeguards")}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingBasePriceRequired")}</Label>
                  <Input
                    required
                    type="number"
                    min={1}
                    placeholder="e.g. 35000"
                    value={addForm.priceUsd}
                    onChange={(e) => setAddForm({ ...addForm, priceUsd: e.target.value })}
                    className="mt-1 h-9 text-xs bg-white font-bold font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingFloorProtectionLabel")}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 32000"
                    value={addForm.floorPriceUsd}
                    onChange={(e) => setAddForm({ ...addForm, floorPriceUsd: e.target.value })}
                    className="mt-1 h-9 text-xs bg-white font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingStockQuantityRequired")}</Label>
                  <Input
                    required
                    type="number"
                    min={1}
                    placeholder="1"
                    value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                    className="mt-1 h-9 text-xs bg-white font-bold font-mono"
                  />
                </div>
              </div>

              {/* Optional Launch Promotion */}
              <div className="pt-2 border-t border-amber-200/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-amber-600" />
                    <Label htmlFor="attach-promo" className="text-xs font-semibold text-slate-800 cursor-pointer">
                      {t("dealerPricingLaunchPromotional")}
                    </Label>
                  </div>
                  <Switch
                    id="attach-promo"
                    checked={addForm.attachPromo}
                    onCheckedChange={(val) => setAddForm({ ...addForm, attachPromo: val })}
                  />
                </div>

                {addForm.attachPromo && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">{t("promoTierLabel")}</Label>
                      <Select
                        value={quickAddSelectedTier?.id || addForm.promoPriceTypeId}
                        onValueChange={(val) => setAddForm({ ...addForm, promoPriceTypeId: val })}
                      >
                        <SelectTrigger className="mt-1 h-9 text-xs bg-white">
                          <SelectValue placeholder={t("dealerPricingSelectTierPlaceholder")}>
                            {quickAddSelectedTier ? (
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: quickAddSelectedTier.badgeColor || "#ef4444" }}
                                />
                                <span>{getPromoTierLabel(quickAddSelectedTier, locale)}</span>
                                <span className="text-[10px] text-slate-400">({quickAddSelectedTier.mode === "PERCENT" ? "%" : "$"})</span>
                              </span>
                            ) : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {priceTypes.map((pt) => (
                            <SelectItem key={pt.id} value={pt.id}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: pt.badgeColor || "#ef4444" }}
                                />
                                <span>{getPromoTierLabel(pt, locale)}</span>
                                <span className="text-[10px] text-slate-400">({pt.mode === "PERCENT" ? "%" : "$"})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingDiscountPercentLabel")}</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="e.g. 10"
                        value={addForm.promoValue}
                        onChange={(e) => setAddForm({ ...addForm, promoValue: e.target.value })}
                        className="mt-1 h-9 text-xs bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {branches.length > 0 && (
              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingShowroomBranch")}</Label>
                <Select
                  value={addForm.branchId}
                  onValueChange={(val) => setAddForm({ ...addForm, branchId: val })}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue placeholder={t("dealerPricingSelectShowroom")} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.city})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setQuickAddOpen(false)}>
                {t("pricingCancelBtn")}
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                {t("dealerPricingAddVehicleBtn", { type: addCategory === "CAR" ? t("pricingCatCars") : addCategory === "MOTOR" ? t("pricingCatMotors") : t("pricingCatParts") })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Tier Management Dialog */}
      <Dialog open={tierModalOpen} onOpenChange={setTierModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Tag className="h-5 w-5 text-amber-600" />
                {t("dealerPricingManageTiersTitle")}
              </DialogTitle>
              <Button
                size="sm"
                onClick={openCreateTier}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("dealerPricingAddNewTier")}
              </Button>
            </div>
          </DialogHeader>

          <p className="text-xs text-slate-500 -mt-2">
            {t("dealerPricingTiersDesc")}
          </p>

          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs mt-3">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">{t("pricingPriorityCol")}</th>
                  <th className="py-2.5 px-3">{t("pricingBadgeCol")}</th>
                  <th className="py-2.5 px-3">{t("pricingCodeCol")}</th>
                  <th className="py-2.5 px-3">{t("pricingModeCol")}</th>
                  <th className="py-2.5 px-3">{t("pricingActiveCol")}</th>
                  <th className="py-2.5 px-3 text-right">{t("pricingActionsCol")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {priceTypes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      {t("dealerPricingNoTiersFound")}
                    </td>
                  </tr>
                ) : (
                  priceTypes.map((pt) => (
                    <tr key={pt.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700">
                        P{pt.priority ?? 0}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide text-white shadow-xs"
                          style={{ backgroundColor: pt.badgeColor || "#ef4444" }}
                        >
                          <Flame className="h-3 w-3 fill-white" />
                          {getPromoTierLabel(pt, locale)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 font-semibold">
                        {pt.code}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {pt.mode === "PERCENT" ? t("pricingPercentMode") : t("pricingFixedMode")}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        {pt.active !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                            {t("dealerPricingStatusActive")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-slate-500 text-[10px]">
                            {t("dealerPricingStatusInactive")}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditTier(pt)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-800 cursor-pointer"
                            title="Edit Tier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTier(pt.id, pt.label)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Delete / Deactivate Tier"
                            disabled={tierSubmitting}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setTierModalOpen(false)}>
              {t("dealerPricingDoneBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Tier Sub-Dialog */}
      <Dialog open={tierFormOpen} onOpenChange={setTierFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Tag className="h-5 w-5 text-amber-600" />
              {editingTier ? t("dealerPricingEditTierTitle", { label: editingTier.label }) : t("dealerPricingCreateTierTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingTierLabel")}</Label>
              <Input
                value={tierLabel}
                onChange={(e) => {
                  setTierLabel(e.target.value);
                  if (!editingTier && !tierCode) {
                    setTierCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
                  }
                }}
                placeholder="e.g. Flash Sale, Ramadan Deal, Clearance"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingUniqueCode")}</Label>
              <Input
                value={tierCode}
                onChange={(e) => setTierCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                disabled={Boolean(editingTier)}
                placeholder="e.g. FLASH_SALE"
                className="mt-1 h-9 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">{t("dealerPricingUniqueCodeDesc")}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("pricingCalculationMode")}</Label>
                <Select value={tierMode} onValueChange={(v: "PERCENT" | "FIXED") => setTierMode(v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">{t("pricingModePercentOpt")}</SelectItem>
                    <SelectItem value="FIXED">{t("pricingModeFixedOpt")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("dealerPricingPriorityHigherWins")}</Label>
                <Input
                  type="number"
                  value={tierPriority}
                  onChange={(e) => setTierPriority(e.target.value)}
                  placeholder="50"
                  className="mt-1 h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Badge Color Picker */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">{t("pricingBadgeColor")}</Label>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {[
                  { color: "#EF4444", name: "Red" },
                  { color: "#F97316", name: "Orange" },
                  { color: "#F59E0B", name: "Amber" },
                  { color: "#10B981", name: "Emerald" },
                  { color: "#06B6D4", name: "Cyan" },
                  { color: "#3B82F6", name: "Blue" },
                  { color: "#6366F1", name: "Indigo" },
                  { color: "#8B5CF6", name: "Purple" },
                  { color: "#EC4899", name: "Pink" },
                ].map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setTierBadgeColor(c.color)}
                    style={{ backgroundColor: c.color }}
                    className={cn(
                      "h-6 w-6 rounded-full transition-transform cursor-pointer relative",
                      tierBadgeColor.toLowerCase() === c.color.toLowerCase()
                        ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                        : "hover:scale-105"
                    )}
                    title={c.name}
                  />
                ))}
                <div className="flex items-center gap-1.5 ml-auto">
                  <Input
                    type="color"
                    value={tierBadgeColor}
                    onChange={(e) => setTierBadgeColor(e.target.value)}
                    className="h-7 w-8 p-0 cursor-pointer border-0"
                  />
                  <Input
                    value={tierBadgeColor}
                    onChange={(e) => setTierBadgeColor(e.target.value)}
                    className="h-7 w-20 text-[11px] font-mono p-1"
                  />
                </div>
              </div>
            </div>

            {/* Badge Preview */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">{t("pricingBadgeCol")}:</span>
              <span
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide text-white shadow-xs"
                style={{ backgroundColor: tierBadgeColor || "#ef4444" }}
              >
                <Flame className="h-3.5 w-3.5 fill-white" />
                {tierLabel.trim() || "Preview"}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                id="tier-active"
                checked={tierActive}
                onCheckedChange={setTierActive}
              />
              <Label htmlFor="tier-active" className="text-xs font-medium text-slate-700 cursor-pointer">
                {t("dealerPricingActiveTierToggle")}
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button variant="outline" onClick={() => setTierFormOpen(false)}>
              {t("pricingCancelBtn")}
            </Button>
            <Button
              onClick={handleSaveTier}
              disabled={tierSubmitting || !tierLabel.trim()}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
            >
              {tierSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editingTier ? t("pricingSaveChangesBtn") : t("dealerPricingCreateTierBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Listing Editor Dialog (In-Place Edit without page reload) */}
      {editorVehicleId && (
        <ListingEditorDialog
          vehicleId={editorVehicleId}
          open={Boolean(editorVehicleId)}
          onOpenChange={(open) => !open && setEditorVehicleId(null)}
          onSaved={() => {
            setEditorVehicleId(null);
            refetch();
          }}
        />
      )}

      {/* Delete Listing Confirmation Dialog */}
      {deletingVehicle && (
        <AlertDialog open={Boolean(deletingVehicle)} onOpenChange={(open) => !open && setDeletingVehicle(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dealerPricingDeleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("dealerPricingDeleteDesc", {
                  vehicle: `${deletingVehicle.make} ${deletingVehicle.model} ${deletingVehicle.year}${deletingVehicle.stockNo ? ` (${deletingVehicle.stockNo})` : ""}`,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletingVehicle(null)}>{t("pricingCancelBtn")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDeleteListing(deletingVehicle.id)}
                className="bg-rose-600 text-white hover:bg-rose-700 font-bold"
              >
                {t("dealerPricingDeleteConfirmBtn")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Include from Inventory Dialog */}
      <Dialog open={includeInventoryOpen} onOpenChange={setIncludeInventoryOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Boxes className="h-5 w-5 text-amber-600" />
              {t("dealerPricingIncludeTitle")}
            </DialogTitle>
            <p className="text-xs text-slate-500">
              {t("dealerPricingIncludeDesc")}
            </p>
          </DialogHeader>

          {/* Search and Category Filter */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              {[
                { id: "ALL", label: t("pricingCatAll") },
                { id: "CAR", label: t("pricingCatCars") },
                { id: "MOTOR", label: t("pricingCatMotors") },
                { id: "SPARE_PART", label: t("pricingCatParts") },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setIncludeCategory(c.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer",
                    includeCategory === c.id
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder={t("dealerPricingSearchInventoryPlaceholder")}
                value={includeSearch}
                onChange={(e) => setIncludeSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          {/* Filtered Inventory List */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[380px] border border-slate-200 rounded-xl my-3 divide-y divide-slate-100">
            {(() => {
              const filtered = vehicles.filter((v) => {
                const matchCat = includeCategory === "ALL" || v.listingCategory === includeCategory;
                const q = includeSearch.toLowerCase().trim();
                const matchSearch =
                  !q ||
                  v.make.toLowerCase().includes(q) ||
                  v.model.toLowerCase().includes(q) ||
                  (v.stockNo && v.stockNo.toLowerCase().includes(q)) ||
                  (v.chassisNo && v.chassisNo.toLowerCase().includes(q));
                return matchCat && matchSearch;
              });

              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {t("dealerPricingNoMatchingInventory")}
                  </div>
                );
              }

              return (
                <div>
                  <div className="bg-slate-50/80 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every((v) => includeSelectedIds.includes(v.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setIncludeSelectedIds(Array.from(new Set([...includeSelectedIds, ...filtered.map((v) => v.id)])));
                          } else {
                            const ids = new Set(filtered.map((v) => v.id));
                            setIncludeSelectedIds(includeSelectedIds.filter((id) => !ids.has(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer h-4 w-4"
                      />
                      <span>{t("dealerPricingSelectAllCount", { count: filtered.length })}</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {t("dealerPricingSelectedCount", { count: includeSelectedIds.length })}
                    </span>
                  </div>

                  {filtered.map((v) => {
                    const isChecked = includeSelectedIds.includes(v.id);
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          setIncludeSelectedIds((prev) =>
                            prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id]
                          );
                        }}
                        className={cn(
                          "px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors",
                          isChecked && "bg-amber-50/40"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer h-4 w-4 shrink-0"
                          />
                          <div className="h-9 w-12 shrink-0 rounded bg-slate-100 overflow-hidden">
                            {v.images[0] ? (
                              <img src={v.images[0]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <CarFront className="h-3.5 w-3.5 text-slate-300" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">
                              {v.make} {v.model} {v.variant || ""} {v.year}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500">
                              {v.stockNo && <span>Stock: {v.stockNo} ·</span>}
                              <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 py-0.2 rounded">
                                {t("dealerPricingInStock", { count: v.stockQuantity || 1 })}
                              </span>
                              <span>· {t("pricingBasePriceCol")}: {formatUsd(v.basePriceUsd)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {v.isOnSale && v.activePriceType ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide text-white"
                              style={{ backgroundColor: v.activePriceType.badgeColor || "#ef4444" }}
                            >
                              <Flame className="h-2.5 w-2.5" />
                              {getPromoTierLabel(v.activePriceType, locale)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">{t("pricingRegularBadge")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Promotional Configuration Footer */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-3">
            <p className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              {t("dealerPricingAssignCampaignTitle", { count: includeSelectedIds.length })}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">{t("promoTierLabel")}</Label>
                <Select
                  value={includeSelectedTier?.id || includePromoTypeId}
                  onValueChange={setIncludePromoTypeId}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs bg-white w-full">
                    <SelectValue placeholder={t("dealerPricingSelectTierPlaceholder")}>
                      {includeSelectedTier ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: includeSelectedTier.badgeColor || "#ef4444" }}
                          />
                          <span>{getPromoTierLabel(includeSelectedTier, locale)}</span>
                          <span className="text-slate-400 text-[10px]">
                            ({includeSelectedTier.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                          </span>
                        </span>
                      ) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {priceTypes.map((pt) => (
                      <SelectItem key={pt.id} value={pt.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: pt.badgeColor || "#ef4444" }}
                          />
                          <span>{getPromoTierLabel(pt, locale)}</span>
                          <span className="text-slate-400 text-[10px]">
                            ({pt.mode === "PERCENT" ? t("dealerPricingPercentOff") : t("dealerPricingFixedUsd")})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  {priceTypes.find((p) => p.id === (includePromoTypeId || priceTypes[0]?.id))?.mode === "PERCENT"
                    ? t("dealerPricingDiscountPercentLabel")
                    : t("dealerPricingReductionAmountLabel")}
                </Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 10"
                  value={includePromoValue}
                  onChange={(e) => setIncludePromoValue(e.target.value)}
                  className="mt-1 h-9 text-xs bg-white font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-3 flex-row items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setIncludeInventoryOpen(false)}>
              {t("pricingCancelBtn")}
            </Button>
            <Button
              onClick={handleIncludeInventorySubmit}
              disabled={submitting || includeSelectedIds.length === 0}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {t("dealerPricingApplyPromoCountBtn", { count: includeSelectedIds.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

