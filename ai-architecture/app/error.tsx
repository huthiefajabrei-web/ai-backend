"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] bg-[#040508] text-slate-50 flex items-center justify-center p-6 pb-mobile-nav">
      <div className="max-w-md w-full text-center space-y-6">
        <p className="text-red-400/90 text-sm font-bold tracking-[0.15em] uppercase">Error</p>
        <h1 className="text-2xl sm:text-3xl font-display font-bold">Something went wrong</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          An unexpected error occurred. Please try again or return to the studio.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-700 to-yellow-600 hover:opacity-90 transition-opacity text-sm font-semibold tap-target"
          >
            <RefreshCw size={16} />
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold tap-target"
          >
            <Home size={16} />
            Back to Studio
          </Link>
        </div>
      </div>
    </div>
  );
}
