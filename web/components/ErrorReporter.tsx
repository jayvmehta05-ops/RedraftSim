"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report";

/** Catches uncaught errors and failed promises anywhere on the page and reports them. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportError(ev.error ?? ev.message, "window.onerror");
    const onRejection = (ev: PromiseRejectionEvent) => reportError(ev.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
