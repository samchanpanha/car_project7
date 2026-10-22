"use client";

import { useState } from "react";
import { useFetch, apiSend } from "@/lib/client-hooks";
import { useT } from "@/hooks/use-t";
import type { TenantBranchDTO } from "@/lib/dashboard-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Building2,
  Car,
  Clock,
  Crown,
  Edit2,
  Loader2,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";

interface BranchesApiResponse {
  branches: TenantBranchDTO[];
  canAddMore: boolean;
  plan: string;
  isPro: boolean;
}

interface BranchFormData {
  name: string;
  nameKm: string;
  city: string;
  district: string;
  address: string;
  phone: string;
  telegram: string;
  openingHours: string;
  imageUrl: string;
  isMain: boolean;
}

const EMPTY_BRANCH_FORM: BranchFormData = {
  name: "",
  nameKm: "",
  city: "Phnom Penh",
  district: "",
  address: "",
  phone: "",
  telegram: "",
  openingHours: "Mon - Sun: 8:00 AM - 6:00 PM",
  imageUrl: "",
  isMain: false,
};

export function DealerBranches() {
  const t = useT();
  const navigate = useAppStore((s) => s.navigate);
  const { data, loading, error, refetch } = useFetch<BranchesApiResponse>("/api/tenant/branches");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<TenantBranchDTO | null>(null);
  const [form, setForm] = useState<BranchFormData>(EMPTY_BRANCH_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const branches = data?.branches ?? [];
  const isPro = data?.isPro ?? false;
  const canAddMore = data?.canAddMore ?? false;

  const goToUpgrade = () => {
    toast.info("Please upgrade to PRO or ENTERPRISE to enable multiple showroom branches.");
    navigate({ name: "dashboard", tab: "subscription" });
  };

  const openCreateDialog = () => {
    if (!isPro) {
      goToUpgrade();
      return;
    }
    setEditingBranch(null);
    setForm({
      ...EMPTY_BRANCH_FORM,
      isMain: branches.length === 0,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (b: TenantBranchDTO) => {
    setEditingBranch(b);
    setForm({
      name: b.name,
      nameKm: b.nameKm || "",
      city: b.city,
      district: b.district || "",
      address: b.address,
      phone: b.phone || "",
      telegram: b.telegram || "",
      openingHours: b.openingHours || "",
      imageUrl: b.imageUrl || "",
      isMain: b.isMain,
    });
    setDialogOpen(true);
  };

  const saveBranch = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      toast.warning("Please provide both branch name and address");
      return;
    }

    setSubmitting(true);
    try {
      if (editingBranch) {
        await apiSend(`/api/tenant/branches/${editingBranch.id}`, "PATCH", {
          name: form.name.trim(),
          nameKm: form.nameKm.trim() || null,
          city: form.city.trim() || "Phnom Penh",
          district: form.district.trim() || null,
          address: form.address.trim(),
          phone: form.phone.trim() || null,
          telegram: form.telegram.trim() || null,
          openingHours: form.openingHours.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          isMain: form.isMain,
        });
        toast.success("Branch updated successfully");
      } else {
        await apiSend("/api/tenant/branches", "POST", {
          name: form.name.trim(),
          nameKm: form.nameKm.trim() || null,
          city: form.city.trim() || "Phnom Penh",
          district: form.district.trim() || null,
          address: form.address.trim(),
          phone: form.phone.trim() || null,
          telegram: form.telegram.trim() || null,
          openingHours: form.openingHours.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          isMain: form.isMain,
        });
        toast.success("Branch created successfully");
      }
      setDialogOpen(false);
      refetch();
    } catch (e: any) {
      if (e?.code === "PLAN_UPGRADE_REQUIRED" || e?.status === 403) {
        setDialogOpen(false);
        goToUpgrade();
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to save branch");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const setMainBranch = async (branchId: string) => {
    setBusyId(branchId);
    try {
      await apiSend(`/api/tenant/branches/${branchId}`, "PATCH", { isMain: true });
      toast.success("Main showroom branch updated");
      refetch();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Failed to set main branch");
    } finally {
      setBusyId(null);
    }
  };

  const deleteBranch = async (branchId: string) => {
    if (!confirm("Are you sure you want to delete this branch? Vehicles assigned to it will remain in stock.")) return;
    setBusyId(branchId);
    try {
      await apiSend(`/api/tenant/branches/${branchId}`, "DELETE");
      toast.success("Branch removed");
      refetch();
    } catch (e: any) {
      toast.error(e instanceof Error ? e.message : "Failed to delete branch");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Pro Plan Feature Banner if not on Pro */}
      {!isPro && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950 font-bold shadow-xs">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Multiple Showroom Branches (Pro & Enterprise Feature)
                  </h3>
                  <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">PRO</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600 max-w-xl">
                  Expand your dealership across Cambodia with separate locations (Sen Sok, Toul Kork, Siem Reap, Battambang). Assign inventory to specific showrooms and display location contacts directly on car pages.
                </p>
              </div>
            </div>
            <Button
              onClick={goToUpgrade}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0 self-start sm:self-center"
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Upgrade to Pro
            </Button>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
            Showroom Branches ({branches.length})
          </h2>
          <p className="text-xs text-slate-500">
            {isPro
              ? "Manage your physical dealerships, branches, and showrooms."
              : "Showroom branches is an exclusive Pro & Enterprise feature. Upgrade to enable branch showrooms."}
          </p>
        </div>
        {isPro ? (
          <Button
            onClick={openCreateDialog}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Branch
          </Button>
        ) : (
          <Button
            onClick={goToUpgrade}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs gap-1.5"
          >
            <Crown className="h-4 w-4" />
            Upgrade to Pro to Add Branch
          </Button>
        )}
      </div>

      {/* Loading state */}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          <p className="font-semibold">Failed to load showroom branches</p>
          <p className="mt-1">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="mt-2 text-xs">
            Retry
          </Button>
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Building2 className="h-10 w-10 text-slate-300 mb-2" />
          <h4 className="text-sm font-bold text-slate-800">No Branches Registered Yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mt-1">
            {isPro
              ? "Register your dealership branches so buyers can find your showrooms and physical stock."
              : "Showroom branches are available on Pro and Enterprise plans. Upgrade your plan to add showroom locations."}
          </p>
          {isPro ? (
            <Button
              onClick={openCreateDialog}
              className="mt-4 bg-amber-500 text-slate-950 font-semibold text-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Branch
            </Button>
          ) : (
            <Button
              onClick={goToUpgrade}
              className="mt-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5"
            >
              <Crown className="h-4 w-4" />
              Upgrade to Pro Plan
            </Button>
          )}
        </div>
      ) : (
        /* Branch Cards Grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <div
              key={b.id}
              className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-4 transition-all shadow-xs ${
                b.isMain ? "border-amber-400 ring-1 ring-amber-400/50" : "border-slate-200"
              }`}
            >
              <div>
                {/* Storefront Image or Icon */}
                <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl bg-slate-100">
                  {b.imageUrl ? (
                    <img src={b.imageUrl} alt={b.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                      <Building2 className="h-8 w-8 text-slate-400" />
                    </div>
                  )}
                  {b.isMain && (
                    <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-slate-950 shadow-xs">
                      <Star className="h-3 w-3 fill-slate-950" />
                      Main Showroom
                    </span>
                  )}
                </div>

                {/* Branch Info */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{b.name}</h3>
                    {b.nameKm && <p className="text-xs text-slate-500 font-khmer">{b.nameKm}</p>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-slate-900"
                        disabled={busyId === b.id}
                      >
                        {busyId === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44 text-xs">
                      <DropdownMenuLabel className="text-[11px]">Branch Options</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openEditDialog(b)}>
                        <Edit2 className="h-3.5 w-3.5 mr-2" />
                        Edit Details
                      </DropdownMenuItem>
                      {!b.isMain && (
                        <DropdownMenuItem onClick={() => setMainBranch(b.id)}>
                          <Star className="h-3.5 w-3.5 mr-2" />
                          Set as Main Branch
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteBranch(b.id)}
                        className="text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete Branch
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                  <p className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 mt-0.5" />
                    <span>
                      {b.address}, {b.city}
                    </span>
                  </p>
                  {b.phone && (
                    <p className="flex items-center gap-1.5 font-mono">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{b.phone}</span>
                    </p>
                  )}
                  {b.telegram && (
                    <p className="flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                      <span>@{b.telegram.replace("@", "")}</span>
                    </p>
                  )}
                  {b.openingHours && (
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{b.openingHours}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom stats badge */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-semibold text-slate-700">
                  <Car className="h-3.5 w-3.5 text-amber-600" />
                  {b.vehicleCount || 0} cars in stock
                </span>
                <span className="text-[11px] text-slate-400">
                  {b.status === "ACTIVE" ? (
                    <span className="text-emerald-700 font-medium">● Active</span>
                  ) : (
                    <span className="text-slate-400">● Inactive</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Branch Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-amber-600" />
              {editingBranch ? "Edit Showroom Branch" : "Add New Showroom Branch"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs">Branch Name (English) *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sen Sok Flagship Showroom"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Branch Name (Khmer)</Label>
              <Input
                value={form.nameKm}
                onChange={(e) => setForm({ ...form, nameKm: e.target.value })}
                placeholder="ឧ. សាខាសែនសុខ"
                className="mt-1 h-9 text-xs font-khmer"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">City / Province *</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Phnom Penh"
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">District / Khan</Label>
                <Input
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  placeholder="e.g. Sen Sok"
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Full Physical Address *</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="St. 2004, Sangkat Teuk Thla"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Branch Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+855 12 345 678"
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Telegram Username</Label>
                <Input
                  value={form.telegram}
                  onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  placeholder="khlan_sensok"
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Opening Hours</Label>
              <Input
                value={form.openingHours}
                onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
                placeholder="Mon - Sun: 8:00 AM - 6:00 PM"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Showroom Photo URL</Label>
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://... or upload photo link"
                className="mt-1 h-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="isMainBranchCheck"
                type="checkbox"
                checked={form.isMain}
                onChange={(e) => setForm({ ...form, isMain: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              <label htmlFor="isMainBranchCheck" className="text-xs font-medium text-slate-700">
                Set as Primary / Main Showroom
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveBranch}
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editingBranch ? "Save Changes" : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
