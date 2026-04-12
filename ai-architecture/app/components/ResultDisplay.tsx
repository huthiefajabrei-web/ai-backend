"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ApiResponse } from "../types";

interface ResultDisplayProps {
  currentSessionId?: string | null;
  images: { url: string; perspective: string; isVideo?: boolean; isRegenerated?: boolean; parentUrl?: string; aspectRatio?: string }[];
  loading: boolean;
  resps: Record<string, ApiResponse>;
  /** True when fetching this session's data from DB (e.g. after clicking a session). Show progress in gallery. */
  isSessionDataLoading?: boolean;
  videoDuration?: number;
  setVideoDuration?: (d: number) => void;
  onDownload: (url: string) => void;
  onGenerateVideoFromGallery?: (
    startUrl: string,
    endUrl: string,
    prompt: string,
    duration?: number,
  ) => void;
  onRegenerate?: (
    url: string,
    newPrompt: string,
    perspective: string,
    isVideo: boolean,
    aspectRatio: string,
  ) => void;
  onDelete?: (url: string) => void;
}

export default function ResultDisplay({
  currentSessionId,
  images,
  loading,
  resps,
  isSessionDataLoading = false,
  videoDuration = 5,
  setVideoDuration,
  onDownload,
  onGenerateVideoFromGallery,
  onRegenerate,
  onDelete,
}: ResultDisplayProps) {
  const [fullScreenUrl, setFullScreenUrl] = useState<string | null>(null);
  const [prevImagesProp, setPrevImagesProp] = useState(images);
  type ImageType = { url: string; perspective: string; isVideo?: boolean; isRegenerated?: boolean; parentUrl?: string; aspectRatio?: string };
  const [groupedImages, setGroupedImages] = useState<
    Record<string, ImageType[][]>
  >({});
  const [familyIndices, setFamilyIndices] = useState<Record<string, number>>({});
  const [dragInfo, setDragInfo] = useState<{
    group: string;
    idx: number;
  } | null>(null);

  const [videoCreationMode, setVideoCreationMode] = useState<
    "idle" | "select_start" | "select_end" | "write_prompt"
  >("idle");
  const [videoStartImg, setVideoStartImg] = useState<string | null>(null);
  const [videoEndImg, setVideoEndImg] = useState<string | null>(null);
  const [videoPrompt, setVideoPrompt] = useState<string>(
    "smooth cinematic transition, 8k resolution",
  );
  const [lastVideoEndImageUrl, setLastVideoEndImageUrl] = useState<
    string | null
  >(null);

  const [regenerationTarget, setRegenerationTarget] = useState<{
    url: string;
    perspective: string;
    isVideo: boolean;
    aspectRatio: string;
  } | null>(null);
  const [regenerationPrompt, setRegenerationPrompt] = useState<string>("");

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const [sessionProgress, setSessionProgress] = useState<Record<string, number>>({});
  const progress = currentSessionId ? (sessionProgress[currentSessionId] || 0) : 0;

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    const activeSession = currentSessionId || 'default';

    if (loading) {
      setSessionProgress((prev) => ({
        ...prev,
        [activeSession]: (prev[activeSession] > 0 && prev[activeSession] < 98) ? prev[activeSession] : 1
      }));

      interval = setInterval(() => {
        setSessionProgress((prev) => {
          let current = prev[activeSession] || 1;
          if (current >= 99) {
            current = 99;
          } else {
            const remaining = 99 - current;
            const step = Math.max(0.1, remaining * 0.05);
            current = current + step;
          }
          return { ...prev, [activeSession]: current };
        });
      }, 500);
    } else {
      setSessionProgress(prev => {
        if (!prev[activeSession]) return prev;
        return { ...prev, [activeSession]: 100 };
      });
      const to = setTimeout(() => {
        setSessionProgress(prev => {
          if (prev[activeSession] === 100) return { ...prev, [activeSession]: 0 };
          return prev;
        });
      }, 1000);
      return () => clearTimeout(to);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading, currentSessionId]);

  // Find the root ancestor for any given URL
  const getRootUrl = (url: string, currentPath = new Set<string>()): string => {
    if (currentPath.has(url)) return url;
    currentPath.add(url);
    const img = images.find(i => i.url === url);
    if (img && img.parentUrl && img.parentUrl !== url) {
      return getRootUrl(img.parentUrl, currentPath);
    }
    return url;
  };

  if (images !== prevImagesProp) {
    const next: Record<string, ImageType[][]> = {};

    // Group images by perspective and then by root URL
    const familiesByRoot: Record<string, Record<string, ImageType[]>> = {};
    const rootOrder: Record<string, string[]> = {};

    images.forEach((img) => {
      const p = img.perspective || "Generated Sequence";
      const rootUrl = getRootUrl(img.url);

      if (!familiesByRoot[p]) {
        familiesByRoot[p] = {};
        rootOrder[p] = [];
      }

      if (!familiesByRoot[p][rootUrl]) {
        familiesByRoot[p][rootUrl] = [];
        rootOrder[p].push(rootUrl);
      }

      if (!familiesByRoot[p][rootUrl].some(i => i.url === img.url)) {
        familiesByRoot[p][rootUrl].push(img);
      }
    });

    Object.keys(familiesByRoot).forEach(p => {
      const existingGroups = groupedImages[p] || [];
      const newFamiliesList: ImageType[][] = [];
      const addedRoots = new Set<string>();

      // Preserve old order
      existingGroups.forEach(exFamily => {
        if (exFamily.length > 0) {
          const rootUrl = getRootUrl(exFamily[0].url);
          if (familiesByRoot[p][rootUrl] && !addedRoots.has(rootUrl)) {
            newFamiliesList.push(familiesByRoot[p][rootUrl]);
            addedRoots.add(rootUrl);
          }
        }
      });

      // Append new roots
      rootOrder[p].forEach(rootUrl => {
        if (!addedRoots.has(rootUrl)) {
          newFamiliesList.push(familiesByRoot[p][rootUrl]);
          addedRoots.add(rootUrl);
        }
      });

      next[p] = newFamiliesList;
    });

    setPrevImagesProp(images);
    setGroupedImages(next);
  }

  const handleDragStart = (group: string, idx: number) =>
    setDragInfo({ group, idx });
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (group: string, targetIdx: number) => {
    if (!dragInfo || dragInfo.group !== group) return;
    setGroupedImages((prev) => {
      const next = { ...prev };
      const items = [...next[group]];
      const [item] = items.splice(dragInfo.idx, 1);
      items.splice(targetIdx, 0, item);
      next[group] = items;
      return next;
    });
    setDragInfo(null);
  };

  const handleImageClick = (img: { url: string; isVideo?: boolean }) => {
    if (img.isVideo) return;

    if (videoCreationMode === "select_start") {
      setVideoStartImg(img.url);
      setVideoCreationMode("select_end");
    } else if (videoCreationMode === "select_end") {
      setVideoEndImg(img.url);
      setVideoCreationMode("write_prompt");
    } else {
      setFullScreenUrl(img.url);
    }
  };

  const hasImages = Object.keys(groupedImages).length > 0;
  const isGenerating = loading || (progress > 0 && progress < 100);
  const showSessionDataLoading = isSessionDataLoading && currentSessionId;

  return (
    <section
      className={`h-fit flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)] relative transition-all duration-300 ${isGenerating && !hasImages ? "animate-pulse ring-2 ring-purple-500/30" : ""}`}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2/3 h-2/3 bg-blue-600/10 rounded-full blur-[80px] pointer-events-none" aria-hidden />
      <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0 z-10 backdrop-blur-sm">
        <div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 font-display">
            Output Gallery
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Your generated architecture
          </p>
        </div>
        {hasImages && (
          <button
            className="relative overflow-hidden group bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            onClick={() => {
              if (videoCreationMode !== "idle") {
                setVideoCreationMode("idle");
                setVideoStartImg(null);
                setVideoEndImg(null);
              } else {
                setVideoStartImg(null);
                setVideoEndImg(null);
                const stillInGallery =
                  lastVideoEndImageUrl &&
                  images.some((i) => i.url === lastVideoEndImageUrl);
                if (stillInGallery && lastVideoEndImageUrl) {
                  setVideoStartImg(lastVideoEndImageUrl);
                  setVideoCreationMode("select_end");
                } else {
                  setVideoCreationMode("select_start");
                }
              }
            }}
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
            <span className="relative z-10 flex items-center gap-2">
              {videoCreationMode !== "idle"
                ? "Cancel Video"
                : "🎬 Create Video"}
            </span>
          </button>
        )}
      </div>

      {videoCreationMode !== "idle" && (
        <div className="p-5 bg-emerald-500/10 border-b border-emerald-500/20 flex flex-col gap-4 z-10 backdrop-blur-md">
          {videoCreationMode === "select_start" && (
            <h3 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs">
                1
              </span>
              Select First Image (Start Frame) from gallery below
            </h3>
          )}
          {videoCreationMode === "select_end" && (
            <h3 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs">
                2
              </span>
              Select End Image (Last Frame) from gallery below
            </h3>
          )}

          <div className="flex gap-4 flex-wrap items-center">
            {videoStartImg && (
              <div className="relative shrink-0 group w-20 h-20">
                <Image
                  src={videoStartImg}
                  width={80}
                  height={80}
                  unoptimized
                  className="w-full h-full object-cover rounded-xl border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-transform group-hover:scale-105"
                  alt="Start Frame"
                />
                <button
                  type="button"
                  onClick={() => {
                    setVideoStartImg(null);
                    setVideoCreationMode("select_start");
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-sm shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
                <span className="block text-center text-[10px] text-emerald-400 mt-2 font-bold uppercase tracking-wider">
                  Start
                </span>
              </div>
            )}
            {videoStartImg && videoEndImg && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-500/50"
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            )}
            {videoEndImg && (
              <div className="relative shrink-0 group w-20 h-20">
                <Image
                  src={videoEndImg}
                  width={80}
                  height={80}
                  unoptimized
                  className="w-full h-full object-cover rounded-xl border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-transform group-hover:scale-105"
                  alt="End Frame"
                />
                <button
                  type="button"
                  onClick={() => {
                    setVideoEndImg(null);
                    setVideoCreationMode("select_end");
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-sm shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
                <span className="block text-center text-[10px] text-emerald-400 mt-2 font-bold uppercase tracking-wider">
                  End
                </span>
              </div>
            )}
          </div>

          {videoCreationMode === "write_prompt" && (
            <div className="flex flex-col gap-4 bg-black/30 p-4 rounded-2xl border border-emerald-500/20 shadow-inner">
              <h3 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs">
                  3
                </span>
                Configure Video Journey
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-emerald-500/80 font-semibold">
                    Video Prompt
                  </label>
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="Describe the camera movement and transition..."
                    className="w-full bg-black/40 border border-emerald-500/30 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none"
                    rows={2}
                  />
                </div>

                {setVideoDuration && (
                  <div className="flex flex-col gap-2 min-w-[120px]">
                    <label className="text-xs text-emerald-500/80 font-semibold">
                      Duration
                    </label>
                    <select
                      value={videoDuration}
                      onChange={(e) => setVideoDuration(Number(e.target.value))}
                      className="w-full appearance-none bg-black/40 border border-emerald-500/30 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                    </select>
                  </div>
                )}
              </div>

              <button
                className="mt-2 w-full sm:w-auto self-end bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-[0_10px_20px_rgba(16,185,129,0.3)] text-white font-semibold py-3 px-6 rounded-xl transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                onClick={() => {
                  if (onGenerateVideoFromGallery && videoStartImg) {
                    if (videoEndImg) setLastVideoEndImageUrl(videoEndImg);
                    onGenerateVideoFromGallery(
                      videoStartImg,
                      videoEndImg || "",
                      videoPrompt,
                      videoDuration,
                    );
                    setVideoCreationMode("idle");
                    setVideoStartImg(null);
                    setVideoEndImg(null);
                    setVideoPrompt(
                      "smooth cinematic transition, 8k resolution",
                    );
                  }
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                Generate Custom Video
              </button>
            </div>
          )}
        </div>
      )}

      {regenerationTarget && (
        <div className="p-5 bg-blue-500/10 border-b border-blue-500/20 flex flex-col gap-4 z-10 backdrop-blur-md">
          <div className="flex justify-between items-center">
            <h3 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs">
                ✏️
              </span>
              Regenerate Item
            </h3>
            <button onClick={() => { setRegenerationTarget(null); setRegenerationPrompt(""); }} className="text-slate-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div className="flex gap-4 items-start flex-wrap">
            <div className="relative shrink-0 w-20 h-20">
              {regenerationTarget.isVideo ? (
                <video src={regenerationTarget.url} autoPlay loop muted playsInline className="w-20 h-20 object-cover rounded-xl border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
              ) : (
                <Image
                  src={regenerationTarget.url}
                  width={80}
                  height={80}
                  unoptimized
                  className="w-full h-full object-cover rounded-xl border-2 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                  alt="Target"
                />
              )}
            </div>

            <div className="flex-1 min-w-[250px] flex flex-col gap-2 relative">
              <label className="text-xs text-blue-500/80 font-semibold">New Prompt</label>
              <textarea
                value={regenerationPrompt}
                onChange={(e) => setRegenerationPrompt(e.target.value)}
                placeholder="Enter modified prompt to regenerate this item..."
                className="w-full bg-black/40 border border-blue-500/30 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all resize-none min-h-[60px]"
                rows={2}
              />
              <button
                className="mt-2 w-full sm:w-auto self-end bg-gradient-to-r from-blue-500 to-indigo-600 hover:shadow-[0_10px_20px_rgba(59,130,246,0.3)] text-white font-semibold py-3 px-6 rounded-xl transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 text-sm"
                onClick={() => {
                  if (onRegenerate) {
                    onRegenerate(regenerationTarget.url, regenerationPrompt, regenerationTarget.perspective, regenerationTarget.isVideo, regenerationTarget.aspectRatio);
                    setRegenerationTarget(null);
                    setRegenerationPrompt("");
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                Start Regenerating
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && hasImages && progress > 0 && (
        <div className="p-4 bg-purple-500/10 border-b border-purple-500/20 z-10 backdrop-blur-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-purple-400 text-sm font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              Generation in Progress...
            </h3>
            <span className="text-purple-300 font-bold font-mono bg-purple-500/20 px-2 py-0.5 rounded-md text-xs">
              {Math.floor(progress)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/40 border border-purple-500/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-5 xl:p-6 z-10 relative custom-scrollbar">
        {showSessionDataLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 min-h-[400px]">
            <div className="flex flex-col items-center max-w-md w-full gap-6">
              <div className="w-16 h-16 rounded-full border-2 border-indigo-500/50 border-t-indigo-400 flex items-center justify-center animate-spin">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-200">Loading session data</h3>
                <p className="text-sm text-slate-400 mt-2">Fetching images from database…</p>
              </div>
              <div className="w-full max-w-xs">
                <div className="h-2 bg-black/40 border border-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]" />
                </div>
              </div>
            </div>
          </div>
        ) : hasImages ? (
          <div className="flex flex-col gap-8">
            {Object.entries(groupedImages).map(([perspective, imgs]) => (
              <div key={perspective} className="flex flex-col gap-4">
                <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                  <div className="w-1.5 h-4 bg-gradient-to-b from-purple-500 to-blue-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
                  <h3 className="text-lg font-semibold text-slate-200 tracking-wide">
                    {perspective}
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {imgs.map((family, idx) => {
                    const rootUrl = family[0].url;
                    const rawIdx = familyIndices[rootUrl] !== undefined ? familyIndices[rootUrl] : family.length - 1;
                    const activeIdx = Math.max(0, Math.min(rawIdx, family.length - 1));
                    const img = family[activeIdx];
                    if (!img) return null;

                    const rawAspect = img.aspectRatio === "9:16" ? "9/16" :
                      img.aspectRatio === "1:1" ? "1/1" :
                        img.aspectRatio === "16:9" ? "16/9" :
                          img.aspectRatio === "4:5" ? "4/5" : "4/3";

                    return (
                      <div
                        key={rootUrl + idx}
                        draggable
                        onDragStart={() => handleDragStart(perspective, idx)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(perspective, idx)}
                        className={`group relative w-full rounded-3xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] bg-[#09090b] hover:border-purple-500/50 hover:shadow-[0_12px_40px_rgba(168,85,247,0.3)] transition-all duration-500 cursor-grab active:cursor-grabbing ${openDropdown === img.url ? 'z-50' : 'z-10'}`}
                        style={{ aspectRatio: rawAspect }}
                      >
                        {/* Internal wrapper for Image to hide hover overflow without clipping dropdowns */}
                        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-0">
                          <div className="w-full h-full pointer-events-auto relative">
                            {img.isVideo ? (
                              <video
                                src={img.url}
                                autoPlay
                                loop
                                muted
                                controls
                                playsInline
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full relative"
                                onClick={() => handleImageClick(img)}
                                style={{
                                  cursor: videoCreationMode !== "idle" ? "crosshair" : "zoom-in",
                                }}
                              >
                                <Image
                                  src={img.url}
                                  alt={`Render ${idx + 1}`}
                                  fill
                                  unoptimized
                                  sizes="(max-width: 1024px) 100vw, 50vw"
                                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></div>

                                {videoCreationMode !== "idle" ? (
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500/90 text-white px-4 py-2 rounded-full font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.5)] opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-90 group-hover:scale-100 backdrop-blur-sm border border-emerald-400">
                                    + Select Frame
                                  </div>
                                ) : (
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-50 group-hover:scale-100 backdrop-blur-md border border-white/20 pointer-events-none">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="20"
                                      height="20"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <circle cx="11" cy="11" r="8"></circle>
                                      <line
                                        x1="21"
                                        y1="21"
                                        x2="16.65"
                                        y2="16.65"
                                      ></line>
                                      <line x1="11" y1="8" x2="11" y2="14"></line>
                                      <line x1="8" y1="11" x2="14" y2="11"></line>
                                    </svg>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Top-level overlays ensuring they stay above the picture */}
                        {family.length > 1 && (
                          <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 flex justify-between px-2 z-20 pointer-events-none">
                            <button
                              className={`w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all pointer-events-auto hover:bg-black/80 hover:scale-110 ${activeIdx === 0 ? "opacity-0 invisible" : "opacity-100"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeIdx > 0) {
                                  setFamilyIndices(prev => ({ ...prev, [rootUrl]: activeIdx - 1 }));
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                            <button
                              className={`w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all pointer-events-auto hover:bg-black/80 hover:scale-110 ${activeIdx === family.length - 1 ? "opacity-0 invisible" : "opacity-100"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeIdx < family.length - 1) {
                                  setFamilyIndices(prev => ({ ...prev, [rootUrl]: activeIdx + 1 }));
                                }
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                          </div>
                        )}

                        {family.length > 1 && (
                          <div className="absolute top-3 right-3 z-20 bg-emerald-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.6)] backdrop-blur-sm border border-emerald-400 flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            {activeIdx + 1} / {family.length}
                          </div>
                        )}
                        {img.isRegenerated && (
                          <div className="absolute top-3 left-3 z-20 bg-blue-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] backdrop-blur-sm border border-blue-400 flex items-center gap-1 animate-[fadeIn_0.5s_ease-out] pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                            Regenerated
                          </div>
                        )}

                        <div className="absolute bottom-3 right-3 z-30">
                          <button
                            className={`w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.5)] ${openDropdown === img.url ? 'opacity-100 bg-black/80' : 'opacity-0 group-hover:opacity-100'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdown(openDropdown === img.url ? null : img.url);
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                          </button>

                          {openDropdown === img.url && (
                            <div
                              className="absolute bottom-full right-0 mb-2 w-48 bg-[#0c1118]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-40 animate-[fadeInUp_0.2s_ease-out]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-blue-600/20 transition-all border-b border-white/5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRegenerationTarget({ url: img.url, perspective: perspective, isVideo: !!img.isVideo, aspectRatio: img.aspectRatio || "16:9" });
                                  setRegenerationPrompt("");
                                  setVideoCreationMode('idle');
                                  setOpenDropdown(null);
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21v-5h5" /></svg>
                                Regenerate
                              </button>
                              <button
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-purple-600/20 transition-all border-b border-white/5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDownload(img.url);
                                  setOpenDropdown(null);
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Save HD
                              </button>
                              <button
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onDelete) onDelete(img.url);
                                  setOpenDropdown(null);
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            {isGenerating ? (
              <div className="flex flex-col items-center max-w-sm w-full gap-6">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="absolute inset-x-8 bottom-0 h-4 bg-purple-500/20 rounded-[100%] blur-md"></div>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-0 h-32 border-l-[30px] border-r-[30px] border-b-[100px] border-l-transparent border-r-transparent border-b-purple-500/10 block blur-xl"></div>

                  <div className="relative w-16 h-16 text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="64"
                      height="64"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                      <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">
                    Rendering Masterpiece
                  </h3>
                  <p className="text-sm text-slate-400 mt-2">
                    Processing geometric transformations & lighting...
                  </p>
                </div>

                <div className="w-full">
                  <div className="w-full h-1.5 bg-black/40 border border-white/5 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs font-mono text-purple-300 font-bold">
                    {Math.floor(progress)}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-60">
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-slate-500 mb-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="18"
                      height="18"
                      rx="2"
                      ry="2"
                    ></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-300">
                    Studio Canvas Empty
                  </h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-sm">
                    Configure your settings in the control panel and generate to
                    view your architectural renders here.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {Object.keys(resps).length > 0 && (
        <div className="px-6 pb-4 pt-2 border-t border-white/5 bg-black/20 shrink-0 z-10 w-full">
          <details className="group marker:hidden [&::-webkit-details-marker]:hidden">
            <summary className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-slate-300 transition-colors select-none">
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/5 border border-white/10 group-open:rotate-90 transition-transform">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </span>
              System Logs
              <span className="bg-white/10 px-1.5 rounded-sm font-mono text-[10px]">
                {Object.keys(resps).length}
              </span>
            </summary>
            <div className="mt-3 p-3 bg-black/60 rounded-xl border border-white/10 overflow-x-auto max-h-40 custom-scrollbar">
              <pre className="text-[10px] text-slate-400 font-mono">
                {JSON.stringify(
                  resps,
                  (k, v) =>
                    k === "image_base64" || k === "image_data_url"
                      ? "[BASE64_DATA_OMITTED_FOR_PERFORMANCE]"
                      : v,
                  2,
                )}
              </pre>
            </div>
          </details>
        </div>
      )}

      {typeof document !== "undefined" &&
        fullScreenUrl &&
        createPortal(
          (() => {
            let fsFamily: ImageType[] = [];
            let fsIndex = -1;
            Object.values(groupedImages).forEach(perspectiveGroups => {
              perspectiveGroups.forEach(family => {
                const idx = family.findIndex(img => img.url === fullScreenUrl);
                if (idx !== -1) {
                  fsFamily = family;
                  fsIndex = idx;
                }
              });
            });

            return (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center"
                onClick={() => setFullScreenUrl(null)}
              >
                <div className="absolute inset-0 bg-black/90 backdrop-blur-xl transition-opacity animate-[fadeIn_0.3s]"></div>
                <div
                  className="relative max-w-[95vw] max-h-[95vh] z-10 animate-[zoomIn_0.3s_cubic-bezier(0.16,1,0.3,1)] flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {fsFamily.length > 1 && (
                    <button
                      className={`absolute left-0 md:-left-20 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-md z-20 ${fsIndex === 0 ? "opacity-0 invisible" : "opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fsIndex > 0) {
                          setFullScreenUrl(fsFamily[fsIndex - 1].url);
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                  )}

                  <div className="relative">
                    <button
                      className="absolute -top-12 right-0 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-md z-20"
                      onClick={() => setFullScreenUrl(null)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>

                    {fsFamily.length > 1 && (
                      <div className="absolute top-4 left-4 z-20 bg-emerald-500/90 text-white text-[12px] font-bold px-3 py-1.5 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.6)] backdrop-blur-sm border border-emerald-400 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        {fsIndex + 1} / {fsFamily.length}
                      </div>
                    )}

                    <Image
                      src={fullScreenUrl}
                      alt="High Resolution Render"
                      width={1920}
                      height={1080}
                      unoptimized
                      className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10"
                    />
                  </div>

                  {fsFamily.length > 1 && (
                    <button
                      className={`absolute right-0 md:-right-20 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-md z-20 ${fsIndex === fsFamily.length - 1 ? "opacity-0 invisible" : "opacity-100"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (fsIndex < fsFamily.length - 1) {
                          setFullScreenUrl(fsFamily[fsIndex + 1].url);
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })(),
          document.body,
        )}

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes zoomIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
        @keyframes loading-bar {
          0%, 100% {
            width: 20%;
            margin-left: 0;
          }
          50% {
            width: 80%;
            margin-left: 10%;
          }
        }
      `}</style>
    </section>
  );
}
