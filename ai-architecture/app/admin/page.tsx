"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, Layout, Settings, Plus, Pencil, Trash2, Save, X, Activity, CreditCard, CheckCircle2, Search, ArrowLeft, Coins, Image as ImageIcon, Upload, MessageSquare } from "lucide-react";

// --- Types ---
type Stats = { users: number; sessions: number };
type ToolData = { id: string; title: string; description: string; icon: string; action_id: string; created_at?: string };
type AppData = { id: string; title: string; description: string; image_url: string; category: string; action_id: string; created_at?: string };
type PlanData = { id: string; name: string; price: number | string; credits: number | string; period: string; features: string[]; is_popular: number; created_at?: string };
type HeroData = { id: string; title: string; image_url: string; created_at?: string };
type PromptData = { id: string; title: string; prompt_text: string; type: string; created_at?: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("harch_token");
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Add json content type if body is string
  if (typeof options.body === "string") headers.set("Content-Type", "application/json");
  return fetch(url, { ...options, headers });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "hero" | "tools" | "apps" | "plans" | "prompts">("overview");
  const [loading, setLoading] = useState(true);
  
  // Data
  const [stats, setStats] = useState<Stats>({ users: 0, sessions: 0 });
  const [heroes, setHeroes] = useState<HeroData[]>([]);
  const [tools, setTools] = useState<ToolData[]>([]);
  const [apps, setApps] = useState<AppData[]>([]);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [promptSearch, setPromptSearch] = useState("");

  // Modals for add/edit
  const [editHero, setEditHero] = useState<HeroData | null>(null);
  const [editTool, setEditTool] = useState<ToolData | null>(null);
  const [editApp, setEditApp] = useState<AppData | null>(null);
  const [editPlan, setEditPlan] = useState<PlanData | null>(null);
  const [editPrompt, setEditPrompt] = useState<PromptData | null>(null);

  useEffect(() => {
    // Basic auth check
    const token = localStorage.getItem("harch_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("harch_token");
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, heroesRes, toolsRes, appsRes, plansRes, promptsRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`, { headers }).then(r => r.json()),
        fetch(`${API_URL}/content/hero`).then(r => r.json()),
        fetch(`${API_URL}/content/tools`).then(r => r.json()),
        fetch(`${API_URL}/content/apps`).then(r => r.json()),
        fetch(`${API_URL}/content/plans`).then(r => r.json()),
        fetch(`${API_URL}/content/prompts`).then(r => r.json()),
      ]);

      if (statsRes.ok) setStats(statsRes.stats);
      if (heroesRes.ok) setHeroes(heroesRes.data);
      if (toolsRes.ok) setTools(toolsRes.data);
      if (appsRes.ok) setApps(appsRes.data);
      if (plansRes.ok) setPlans(plansRes.data);
      if (promptsRes.ok) setPrompts(promptsRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers ---
  const handleSaveHero = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHero) return;
    try {
      await fetchWithAuth(`${API_URL}/content/hero`, { method: "POST", body: JSON.stringify({ id: editHero.id || null, data: editHero }) });
      setEditHero(null);
      fetchAllData();
    } catch { alert("Error saving hero image"); }
  };

  const handleFileUpload = async <T,>(e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<T | null>>, field: keyof T) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const token = localStorage.getItem("harch_token");
      const res = await fetch(`${API_URL}/admin/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (data.ok && data.url) setter((prev) => prev ? { ...prev, [field]: data.url } : null);
      else alert("Upload failed");
    } catch {
      alert("Upload failed");
    }
  };

  const handleSaveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTool) return;
    try {
      await fetchWithAuth(`${API_URL}/content/tools`, { method: "POST", body: JSON.stringify({ id: editTool.id || null, data: editTool }) });
      setEditTool(null);
      fetchAllData();
    } catch { alert("Error saving tool"); }
  };

  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editApp) return;
    try {
      await fetchWithAuth(`${API_URL}/content/apps`, { method: "POST", body: JSON.stringify({ id: editApp.id || null, data: editApp }) });
      setEditApp(null);
      fetchAllData();
    } catch { alert("Error saving app"); }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPlan) return;
    try {
      await fetchWithAuth(`${API_URL}/content/plans`, { method: "POST", body: JSON.stringify({ id: editPlan.id || null, data: editPlan }) });
      setEditPlan(null);
      fetchAllData();
    } catch { alert("Error saving plan"); }
  };

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPrompt) return;
    try {
      await fetchWithAuth(`${API_URL}/content/prompts`, { method: "POST", body: JSON.stringify({ id: editPrompt.id || null, data: editPrompt }) });
      setEditPrompt(null);
      fetchAllData();
    } catch { alert("Error saving prompt"); }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await fetchWithAuth(`${API_URL}/content/${type}/${id}`, { method: "DELETE" });
      fetchAllData();
    } catch { alert("Error deleting item"); }
  };

  if (loading && stats.users === 0) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-purple-500" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 font-sans selection:bg-purple-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")} className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                <Settings size={16} className="text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight">Admin Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span> System Online
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-start gap-8 flex-col lg:flex-row">
        {/* Sidebar Nav */}
        <nav className="w-full lg:w-64 flex flex-col gap-2 shrink-0">
          {[
            { id: "overview", icon: Activity, label: "Overview" },
            { id: "hero", icon: ImageIcon, label: "Hero Slider" },
            { id: "tools", icon: Layout, label: "Explore Tools" },
            { id: "apps", icon: Search, label: "H_ARCH Apps" },
            { id: "plans", icon: CreditCard, label: "Pricing Plans" },
            { id: "prompts", icon: MessageSquare, label: "AI Prompts" },
          ].map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as "overview" | "hero" | "tools" | "apps" | "plans" | "prompts")}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive 
                    ? "bg-white/10 text-white shadow-inner" 
                    : "text-zinc-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Icon size={18} className={isActive ? "text-purple-400" : ""} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content Area */}
        <div className="flex-1 w-full min-w-0">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <h2 className="text-2xl font-bold font-display">System Overview</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#18181b] border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:border-white/10 transition-colors">
                  <div>
                    <h3 className="text-zinc-400 text-sm font-medium mb-1">Total Registered Users</h3>
                    <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">{stats.users}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 transition-transform">
                    <Users size={24} className="text-indigo-400" />
                  </div>
                </div>
                <div className="bg-[#18181b] border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:border-white/10 transition-colors">
                  <div>
                    <h3 className="text-zinc-400 text-sm font-medium mb-1">Total Generations & Sessions</h3>
                    <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">{stats.sessions}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
                    <Layout size={24} className="text-purple-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HERO TAB */}
          {activeTab === "hero" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold font-display">Manage Hero Slider</h2>
                <button onClick={() => setEditHero({ id: "", title: "New Slide", image_url: "" })} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">
                  <Plus size={16} /> Add Image
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {heroes.map((h) => (
                  <div key={h.id} className="bg-[#18181b] border border-white/5 rounded-xl overflow-hidden group flex flex-col">
                    <div className="h-40 w-full relative overflow-hidden">
                      <img src={h.image_url || 'https://via.placeholder.com/300x150?text=No+Image'} alt={h.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-x-0 top-0 p-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/60 to-transparent">
                        <button onClick={() => setEditHero(h)} className="p-1.5 bg-black/50 hover:bg-indigo-500 text-white rounded-md backdrop-blur-sm transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete('hero', h.id)} className="p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-md backdrop-blur-sm transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="p-4 bg-[#18181b]">
                      <h3 className="font-bold text-white text-base truncate">{h.title}</h3>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOOLS TAB */}
          {activeTab === "tools" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold font-display">Manage Tools</h2>
                <button onClick={() => setEditTool({ id: "", title: "New Tool", description: "", icon: "Wand2", action_id: "generation" })} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">
                  <Plus size={16} /> Add Tool
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tools.map((t) => (
                  <div key={t.id} className="bg-[#18181b] border border-white/5 rounded-xl p-5 flex flex-col gap-3 group relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                          <span className="text-purple-400 text-xs font-bold">{t.icon}</span>
                        </div>
                        <div>
                          <h3 className="font-bold text-white">{t.title}</h3>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{t.action_id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditTool(t)} className="p-1.5 bg-white/5 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-400 rounded-md transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete('tools', t.id)} className="p-1.5 bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-md transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* APPS TAB */}
          {activeTab === "apps" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold font-display">Manage H_ARCH Apps</h2>
                <button onClick={() => setEditApp({ id: "", title: "New App", description: "", image_url: "", category: "Architecture", action_id: "generation" })} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">
                  <Plus size={16} /> Add App
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {apps.map((a) => (
                  <div key={a.id} className="bg-[#18181b] border border-white/5 rounded-xl overflow-hidden group flex flex-col">
                    <div className="h-32 w-full relative overflow-hidden">
                      <img src={a.image_url || 'https://via.placeholder.com/300x150?text=No+Image'} alt={a.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-x-0 top-0 p-2 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-b from-black/60 to-transparent">
                        <button onClick={() => setEditApp(a)} className="p-1.5 bg-black/50 hover:bg-indigo-500 text-white rounded-md backdrop-blur-sm transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete('apps', a.id)} className="p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-md backdrop-blur-sm transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col flex-1">
                      <span className="text-[10px] text-purple-400 uppercase tracking-wider font-bold mb-1">{a.category} • {a.action_id}</span>
                      <h3 className="font-bold text-white text-base mb-1">{a.title}</h3>
                      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PLANS TAB */}
          {activeTab === "plans" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold font-display">Manage Pricing Plans</h2>
                <button onClick={() => setEditPlan({ id: "", name: "New Plan", price: 0, credits: 0, period: "mo", features: [], is_popular: 0 })} className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">
                  <Plus size={16} /> Add Plan
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {plans.map((p) => (
                  <div key={p.id} className={`bg-[#18181b] border ${p.is_popular ? 'border-purple-500' : 'border-white/5'} rounded-2xl p-6 flex flex-col relative group hover:-translate-y-1 transition-transform`}>
                    {p.is_popular ? (
                      <div className="absolute top-0 right-6 -translate-y-1/2 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg">
                        Most Popular
                      </div>
                    ) : null}
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold">{p.name}</h3>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditPlan(p)} className="p-1.5 bg-white/5 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-400 rounded-md transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete('plans', p.id)} className="p-1.5 bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-md transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="mb-4">
                      <span className="text-3xl font-black">${p.price}</span>
                      <span className="text-zinc-500 text-sm">/{p.period}</span>
                    </div>
                    <div className="bg-[#121214] border border-white/5 rounded-xl p-3 mb-6 flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-300">Credits Included</span>
                      <span className="font-bold text-emerald-400">{p.credits} <Coins size={14} className="inline opacity-70 mb-0.5" /></span>
                    </div>
                    <ul className="flex flex-col gap-3 flex-1 mb-6">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
                          <CheckCircle2 size={16} className="text-purple-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PROMPTS TAB */}
          {activeTab === "prompts" && (
            <div className="space-y-6 animate-[fadeInUp_0.4s_ease-out]">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-bold font-display w-full sm:w-auto">Manage AI Prompts</h2>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                         <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                         <input 
                            type="text"
                            placeholder="Search prompts..." 
                            value={promptSearch}
                            onChange={(e) => setPromptSearch(e.target.value)}
                            className="bg-[#121214] border border-white/10 rounded-xl pl-9 pr-4 py-2 w-full text-sm text-white focus:border-purple-500 outline-none transition-colors"
                         />
                    </div>
                    <button onClick={() => setEditPrompt({ id: "", title: "New Prompt", prompt_text: "", type: "Exterior" })} className="flex shrink-0 items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">
                      <Plus size={16} /> Add Prompt
                    </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {prompts.filter(p => !promptSearch || p.title.toLowerCase().includes(promptSearch.toLowerCase()) || p.type.toLowerCase().includes(promptSearch.toLowerCase()) || p.prompt_text.toLowerCase().includes(promptSearch.toLowerCase())).map((p) => (
                  <div key={p.id} className="bg-[#18181b] border border-white/5 rounded-xl p-5 flex flex-col gap-3 group relative overflow-hidden">
                     <div className="flex items-start justify-between">
                       <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.type === 'Exterior' ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'}`}>
                           <MessageSquare size={18} />
                         </div>
                         <div>
                           <h3 className="font-bold text-white">{p.title}</h3>
                           <span className={`text-[10px] uppercase tracking-widest font-bold ${p.type === 'Exterior' ? 'text-blue-400' : 'text-rose-400'}`}>{p.type}</span>
                         </div>
                       </div>
                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => setEditPrompt(p)} className="p-1.5 bg-white/5 hover:bg-indigo-500/20 text-zinc-400 hover:text-indigo-400 rounded-md transition-colors"><Pencil size={14} /></button>
                         <button onClick={() => handleDelete('prompts', p.id)} className="p-1.5 bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-md transition-colors"><Trash2 size={14} /></button>
                       </div>
                     </div>
                     <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">{p.prompt_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- MODALS --- */}
      {/* Hero Modal */}
      {editHero && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editHero.id ? "Edit Slide" : "New Slide"}</h3>
              <button onClick={() => setEditHero(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveHero} className="p-6 flex flex-col gap-4">
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Title</label><input required value={editHero.title} onChange={e=>setEditHero({...editHero, title: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider flex justify-between">
                  <span>Image URL</span>
                  <label className="cursor-pointer text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Upload size={12}/>Upload<input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, setEditHero, "image_url")}/></label>
                </label>
                <input required value={editHero.image_url} onChange={e=>setEditHero({...editHero, image_url: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" />
                {editHero.image_url && <div className="mt-3 aspect-video bg-[#121214] border border-white/5 rounded-xl overflow-hidden"><img src={editHero.image_url} className="w-full h-full object-cover"/></div>}
              </div>
              <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={()=>setEditHero(null)} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button><button type="submit" className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-sm font-semibold text-white hover:opacity-90 shadow-lg flex items-center gap-2"><Save size={16} /> Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Tool Modal */}
      {editTool && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editTool.id ? "Edit Tool" : "New Tool"}</h3>
              <button onClick={() => setEditTool(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveTool} className="p-6 flex flex-col gap-4">
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Title</label><input required value={editTool.title} onChange={e=>setEditTool({...editTool, title: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Description</label><textarea required rows={3} value={editTool.description} onChange={e=>setEditTool({...editTool, description: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Icon (Lucide name)</label><input required value={editTool.icon} onChange={e=>setEditTool({...editTool, icon: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Action ID</label><input required value={editTool.action_id} onChange={e=>setEditTool({...editTool, action_id: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              </div>
              <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={()=>setEditTool(null)} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button><button type="submit" className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-sm font-semibold text-white hover:opacity-90 shadow-lg flex items-center gap-2"><Save size={16} /> Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* App Modal */}
      {editApp && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editApp.id ? "Edit App" : "New App"}</h3>
              <button onClick={() => setEditApp(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveApp} className="p-6 flex flex-col gap-4">
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Title</label><input required value={editApp.title} onChange={e=>setEditApp({...editApp, title: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider flex justify-between">
                  <span>Image URL</span>
                  <label className="cursor-pointer text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Upload size={12}/>Upload<input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, setEditApp, "image_url")}/></label>
                </label>
                <input required value={editApp.image_url} onChange={e=>setEditApp({...editApp, image_url: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" />
              </div>
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Description</label><textarea required rows={2} value={editApp.description} onChange={e=>setEditApp({...editApp, description: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors resize-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Category</label><input required value={editApp.category} onChange={e=>setEditApp({...editApp, category: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Action ID</label><input required value={editApp.action_id} onChange={e=>setEditApp({...editApp, action_id: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              </div>
              <div className="pt-4 flex justify-end gap-3"><button type="button" onClick={()=>setEditApp(null)} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button><button type="submit" className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-sm font-semibold text-white hover:opacity-90 shadow-lg flex items-center gap-2"><Save size={16} /> Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Plan Modal */}
      {editPlan && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-white/10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editPlan.id ? "Edit Plan" : "New Plan"}</h3>
              <button onClick={() => setEditPlan(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={handleSavePlan} className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Plan Name</label><input required value={editPlan.name} onChange={e=>setEditPlan({...editPlan, name: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
                <div>
                  <label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Highlight Status</label>
                  <select value={editPlan.is_popular} onChange={e=>setEditPlan({...editPlan, is_popular: parseInt(e.target.value)})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors">
                    <option value={0}>Standard</option>
                    <option value={1}>Most Popular</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Price ($)</label><input type="number" step="0.01" required value={editPlan.price} onChange={e=>setEditPlan({...editPlan, price: e.target.value === "" ? "" : parseFloat(e.target.value)})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Credits</label><input type="number" required value={editPlan.credits} onChange={e=>setEditPlan({...editPlan, credits: e.target.value === "" ? "" : parseInt(e.target.value)})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
                <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Period</label><input required value={editPlan.period} onChange={e=>setEditPlan({...editPlan, period: e.target.value})} placeholder="mo" className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" /></div>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider flex justify-between">
                  <span>Features (List)</span>
                  <button type="button" onClick={() => setEditPlan({...editPlan, features: [...editPlan.features, "New Feature"]})} className="text-indigo-400 hover:text-indigo-300">Add Feature</button>
                </label>
                <div className="space-y-2">
                  {editPlan.features.length === 0 && <p className="text-xs text-zinc-500 italic">No features yet. Add one!</p>}
                  {editPlan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={f} onChange={e => {
                        const newF = [...editPlan.features]; newF[i] = e.target.value; setEditPlan({...editPlan, features: newF});
                      }} className="flex-1 bg-[#121214] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-purple-500 outline-none" />
                      <button type="button" onClick={() => {
                        const newF = [...editPlan.features]; newF.splice(i, 1); setEditPlan({...editPlan, features: newF});
                      }} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-white/5 pt-4"><button type="button" onClick={()=>setEditPlan(null)} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button><button type="submit" className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-sm font-semibold text-white hover:opacity-90 shadow-lg flex items-center gap-2"><Save size={16} /> Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {editPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-lg">{editPrompt.id ? "Edit Prompt" : "New Prompt"}</h3>
              <button onClick={() => setEditPrompt(null)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={handleSavePrompt} className="p-6 flex flex-col gap-4">
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Title (UI Name)</label><input required value={editPrompt.title} onChange={e=>setEditPrompt({...editPrompt, title: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors" placeholder="e.g. Living Room Design" /></div>
              <div>
                 <label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Type</label>
                 <select required value={editPrompt.type} onChange={e=>setEditPrompt({...editPrompt, type: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors">
                    <option value="Exterior">Exterior</option>
                    <option value="Interior">Interior</option>
                 </select>
              </div>
              <div><label className="text-xs font-semibold text-zinc-500 mb-1 block uppercase tracking-wider">Prompt Context (Backend)</label><textarea required rows={4} value={editPrompt.prompt_text} onChange={e=>setEditPrompt({...editPrompt, prompt_text: e.target.value})} className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-purple-500 outline-none transition-colors resize-none" placeholder="e.g. beautiful cozy interior, 8k..." /></div>
              <div className="pt-4 flex justify-end gap-3 border-t border-white/5 pt-4"><button type="button" onClick={()=>setEditPrompt(null)} className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button><button type="submit" className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl text-sm font-semibold text-white hover:opacity-90 shadow-lg flex items-center gap-2"><Save size={16} /> Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
