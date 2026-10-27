"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const value = params.get("tab");
  const active = tabs.includes(value as T) ? (value as T) : fallback;
  const select = (tab: T) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", tab);
    next.delete("action");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return [active, select] as const;
}

/** Consume a quick action once, so cancelling/closing and using it again works. */
export function useQuickCreate(onCreate: () => void) {
  const params = useSearchParams().toString();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (next.get("action") !== "create") return;
    const frame = window.requestAnimationFrame(() => {
      onCreate();
      next.delete("action");
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [params, pathname, router, onCreate]);
}
