"use client";

import Link from "next/link";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-[#040508] text-slate-50 flex items-center justify-center p-6 pb-mobile-nav">
      <div className="max-w-md w-full text-center space-y-6">
        <p className="text-purple-400 text-sm font-bold tracking-[0.2em] uppercase">404</p>
        <h1 className="text-2xl sm:text-3xl font-display font-bold">Page not found</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          The page you are looking for does not exist or was moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:opacity-90 transition-opacity text-sm font-semibold tap-target"
          >
            <Home size={16} />
            Back to Studio
          </Link>
          <button
            type="button"
            onClick={() => typeof window !== "undefined" && window.history.back()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold tap-target"
          >
            <ArrowLeft size={16} />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
