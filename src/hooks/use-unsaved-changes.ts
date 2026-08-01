import { useCallback, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";

type Opts = {
  /** True when the editor has changes that were not persisted yet. */
  dirty: boolean;
  /**
   * Optional save handler. Return false to abort leaving (e.g. validation
   * failed); anything else counts as a successful save.
   */
  onSave?: () => Promise<boolean | void> | boolean | void;
  /** Set false to fully disable the guard (e.g. while loading). */
  enabled?: boolean;
  /** Also guard browser tab close / reload. Defaults to true. */
  guardUnload?: boolean;
  /**
   * Ref that, when true, suppresses the guard synchronously. Use it around an
   * explicit save + navigate so the blocker cannot fire before React re-renders
   * with the new "clean" state (which would prompt after an already-saved form).
   */
  suppressRef?: { current: boolean };
};

/**
 * Unsaved-changes guard. Covers in-app navigation (TanStack Router blocker),
 * browser unload, and manual close/cancel actions routed through `guard()`.
 */
export function useUnsavedChanges({ dirty, onSave, enabled = true, guardUnload = true, suppressRef }: Opts) {
  const active = enabled && dirty;
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const isActive = useCallback(
    () => activeRef.current && !suppressRef?.current,
    [suppressRef],
  );

  const blocker = useBlocker({
    shouldBlockFn: isActive,
    enableBeforeUnload: () => guardUnload && isActive(),
    withResolver: true,
    disabled: !active,
  });


  const blocked = blocker.status === "blocked";
  const open = blocked || pending !== null;

  /** Run `action` immediately when clean, otherwise ask first. */
  const guard = useCallback(
    (action: () => void) => {
      if (!isActive()) {
        action();
        return;
      }
      setPending(() => action);
    },
    [isActive],
  );


  const proceed = useCallback(() => {
    const action = pending;
    setPending(null);
    if (blocked) blocker.proceed?.();
    if (action) action();
  }, [pending, blocked, blocker]);

  const cancel = useCallback(() => {
    setPending(null);
    if (blocked) blocker.reset?.();
  }, [blocked, blocker]);

  const saveAndProceed = useCallback(async () => {
    if (!onSave) {
      proceed();
      return;
    }
    setBusy(true);
    try {
      const res = await onSave();
      if (res === false) {
        cancel();
        return;
      }
      proceed();
    } finally {
      setBusy(false);
    }
  }, [onSave, proceed, cancel]);

  return { open, busy, guard, proceed, cancel, saveAndProceed };
}
