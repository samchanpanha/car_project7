"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

export default function SubscriptionsPage() {
  const navigate = useAppStore((s) => s.navigate);
  
  useEffect(() => {
    navigate({ name: "dashboard", tab: "subscription" });
  }, [navigate]);
  
  return null;
}
