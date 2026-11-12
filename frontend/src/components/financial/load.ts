"use client";

import { useEffect, useState } from "react";

export function useFinancialLoad<T>(load: () => Promise<T>, enabled = true) {
  const [result, setResult] = useState<{ load: typeof load; data?: T; error?: unknown }>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.resolve().then(load).then(
      data => { if (active) setResult({ load, data }); },
      error => { if (active) setResult({ load, error }); },
    );
    return () => { active = false; };
  }, [load, enabled]);
  return enabled && result?.load === load ? result : undefined;
}
