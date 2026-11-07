"use client";

import { useEffect, useState } from "react";

export type PatientQueryState<T> =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: T };

/** Ignores stale responses on navigation, unmount, mutation, or retry. */
export function usePatientQuery<T>(read: () => Promise<T>, revision = 0) {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{
    read: typeof read;
    attempt: number;
    revision: number;
    state: PatientQueryState<T>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(read)
      .then(
        (data) => {
          if (active)
            setResponse({
              read,
              attempt,
              revision,
              state: { status: "ready", data },
            });
        },
        () => {
          if (active)
            setResponse({
              read,
              attempt,
              revision,
              state: { status: "error" },
            });
        },
      );
    return () => {
      active = false;
    };
  }, [read, attempt, revision]);
  const state: PatientQueryState<T> =
    response?.read === read &&
    response.attempt === attempt &&
    response.revision === revision
      ? response.state
      : { status: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
