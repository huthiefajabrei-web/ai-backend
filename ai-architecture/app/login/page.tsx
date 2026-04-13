"use client";

// ============================================================
// SUPABASE LOGIN - معلّق مؤقتاً (لم يُحذف)
// تم الانتقال إلى Backend Auth (Supabase Postgres)
// ============================================================
/*
ORIGINAL SUPABASE IMPORTS & LOGIC:

import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

handleSubmit - isLogin:
  const { error } = await supabase.auth.signInWithPassword({ email, password });

handleSubmit - register:
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });

handleOAuth:
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectTo } });
*/

import React, { useState, useEffect } from "react";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Home,
} from "lucide-react";
import Link from "next/link";
import { apiLogin, apiRegister, setToken, setStoredUser } from "@/lib/mysql/client";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth") setMessage({ type: "error", text: "فشل تسجيل الدخول. حاول مرة أخرى." });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);
    try {
      if (isLogin) {
        // Backend login
        const data = await apiLogin(email, password);
        if (!data.ok) throw new Error(data.error || "Invalid email or password");
        setToken(data.token);
        setStoredUser(data.user);
        window.location.href = "/";
        return;
      }
      // Backend register
      const data = await apiRegister(email, password, name || undefined);
      if (!data.ok) throw new Error(data.error || "Registration failed");
      setToken(data.token);
      setStoredUser(data.user);
      setMessage({ type: "success", text: "تم إنشاء الحساب بنجاح! جارٍ التوجيه..." });
      setTimeout(() => { window.location.href = "/"; }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ. حاول مرة أخرى.";
      setMessage({ type: "error", text: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLogin(!isLogin);
    setName("");
    setEmail("");
    setPassword("");
    setMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-8 overflow-hidden bg-[#040508] font-sans text-slate-50 selection:bg-purple-500/30">
      {/* Animated Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-radial from-purple-600/20 to-transparent blur-[120px] mix-blend-screen animate-[float_20s_infinite_ease-in-out_alternate]"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-radial from-blue-600/20 to-transparent blur-[120px] mix-blend-screen animate-[float_25s_infinite_ease-in-out_alternate-reverse]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_0%,transparent_80%)]"></div>
      </div>

      <div className="relative z-10 w-full max-w-[1100px] flex flex-col gap-6">
        {/* Back to Home Button */}
        <Link
          href="/"
          className="self-start inline-flex items-center gap-2 text-slate-400 py-2 px-4 bg-white/5 border border-white/10 rounded-full no-underline text-sm font-medium transition-all duration-300 backdrop-blur-md hover:bg-white/10 hover:text-white hover:-translate-x-1"
        >
          <Home size={18} />
          <span>Back to Studio</span>
        </Link>

        {/* Main Card */}
        <div className="flex w-full min-h-[600px] bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.05)] animate-[cardEntrance_0.8s_cubic-bezier(0.16,1,0.3,1)]">

          {/* Left Side - Visual */}
          <div className="hidden lg:block flex-[1.2] relative bg-[url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1500&auto=format&fit=crop')] bg-cover bg-center">
            <div className="absolute inset-0 bg-gradient-to-br from-[#040508]/80 to-purple-500/40"></div>
            <div className="relative z-10 h-full p-12 flex flex-col justify-between">

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-display font-extrabold text-2xl tracking-tight text-white">H_ARCH</span>
                  <span className="text-xs text-purple-300 font-semibold tracking-[0.15em] uppercase mt-0.5">Studio</span>
                </div>
              </div>

              <div>
                <h2 className="font-display text-4xl font-bold leading-tight mb-4 text-white drop-shadow-md">
                  Shape the world of tomorrow.
                </h2>
                <p className="text-lg text-white/80 leading-relaxed max-w-[400px]">
                  Harness the power of AI to generate breathtaking architectural concepts in seconds.
                </p>
              </div>

              <div className="flex items-center">
                <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs font-medium text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse"></span>
                  <span>Engine Online v3.2 · Supabase</span>
                </div>
              </div>

            </div>
          </div>

          {/* Right Side - Form */}
          <div className="flex-1 p-10 sm:p-14 flex flex-col justify-center bg-[#0a0c13] relative">
            <div className="mb-10">
              <h2 className="font-display text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-purple-300">
                {isLogin ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-slate-400 text-sm">
                {isLogin
                  ? "Enter your credentials to access your workspace"
                  : "Join H_ARCH STUDIO and start creating masterpieces"}
              </p>
            </div>

            {message && (
              <div
                className={`mb-4 p-3 rounded-xl text-sm ${message.type === "error" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                  }`}
              >
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${!isLogin ? "max-h-24 opacity-100 mb-0" : "max-h-0 opacity-0 -mb-5"}`}
              >
                {!isLogin && (
                  <div className="relative">
                    <div className="absolute top-1/2 left-5 -translate-y-1/2 text-slate-500 pointer-events-none transition-colors duration-300 peer-focus:text-purple-500">
                      <User size={20} />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-4 pl-14 text-white font-sans text-base transition-all duration-300 placeholder:text-white/30 focus:outline-none focus:bg-black/60 focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] peer"
                      placeholder="Full Name"
                    />
                  </div>
                )}
              </div>

              <div className="relative group/input">
                <div className="absolute top-1/2 left-5 -translate-y-1/2 text-slate-500 pointer-events-none transition-colors duration-300 group-focus-within/input:text-purple-500">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-4 pl-14 text-white font-sans text-base transition-all duration-300 placeholder:text-white/30 focus:outline-none focus:bg-black/60 focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                  placeholder="Email Address"
                  required
                />
              </div>

              <div className="relative group/input">
                <div className="absolute top-1/2 left-5 -translate-y-1/2 text-slate-500 pointer-events-none transition-colors duration-300 group-focus-within/input:text-purple-500">
                  <Lock size={20} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pr-4 pl-14 text-white font-sans text-base transition-all duration-300 placeholder:text-white/30 focus:outline-none focus:bg-black/60 focus:border-purple-500 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)]"
                  placeholder="Password"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`mt-4 w-full bg-gradient-to-r from-purple-600 to-blue-600 border border-white/10 border-t-white/20 p-4 rounded-2xl text-white font-sans text-base font-semibold cursor-pointer relative overflow-hidden shadow-[0_10px_25px_-5px_rgba(139,92,246,0.5)] transition-all duration-300 group disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none ${!isLoading ? "hover:-translate-y-0.5 hover:shadow-[0_15px_35px_-5px_rgba(139,92,246,0.6)] active:translate-y-[1px]" : ""}`}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <span className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      {isLogin ? "Authenticating..." : "Creating Account..."}
                    </>
                  ) : (
                    <>
                      {isLogin ? "Sign In" : "Create Account"}
                      <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* SUPABASE OAuth buttons - معلّقة مؤقتاً */}
            {/*
            <div className="relative text-center my-8 before:content-[''] before:absolute before:top-1/2 before:left-0 before:right-0 before:h-px before:bg-white/10">
              <span className="relative bg-[#0a0c13] px-4 text-slate-400 text-sm">Or continue with</span>
            </div>
            <div className="flex gap-4">
              <button onClick={() => handleOAuth("github")} ...>GitHub</button>
              <button onClick={() => handleOAuth("google")} ...>Google</button>
            </div>
            */}

            <p className="text-center mt-8 text-sm text-slate-400">
              {isLogin
                ? "Don't have an account? "
                : "Already have an account? "}
              <a href="#" onClick={toggleMode} className="text-purple-400 font-semibold hover:text-purple-300 hover:underline transition-colors">
                {isLogin ? "Sign up for free" : "Sign in instead"}
              </a>
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes float {
          0% { transform: translateY(0) scale(1); }
          100% { transform: translateY(5%) scale(1.1); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(30px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
