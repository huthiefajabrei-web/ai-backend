"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Home, Lock, Mail, ShieldCheck } from "lucide-react";
import { apiGetMe, apiLogin, removeToken, setStoredUser, setToken, AUTH_NETWORK_ERROR } from "@/lib/mysql/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "forbidden") {
        setMessage("هذا الحساب لا يملك صلاحية الوصول إلى لوحة الإدارة.");
      }

      const me = await apiGetMe();
      if (me && me !== AUTH_NETWORK_ERROR && me.is_admin) {
        router.replace("/admin");
      }
    };

    void boot();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const data = await apiLogin(email, password);
      if (!data.ok || !data.token || !data.user) {
        throw new Error(data.error || "تعذر تسجيل الدخول.");
      }

      if (!data.user.is_admin) {
        removeToken();
        setMessage("هذا الحساب ليس حساب Admin.");
        return;
      }

      setToken(data.token);
      setStoredUser(data.user);
      router.replace("/admin");
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل الدخول.";
      setMessage(text);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040508] text-slate-50 p-6 relative overflow-hidden selection:bg-purple-500/30">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-[15%] -left-[10%] w-[45vw] h-[45vw] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_80%)]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex flex-col gap-6">
        <Link
          href="/"
          className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Home size={16} />
          Back to Studio
        </Link>

        <div className="grid lg:grid-cols-[1.1fr_0.9fr] rounded-3xl overflow-hidden border border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.55)]">
          <div className="hidden lg:flex flex-col justify-between p-10 bg-[linear-gradient(135deg,rgba(15,23,42,0.8),rgba(88,28,135,0.35))] border-r border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-[0_0_25px_rgba(139,92,246,0.35)]">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="font-bold text-xl">Admin Portal</div>
                <div className="text-xs uppercase tracking-[0.25em] text-purple-300">H_ARCH Studio</div>
              </div>
            </div>

            <div>
              <h1 className="text-4xl font-bold font-display leading-tight mb-4">
                Secure access to your content control center.
              </h1>
              <p className="text-slate-300/80 leading-7 max-w-md">
                Log in with an authorized admin account to manage hero sections, apps, plans, prompts, and uploaded assets.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-sm w-fit">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Protected admin authentication enabled
            </div>
          </div>

          <div className="p-8 sm:p-10 lg:p-12 bg-[#0a0c13]">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-300 text-xs font-semibold mb-4">
                <ShieldCheck size={14} />
                Admin Access Only
              </div>
              <h2 className="text-3xl font-bold font-display mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-300">
                Admin Login
              </h2>
              <p className="text-slate-400 text-sm">
                Use your authorized admin credentials to enter the dashboard.
              </p>
            </div>

            {message && (
              <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Admin email"
                  required
                  className="w-full rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:bg-black/50 transition-colors"
                />
              </div>

              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 pl-12 pr-4 py-4 text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:bg-black/50 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-4 font-semibold text-white shadow-[0_12px_30px_rgba(99,102,241,0.35)] hover:opacity-95 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
              >
                <span className="flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Checking access...
                    </>
                  ) : (
                    <>
                      Enter Admin Dashboard
                      <ArrowRight size={18} />
                    </>
                  )}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
