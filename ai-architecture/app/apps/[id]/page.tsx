"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Upload, ChevronDown, Sparkles, Home, Wand2, Video, Search, LayoutGrid, Brush, Folder, Coins, ArrowRight, Loader2, X, Download } from "lucide-react";
import Link from "next/link";
import { apiGetMe, MySQLUser } from "@/lib/mysql/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

interface AppData {
  id: string;
  title: string;
  description: string;
  image_url: string;
  category: string;
  action_id: string;
}

export default function AppFeaturePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [appData, setAppData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MySQLUser | null>(null);

  // Generation States
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>("");
  const [referenceImages, setReferenceImages] = useState<{file: File, preview: string}[]>([]);
  const [aspectRatio, setAspectRatio] = useState("match");
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [model, setModel] = useState("gemini-2.5-flash");
  const [lighting, setLighting] = useState("default");
  const [mood, setMood] = useState("default");
  const [customPrompt, setCustomPrompt] = useState("");

  useEffect(() => {
    const fetchAppAndUser = async () => {
      try {
        const u = await apiGetMe();
        if (u) setUser(u);
        const [appRes, heroRes] = await Promise.all([
          fetch(`${API_BASE}/content/apps`).then(r => r.json()).catch(() => ({})),
          fetch(`${API_BASE}/content/hero`).then(r => r.json()).catch(() => ({}))
        ]);
        
        const allItems = [
          ...(appRes.data || []).map((a: any) => ({ ...a, is_hero: false })),
          ...(heroRes.data || []).map((h: any) => ({ ...h, is_hero: true }))
        ];
        const found = allItems.find((a: any) => a.id === id);
        
        if (found) {
          setAppData(found);
        } else {
          // fallback if not found
          setAppData({
            id,
            title: "App Feature",
            description: "Upload an image to transform it using AI.",
            image_url: "https://images.unsplash.com/photo-1628169222588-444a1eb405d4?w=500&q=80",
            category: "Architecture",
            action_id: "generation"
          });
        }
      } catch (err) {
        console.error("Error fetching app:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAppAndUser();
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const url = URL.createObjectURL(selected);
      setFilePreview(url);
    }
  };

  const handleRefFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newRefs = files.map(file => ({
        file,
        preview: URL.createObjectURL(file)
      }));
      setReferenceImages(prev => [...prev, ...newRefs]);
    }
  };

  const handleRemoveRef = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!file) {
      alert("Please upload an image first.");
      return;
    }
    setIsGenerating(true);
    setResultImage(null);
    try {
      const formData = new FormData();
      // Require list of perspective
      formData.append("perspective", appData?.title || "Custom Scene");
      
      let promptMods = [];
      if (lighting !== "default") promptMods.push(`Lighting limit to: ${lighting}`);
      if (mood !== "default") promptMods.push(`Mood vibe: ${mood}`);
      
      let extendedPrompt = `Transform architecture into ${appData?.title || 'new design'}, high quality, 8k resolution, highly detailed`;
      
      // Override or prepend if it's a Hero and user wrote a custom prompt
      if ((appData as any)?.is_hero && customPrompt.trim()) {
        extendedPrompt = `${customPrompt.trim()}, high quality, 8k resolution, highly detailed`;
      }

      if (promptMods.length > 0) extendedPrompt += `. ${promptMods.join(', ')}`;

      formData.append("custom_prompt", extendedPrompt);
      formData.append("denoise", "0.75");
      formData.append("aspect_ratio", aspectRatio === "match" ? "1:1" : aspectRatio);
      formData.append("image_count", "1");
      formData.append("is_video", "false");
      formData.append("model_name", model);
      formData.append("file", file);

      referenceImages.forEach(ref => {
        formData.append("refs", ref.file);
      });

      const token = localStorage.getItem("harch_token");
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (data.job_ids && data.job_ids.length > 0) {
        const jobId = data.job_ids[0];
        const poll = setInterval(async () => {
          const sRes = await fetch(`${API_BASE}/status/${jobId}`);
          const sData = await sRes.json();
          if (sData.status === "COMPLETED") {
            // Extract the image URL or Base64
            const output_val = sData.output_url || sData.result_url || sData.image_url || sData.image_data_url;
            if (output_val) {
              setResultImage(output_val);
            } else if (sData.output && sData.output.images && sData.output.images.length > 0) {
              const firstImg = sData.output.images[0];
              const b64 = firstImg.data || firstImg.b64;
              setResultImage(b64 ? `data:image/png;base64,${b64}` : "");
            } else {
              setResultImage("");
            }
            clearInterval(poll);
            setIsGenerating(false);
            // Decrement local credits roughly
            if (user) setUser({ ...user, credits: Math.max(0, (user.credits || 0) - 1) });
          } else if (sData.status === "FAILED") {
            alert("Generation failed on server.");
            clearInterval(poll);
            setIsGenerating(false);
          }
        }, 3000);
      } else {
        alert("Failed to start generation. Make sure you are logged in and have credits.");
        setIsGenerating(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error generating image.");
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-white">
        <Loader2 className="animate-spin text-teal-500" size={32} />
      </div>
    );
  }

  if (!appData) return null;

  return (
    <div className="min-h-screen bg-[#0e0e11] text-slate-50 font-sans selection:bg-teal-500/30 flex flex-col">
      {/* HEADER BAR */}
      <header className="h-20 border-b border-white/5 bg-[#09090b] flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0 group">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#14b8a6] to-teal-700 p-[1px] shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-transform duration-300 group-hover:scale-105">
              <div className="relative w-full h-full bg-[#040508] rounded-xl flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#logo-grad-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <defs>
                    <linearGradient id="logo-grad-teal" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="100%" stopColor="#0f766e" />
                    </linearGradient>
                  </defs>
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display font-black text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-white/80">H_ARCH</span>
              <span className="text-[9px] text-teal-400 font-bold tracking-[0.2em] uppercase mt-0.5">Studio</span>
            </div>
          </Link>
        </div>

        {/* Center Icons */}
        <div className="hidden md:flex items-center gap-2 bg-[#18181b] px-3 py-2 rounded-2xl border border-white/5 mx-4">
          <button onClick={() => router.push("/")} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Home size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Wand2 size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Video size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Search size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><LayoutGrid size={20} /></button>
          {/* Active Tool visually represented */}
          <button className="p-2.5 text-[#09090b] bg-[#14b8a6] rounded-xl transition-all shadow-md"><Brush size={20} strokeWidth={2.5}/></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Folder size={20} /></button>
        </div>

        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-2 bg-[#18181b] border border-white/5 px-4 py-2 rounded-2xl hidden sm:flex">
            <Coins size={16} className="text-yellow-500" />
            <span className="text-sm font-bold text-white">{user ? (user.credits || 0) : 0}</span>
            <span className="text-zinc-500 cursor-pointer hover:text-white ml-1 font-bold">+</span>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-[#18181b] border border-white/5 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-all">
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white uppercase">
              {user && user.email ? user.email.charAt(0) : "H"}
            </div>
            <span className="text-xs font-semibold text-zinc-300 hidden sm:block">{user ? user.email.split('@')[0] : 'User'}</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto px-6 py-10 custom-scrollbar">
        <div className="max-w-[1600px] mx-auto w-full animate-[fadeInUp_0.4s_ease-out]">

          {/* Page Headers */}
          <div className="mb-10 pl-2">
            <h1 className="text-[2.5rem] font-bold uppercase tracking-wide mb-2 font-display leading-tight">{appData.title.includes('Generation') || appData.title.includes('Feature') ? 'RENDER' : appData.title.toUpperCase()}</h1>
            <p className="text-sm max-w-2xl text-[#a1a1aa] font-medium tracking-wide">
              {(appData.description || "").length > 30 ? appData.description : "Convert architectural 3D models into stunning photorealistic renderings with AI-powered materials, lighting, and environmental context."}
            </p>
          </div>

          {/* Editor Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

            {/* Left Column (Inputs) */}
            <div className="flex flex-col gap-8 lg:col-span-5 xl:col-span-4">
              
              {/* Upload Box */}
              <div className="w-full aspect-[4/3] rounded-[2rem] border-[1.5px] border-dashed border-[#14b8a6]/20 bg-[#121214]/50 hover:bg-[#121214] transition-colors flex flex-col items-center justify-center gap-4 cursor-pointer group px-6 text-center relative overflow-hidden">
                <input type="file" onChange={handleFileChange} accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                {filePreview ? (
                  <img src={filePreview} alt="Upload Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                ) : null}
                <div className="relative z-0 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-transparent flex items-center justify-center border border-[#ececf1] text-[#ececf1] group-hover:text-teal-400 group-hover:border-teal-400 group-hover:-translate-y-1 transition-all">
                    <Upload size={20} strokeWidth={2} />
                  </div>
                  <div className="mt-2">
                    <h3 className={`text-sm tracking-widest font-bold text-[#ececf1] mb-1.5 ${filePreview ? 'drop-shadow-lg' : ''}`}>{file ? file.name : "UPLOAD IMAGE OR DRAG & DROP"}</h3>
                    <p className={`text-xs font-semibold ${filePreview ? 'text-white drop-shadow-md' : 'text-zinc-500'}`}>PNG, JPG & JPEG (Up To 30MB)</p>
                  </div>
                </div>
              </div>

              {/* Form Controls */}
              <div className="flex flex-col gap-5">
                
                {/* Optional Reference Box */}
                <div className="flex flex-col gap-2.5 animate-[fadeIn_0.3s_ease-out]">
                  <label className="text-xs font-medium text-[#a1a1aa] tracking-wide flex items-center justify-between">
                    <span>Reference Images</span>
                    <span className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest bg-zinc-800/50 px-2 py-0.5 rounded-md">Optional</span>
                  </label>
                  
                  <div className="flex flex-wrap gap-3">
                    {referenceImages.map((ref, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl border border-[#27272a] overflow-hidden group">
                        <img src={ref.preview} alt={`Ref ${idx+1}`} className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleRemoveRef(idx); }}
                          className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-100"
                        >
                          <X size={12} strokeWidth={3} />
                        </button>
                      </div>
                    ))}

                    <label className={`relative flex items-center justify-center cursor-pointer transition-all border border-dashed rounded-xl group ${referenceImages.length > 0 ? 'w-20 h-20 border-[#27272a] hover:border-teal-500/50 bg-[#111111] hover:bg-[#18181b]' : 'w-full h-24 border-[#27272a] hover:border-teal-500/30 bg-[#111111] hover:bg-[#18181b]'}`}>
                      <input type="file" multiple onChange={handleRefFileChange} accept="image/*" className="hidden" />
                      <div className="flex flex-col items-center justify-center gap-2 text-zinc-500 group-hover:text-teal-400">
                        {referenceImages.length > 0 ? (
                          <div className="w-8 h-8 rounded-full bg-zinc-800/30 flex items-center justify-center text-xl font-light pb-0.5">
                            +
                          </div>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-zinc-800/50 flex items-center justify-center">
                              <Upload size={14} />
                            </div>
                            <span className="text-xs font-semibold tracking-wide">Add Style/Structure Reference</span>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Custom Prompt (Only for Hero sections) */}
                {(appData as any)?.is_hero && (
                  <div className="flex flex-col gap-2.5 animate-[fadeIn_0.3s_ease-out]">
                    <label className="text-xs font-medium text-[#a1a1aa] tracking-wide">Custom Prompt</label>
                    <textarea 
                      value={customPrompt} 
                      onChange={e => setCustomPrompt(e.target.value)}
                      placeholder="Describe the design, aesthetic, and architectural style you want..."
                      className="w-full bg-[#111111] border border-[#27272a] rounded-xl px-4 py-3 text-sm font-semibold text-[#ececf1] focus:outline-none focus:border-teal-500/50 hover:bg-[#18181b] transition-colors resize-none placeholder:text-zinc-600 focus:shadow-[0_0_15px_rgba(20,184,166,0.1)] custom-scrollbar"
                      rows={3}
                    />
                  </div>
                )}

                {/* Model Selection */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium text-[#a1a1aa] tracking-wide">Model Selection</label>
                  <div className="relative group">
                    <select value={model} onChange={e => setModel(e.target.value)} className="w-full appearance-none bg-[#111111] border border-[#27272a] rounded-xl px-4 py-3.5 text-sm font-semibold text-[#ececf1] focus:outline-none focus:border-teal-500/50 hover:bg-[#18181b] transition-colors cursor-pointer pl-10 tracking-wide">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      <option value="nano-banana-pro-preview">Nano Banana Pro (Preview)</option>
                      <option value="gemini-3.1-flash-image-preview">Gemini 3.1 Flash Image</option>
                      <option value="gemini-3-pro-image-preview">Gemini 3.0 Pro Image</option>
                    </select>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Wand2 size={16} className="text-[#f97316]" />
                    </div>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover:text-[#ececf1]" />
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium text-[#a1a1aa] tracking-wide">Aspect Ratio</label>
                  <div className="relative group">
                    <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full appearance-none bg-[#111111] border border-[#27272a] rounded-xl px-4 py-3.5 text-sm font-semibold text-[#ececf1] focus:outline-none focus:border-teal-500/50 hover:bg-[#18181b] transition-colors cursor-pointer pl-10 text-center tracking-wide">
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                      <option value="4:3">4:3</option>
                    </select>
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#a1a1aa] rounded-sm group-hover:border-teal-400 transition-colors pointer-events-none"></div>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover:text-[#ececf1]" />
                  </div>
                </div>

                {/* Lighting Time */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium text-[#a1a1aa] tracking-wide">Lighting Time</label>
                  <div className="relative group">
                    <select value={lighting} onChange={e => setLighting(e.target.value)} className="w-full appearance-none bg-[#111111] border border-[#27272a] rounded-xl px-4 py-3.5 text-sm font-semibold text-[#ececf1] focus:outline-none focus:border-teal-500/50 hover:bg-[#18181b] transition-colors cursor-pointer tracking-wide text-center">
                      <option value="default">Select lighting time</option>
                      <option value="daylight">Daylight</option>
                      <option value="sunset">Sunset / Golden Hour</option>
                      <option value="night">Night Time</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover:text-[#ececf1]" />
                  </div>
                </div>

                {/* Mood */}
                <div className="flex flex-col gap-2.5">
                  <label className="text-xs font-medium text-[#a1a1aa] tracking-wide">Mood</label>
                  <div className="relative group">
                    <select value={mood} onChange={e => setMood(e.target.value)} className="w-full appearance-none bg-[#111111] border border-[#27272a] rounded-xl px-4 py-3.5 text-sm font-semibold text-[#ececf1] focus:outline-none focus:border-teal-500/50 hover:bg-[#18181b] transition-colors cursor-pointer tracking-wide text-center">
                      <option value="default">Select mood</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="warm">Warm & Cozy</option>
                      <option value="dramatic">Dramatic</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover:text-[#ececf1]" />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <div className="mt-2">
                <button disabled={isGenerating} onClick={handleGenerate} className={`w-full py-3.5 rounded-xl font-bold text-[15px] tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg ${isGenerating ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-[#14b8a6] text-white hover:bg-teal-400 hover:shadow-[0_0_25px_rgba(20,184,166,0.3)] hover:-translate-y-0.5'}`}>
                  {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                  {isGenerating ? "GENERATING..." : <>Generate Image <span className="opacity-80 flex items-center gap-1 ml-1"><Coins size={14}/> 38</span></>}
                </button>
              </div>
            </div>

            {/* Right Column (Preview/Demo) */}
            <div className={`lg:col-span-7 xl:col-span-8 bg-[#111111] border ${resultImage ? 'border-[#14b8a6]/50 shadow-[0_0_40px_rgba(20,184,166,0.1)]' : 'border-transparent'} rounded-[2rem] p-6 lg:p-12 flex flex-col items-center justify-center text-center w-full min-h-[600px] xl:min-h-[750px] relative transition-all duration-500`}>

              {resultImage ? (
                // Full Result Wrapper
                <div className="absolute inset-0 w-full h-full p-4 lg:p-6">
                  <div className="w-full h-full relative rounded-3xl overflow-hidden group border border-[#27272a] bg-[#09090b]">
                    <img src={resultImage} alt="Generated Result" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                      <button onClick={() => setIsFullscreen(true)} className="px-8 py-3 bg-[#14b8a6] hover:bg-teal-400 text-[#09090b] rounded-full font-bold transition-transform hover:-translate-y-1 shadow-[0_0_20px_rgba(20,184,166,0.5)]">
                        View Full Size
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center w-full mt-4">
                  {/* Image Preview Mock with Before/After */}
                  <div className="flex items-center justify-center gap-4 mb-4 md:mb-10 w-full max-w-2xl px-4">
                    <div className="w-[45%] aspect-[4/3] rounded-2xl overflow-hidden border-2 border-[#18181b] shadow-2xl relative bg-[#18181b]">
                      <img src={filePreview || "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=500&q=80"} alt="Original" className="w-full h-full object-cover" />
                    </div>
                    
                    <div className="w-8 flex items-center justify-center shrink-0">
                      {isGenerating ? <Loader2 size={24} className="text-[#14b8a6] animate-spin" /> : <ArrowRight size={24} className="text-zinc-600" />}
                    </div>

                    <div className="w-[45%] aspect-[4/3] rounded-2xl overflow-hidden border-2 border-[#18181b] shadow-2xl relative bg-[#18181b] flex items-center justify-center">
                      {isGenerating ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-tr from-[#14b8a6]/20 to-transparent animate-pulse"></div>
                          <Loader2 size={32} className="text-[#14b8a6] animate-spin relative z-10" />
                        </>
                      ) : (
                        <img src="https://images.unsplash.com/photo-1613490908679-b3a5105220fa?w=500&q=80" alt="Result Example" className="w-full h-full object-cover opacity-90" />
                      )}
                    </div>
                  </div>

                  {/* Demo Texts */}
                  <h3 className="text-[1.3rem] font-bold text-white mb-2 tracking-wide font-display">
                    {isGenerating ? "GENERATING MASTERPIECE..." : "Upload an image to get started"}
                  </h3>
                  <p className="text-[15px] font-medium text-[#a1a1aa] tracking-wide">
                    {isGenerating ? "This usually takes between 10 to 30 seconds." : "Your render results will appear here"}
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* Lightbox / Fullscreen Image */}
      {isFullscreen && resultImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center transition-all animate-in fade-in duration-300">
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <button 
              onClick={() => {
                const a = document.createElement("a");
                a.href = resultImage;
                a.download = `harch-app-${Date.now()}.jpg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full p-3 backdrop-blur-md transition-all border border-white/10 flex items-center gap-2 group shadow-lg"
            >
              <Download size={20} className="group-hover:-translate-y-0.5 transition-transform" />
              <span className="text-sm font-semibold pr-1 hidden sm:block">Save Image</span>
            </button>
            <button 
              onClick={() => setIsFullscreen(false)} 
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-full p-3 backdrop-blur-md transition-all border border-red-500/20 group shadow-lg"
            >
              <X size={20} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
          <div className="w-[90vw] h-[85vh] relative max-w-7xl animate-in zoom-in-95 duration-300">
            <img 
              src={resultImage} 
              alt="Generated Fullsize" 
              className="w-full h-full object-contain drop-shadow-2xl rounded-xl" 
            />
          </div>
        </div>
      )}
    </div>
  );
}
