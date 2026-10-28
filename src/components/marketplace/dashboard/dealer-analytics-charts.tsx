"use client";

import { useState } from "react";
import { useFetch } from "@/lib/client-hooks";
import { formatUsd } from "@/lib/format";
import type { TenantAnalyticsDTO } from "@/lib/dashboard-types";
import { SectionCard, StatCardSkeleton } from "./bits";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Eye,
  MessageSquare,
  CalendarCheck,
  Building2,
  Percent,
  Car,
} from "lucide-react";

const TIMEFRAMES = [
  { label: "7 Days", value: 7 },
  { label: "30 Days", value: 30 },
  { label: "90 Days", value: 90 },
];

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

export function DealerAnalyticsCharts() {
  const [days, setDays] = useState(30);
  const { data, loading, error, refetch } = useFetch<TenantAnalyticsDTO>(
    `/api/tenant/analytics?days=${days}`,
  );

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
        <p className="font-semibold">Failed to load analytics</p>
        <p className="mt-1">{error}</p>
        <Button variant="outline" size="sm" onClick={refetch} className="mt-2 text-xs">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, timeline, statusBreakdown, bodyTypeBreakdown, branchBreakdown } = data;

  return (
    <div className="space-y-5">
      {/* Timeframe selector header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            Performance & Inventory Analytics
          </h3>
          <p className="text-xs text-slate-500">Live operational overview, buyer inquiry trends, and asset value</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/70 p-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => setDays(tf.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                days === tf.value
                  ? "bg-white text-slate-950 font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Inventory Value
            </span>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">
            {formatUsd(summary.totalInventoryValue)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Avg {formatUsd(summary.avgPrice)} / car
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Inquiries (Leads)
            </span>
            <MessageSquare className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.totalLeads}</p>
          <p className="mt-0.5 text-[11px] text-emerald-700 font-medium">
            {summary.conversionRate}% conversion rate
          </p>
        </div>

        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">
              Total Car Views
            </span>
            <Eye className="h-4 w-4 text-sky-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.totalViews.toLocaleString()}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Across {summary.totalListings} listings</p>
        </div>

        <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-800">
              Appointments
            </span>
            <CalendarCheck className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.appointmentCount}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Confirmed & requested</p>
        </div>
      </div>

      {/* SLA Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">Pending Appointments</span>
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.pendingAppointments ?? 0}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Requested but not confirmed</p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Stale Leads</span>
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.staleLeads ?? 0}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Pending over 24 hours</p>
        </div>
        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-800">Avg Response Time</span>
          </div>
          <p className="mt-2 text-xl font-extrabold text-slate-950">{summary.avgResponseHours ?? 0} h</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Appointment update latency</p>
        </div>
      </div>

      {data.staleLeadDetails && data.staleLeadDetails.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <p className="text-xs font-bold text-slate-800 mb-2">Stale Lead Drill-down</p>
          <ul className="space-y-1">
            {data.staleLeadDetails.map((lead) => (
              <li key={lead.id} className="text-xs text-slate-600">
                {lead.type} #{lead.id.slice(-6)} on vehicle {lead.vehicleId.slice(-6)} – {lead.hoursPending}h pending
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Views & Leads Performance Chart */}
      <SectionCard title={`Views & Buyer Inquiries Trend (Last ${days} Days)`}>
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "12px",
                  color: "#fff",
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              <Area
                type="monotone"
                dataKey="views"
                name="Listing Views"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#viewsGrad)"
              />
              <Area
                type="monotone"
                dataKey="leads"
                name="Buyer Inquiries"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#leadsGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Secondary charts: Status Breakdown & Body Types */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Status Distribution */}
        <SectionCard title="Inventory by Status & Asset Value">
          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="status" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip
                  formatter={(val: any, name: string) => [
                    name === "count" ? `${val} cars` : formatUsd(Number(val)),
                    name === "count" ? "Vehicle Count" : "Value",
                  ]}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", fontSize: "12px", color: "#fff" }}
                />
                <Bar dataKey="count" name="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {statusBreakdown.map((s) => (
              <span key={s.status} className="rounded-md bg-slate-100 px-2 py-0.5">
                <span className="font-semibold text-slate-700">{s.status}:</span> {s.count} ({formatUsd(s.value)})
              </span>
            ))}
          </div>
        </SectionCard>

        {/* Body Types Distribution */}
        <SectionCard title="Stock by Vehicle Type">
          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bodyTypeBreakdown}
                  dataKey="count"
                  nameKey="type"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                  paddingAngle={3}
                  label={({ type, percent }: any) => `${type} ${(percent * 100).toFixed(0)}%`}
                >
                  {bodyTypeBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [`${val} vehicles`, "Stock Count"]}
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", fontSize: "12px", color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Branch Performance Comparison (When Dealership Has Branches) */}
      {branchBreakdown && branchBreakdown.length > 0 && (
        <SectionCard title="Showroom Branches Performance Comparison">
          <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "none", fontSize: "12px", color: "#fff" }}
                />
                <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="count" name="Stock Count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="leads" name="Buyer Leads" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
