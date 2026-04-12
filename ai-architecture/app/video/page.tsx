"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Video, Plus, Wand2, Clock, Layers, Volume2, Send, Home, Search, LayoutGrid, Brush, Folder, Coins, Loader2, PlaySquare } from "lucide-react";
import Link from "next/link";
import { apiGetMe, MySQLUser } from "@/lib/mysql/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function VideoGenerationPage() {
  const router = useRouter();
  const [user, setUser] = useState<MySQLUser | null>(null);
  
  const [startFile, setStartFile] = useState<File | null>(null);
  const [startPreview, setStartPreview] = useState<string>("");
  const [endFile, setEndFile] = useState<File | null>(null);
  const [endPreview, setEndPreview] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("kling-v3");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState("5");
  const [resolution, setResolution] = useState("720p HD");
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultVideo, setResultVideo] = useState<string | null>(null);
  const [generateAudio, setGenerateAudio] = useState(true);

  useEffect(() => {
    apiGetMe().then((u) => {
      if (u) setUser(u);
    }).catch(console.error);
  }, []);

  const handleStartFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setStartFile(file);
      setStartPreview(URL.createObjectURL(file));
    }
  };

  const handleEndFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEndFile(file);
      setEndPreview(URL.createObjectURL(file));
    }
  };

  const handleGenerate = async () => {
    if (!startFile && !prompt) {
      alert("Please provide a prompt or a start frame.");
      return;
    }
    
    setIsGenerating(true);
    setResultVideo(null);
    try {
      const formData = new FormData();
      formData.append("perspective", "Custom Scene");
      if (prompt.trim()) {
        formData.append("custom_prompt", prompt.trim());
      }
      formData.append("denoise", "0.75");
      formData.append("aspect_ratio", aspectRatio === "auto" ? "16:9" : aspectRatio);
      formData.append("image_count", "1");
      formData.append("is_video", "true");
      formData.append("model_name", model);
      formData.append("duration", duration);
      formData.append("resolution", resolution);

      if (startFile) {
        formData.append("file", startFile);
      }
      if (endFile) {
        formData.append("refs", endFile);
      }

      const token = localStorage.getItem("harch_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json();

      if (data.job_ids && data.job_ids.length > 0) {
        const jobId = data.job_ids[0];
        const poll = setInterval(async () => {
          const sRes = await fetch(`${API_BASE}/status/${jobId}`);
          const sData = await sRes.json();
          if (sData.status === "COMPLETED") {
            const output_val = sData.output_url || sData.result_url || sData.file_url || sData.video_url;
            if (output_val) {
              setResultVideo(output_val);
            }
            clearInterval(poll);
            setIsGenerating(false);
            if (user) setUser({ ...user, credits: Math.max(0, (user.credits || 0) - 1) });
          } else if (sData.status === "FAILED" || sData.status === "TIMEOUT") {
            alert(`Generation failed: ${sData.error || "Unknown error"}`);
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
      alert("Error generating video.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-50 font-sans selection:bg-teal-500/30 flex flex-col">
      {/* HEADER BAR */}
      <header className="h-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-50 sticky top-0">
        <div className="flex items-center gap-6">
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

        <div className="hidden md:flex items-center gap-2 bg-[#18181b] px-3 py-2 rounded-2xl border border-white/5 mx-4">
          <button onClick={() => router.push("/")} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Home size={20} /></button>
          <button onClick={() => router.push("/apps/a1")} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Wand2 size={20} /></button>
          <button className="p-2.5 text-[#09090b] bg-[#14b8a6] rounded-xl transition-all shadow-md"><Video size={20} strokeWidth={2.5}/></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Search size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><LayoutGrid size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Brush size={20} /></button>
          <button className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><Folder size={20} /></button>
        </div>

        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-2 bg-[#18181b] border border-white/5 px-4 py-2 rounded-2xl hidden sm:flex">
            <Coins size={16} className="text-yellow-500" />
            <span className="text-sm font-bold text-white">{user ? (user.credits || 0) : 0}</span>
            <span className="text-zinc-500 cursor-pointer hover:text-white ml-1 font-bold">+</span>
          </div>
          {user ? (
            <div className="px-4 py-2 rounded-2xl bg-[#18181b] border border-white/5 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-all">
              <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                {user.email ? user.email.charAt(0) : "H"}
              </div>
              <span className="text-xs font-semibold text-zinc-300 hidden sm:block">{user.email.split('@')[0]}</span>
            </div>
          ) : (
            <a href="/login" className="px-5 py-2 rounded-full bg-gradient-to-r from-teal-500 to-[#14b8a6] text-white text-sm font-bold shadow-lg shadow-teal-500/20">Login</a>
          )}
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full flex flex-col items-center py-16 px-4">
        <div className="w-full max-w-4xl animate-[fadeInUp_0.4s_ease-out]">
          
          {/* Page Title */}
          <div className="flex items-center justify-center gap-3 mb-10 w-full text-center">
            <Video className="text-[#2dd4bf]" size={42} strokeWidth={2.5} />
            <h1 className="text-[3.5rem] font-bold text-[#2dd4bf] tracking-wider font-display drop-shadow-[0_0_15px_rgba(45,212,191,0.3)]">Video</h1>
          </div>

          {/* Video Generator Card */}
          <div className="bg-[#121214] border border-[#27272a] rounded-[1.5rem] p-6 shadow-2xl w-full flex flex-col">
            
            {/* Top Files Row */}
            <div className="flex flex-col md:flex-row items-start gap-4 mb-6">
              <div className="flex items-center justify-center md:justify-start gap-4 w-full md:w-auto">
                {/* Start Frame */}
                <label className={`w-[100px] h-[100px] md:w-[120px] md:h-[120px] border border-dashed border-[#52525b] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden flex-shrink-0 group ${startPreview ? 'border-transparent border-none bg-black' : ''}`}>
                  <input type="file" onChange={handleStartFile} accept="image/*" className="hidden" />
                  {startPreview ? (
                    <img src={startPreview} alt="Start frame" className="absolute inset-0 w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
                  ) : (
                    <>
                      <Plus size={20} className="text-zinc-500 mb-1" />
                      <span className="text-[10px] sm:text-xs font-bold text-zinc-500 text-center uppercase tracking-widest leading-tight w-full px-2">START FRAME</span>
                    </>
                  )}
                </label>

                {/* End Frame */}
                <label className={`w-[100px] h-[100px] md:w-[120px] md:h-[120px] border border-dashed border-[#52525b] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden flex-shrink-0 group ${endPreview ? 'border-transparent border-none bg-black' : ''}`}>
                  <input type="file" onChange={handleEndFile} accept="image/*" className="hidden" />
                  {endPreview ? (
                    <img src={endPreview} alt="End frame" className="absolute inset-0 w-full h-full object-cover group-hover:opacity-70 transition-opacity" />
                  ) : (
                    <>
                      <Plus size={20} className="text-zinc-500 mb-1" />
                      <span className="text-[10px] sm:text-xs font-bold text-zinc-500 text-center uppercase tracking-widest leading-tight w-full px-2">END FRAME</span>
                    </>
                  )}
                </label>
              </div>

              {/* Prompt Textarea */}
              <textarea 
                placeholder="Describe the motion you want... e.g., 'Slow camera pan with natural lighting'" 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="w-full h-[100px] md:flex-1 md:h-[120px] bg-transparent border border-white/5 md:border-none rounded-xl md:rounded-none outline-none resize-none text-[15px] p-3 md:p-2 text-zinc-300 placeholder:text-zinc-600 custom-scrollbar"
              />
            </div>

            {/* Separator */}
            <div className="h-px bg-white/10 w-full mb-4"></div>

            {/* Bottom Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-y-4">
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Model Selector */}
                <div className="bg-[#18181b] hover:bg-white/5 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors relative">
                  <Wand2 size={15} className="text-[#2dd4bf]" />
                  <span className="text-xs font-bold text-zinc-300">
                    {model === 'kling-v3' ? 'Kling V3' : model === 'kling-v2-6' ? 'Kling V2.6' : model === 'kling-v1-1' ? 'Kling V1.1' : 'Veo 3.1'}
                  </span>
                  <ChevronDown size={14} className="text-zinc-500 ml-1" />
                  <select 
                    value={model} 
                    onChange={e => setModel(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-[#18181b] text-white"
                  >
                    <option value="veo-3.1">Veo 3.1</option>
                    <option value="kling-v3">Kling V3</option>
                    <option value="kling-v2-6">Kling V2.6</option>
                    <option value="kling-v1-1">Kling V1.1</option>
                  </select>
                </div>

                {/* Aspect Ratio / Auto */}
                <div className="bg-[#18181b] hover:bg-white/5 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors relative">
                  <div className="w-3.5 h-3.5 border border-zinc-400 rounded-sm font-mono text-[9px] flex items-center justify-center font-bold text-zinc-400">
                    {aspectRatio === "auto" ? "A" : aspectRatio.split(":")[0]}
                  </div>
                  <span className="text-xs font-bold text-zinc-300">{aspectRatio === "auto" ? "Auto" : aspectRatio}</span>
                  <select 
                    value={aspectRatio} 
                    onChange={e => setAspectRatio(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-[#18181b] text-white"
                  >
                    <option value="auto">Auto</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                  </select>
                </div>

                {/* Duration */}
                <div className="bg-[#18181b] hover:bg-white/5 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors relative">
                  <Clock size={15} className="text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-300">{duration} seconds</span>
                  <select 
                    value={duration} 
                    onChange={e => setDuration(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-[#18181b] text-white"
                  >
                    <option value="5">5 seconds</option>
                    <option value="8">8 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>

                {/* Resolution */}
                <div className="bg-[#18181b] hover:bg-white/5 border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors relative">
                  <Layers size={15} className="text-zinc-400" />
                  <span className="text-xs font-bold text-zinc-300">{resolution}</span>
                  <select 
                    value={resolution} 
                    onChange={e => setResolution(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-[#18181b] text-white"
                  >
                    <option value="720p HD">720p HD</option>
                    <option value="1080p FHD">1080p FHD</option>
                    <option value="4K UHD">4K UHD</option>
                  </select>
                </div>

                {/* Audio Toggle */}
                <button 
                  onClick={() => setGenerateAudio(!generateAudio)}
                  className={`border border-white/5 rounded-full px-4 py-2 flex items-center gap-2 transition-colors duration-300 ${generateAudio ? 'bg-[#134e4a] text-[#2dd4bf]' : 'bg-[#18181b] text-zinc-400 hover:bg-white/5 hover:text-zinc-300'}`}
                >
                  <Volume2 size={15} className={generateAudio ? 'text-[#2dd4bf]' : 'text-zinc-400'} />
                  <span className="text-xs font-bold">Generate Audio</span>
                </button>
              </div>

              {/* Send / Generate Button */}
              <button 
                onClick={handleGenerate} 
                disabled={isGenerating}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${isGenerating ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-[#2dd4bf] text-[#09090b] hover:bg-teal-300 hover:scale-105 shadow-[0_0_15px_rgba(45,212,191,0.5)]'}`}
              >
                {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="-ml-1 mt-0.5" />}
              </button>
            </div>
          </div>

          {/* Results Area (Full Width Output) */}
          {(isGenerating || resultVideo) && (
            <div className="mt-12 bg-[#121214] border border-[#27272a] rounded-[1.5rem] p-6 shadow-2xl w-full flex flex-col items-center justify-center min-h-[400px] overflow-hidden relative">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 bg-[#2dd4bf] blur-[30px] opacity-20 rounded-full animate-pulse"></div>
                    <Loader2 size={48} className="text-[#2dd4bf] animate-spin relative z-10" />
                  </div>
                  <h3 className="text-xl font-bold font-display text-white tracking-wide mb-2">Generating Motion...</h3>
                  <p className="text-sm text-zinc-400">Taking up to 60-120 seconds for processing and rendering highly-detailed video.</p>
                </div>
              ) : resultVideo ? (
                <div className="w-full h-full relative rounded-xl overflow-hidden group">
                  <video 
                    src={resultVideo} 
                    className="w-full h-full object-contain rounded-xl max-h-[600px] bg-black" 
                    controls 
                    autoPlay 
                    loop 
                    muted 
                  />
                </div>
              ) : null}
            </div>
          )}

        </div>
      </main>
      
      {/* Icon components for ChevronDown, imported from lucide */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Ensure ChevronDown is included if not in lucide import
import { ChevronDown } from "lucide-react";
