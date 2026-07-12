"use client";

import { useEffect } from "react";

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
    <div className="min-h-screen bg-[#040508] text-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-slate-400 text-sm">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
