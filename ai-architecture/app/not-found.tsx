import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#040508] text-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <p className="text-teal-400 text-sm font-medium">404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-slate-400 text-sm">
          The page you are looking for does not exist or was moved.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-sm font-medium"
        >
          Back to Studio
        </Link>
      </div>
    </div>
  );
}
