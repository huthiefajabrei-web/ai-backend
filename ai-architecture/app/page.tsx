"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Server URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

import ControlPanel, { SelectedPerspective } from "@/app/components/ControlPanel";
import ResultDisplay from "@/app/components/ResultDisplay";
import { ApiResponse, ApiOk, UserSession } from "@/app/types";

// ── Backend Auth/API client ───────────────────────────────────────────────────
import {
  MySQLUser,
  apiGetMe,
  apiLogout,
  apiGetSessions,
  apiCreateSession,
  apiUpdateSession,
  apiDeleteSession,
  getToken,
  getStoredUser,
  setStoredUser,
  removeToken,
} from "@/lib/mysql/client";

// ── SUPABASE IMPORTS - معلّقة مؤقتاً (لم تُحذف) ────────────────────────────
/*
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
*/

import { Plus, MessageSquare, Trash2, Loader2, Copy, MoreVertical, Pencil, PanelLeftClose, PanelLeft, Home as HomeIcon, Wand2, Video, Search, LayoutGrid, Brush, Folder, Coins, ArrowRight, Sparkles, ZoomIn, CheckCircle2, Menu, X, Layers } from "lucide-react";

// Map string icon names to Lucide icons
const IconMap: Record<string, any> = { Wand2, Video, ZoomIn, Search, LayoutGrid, Brush, Folder, Coins, ArrowRight, Sparkles, CheckCircle2 };

export default function Home() {
  const router = useRouter();
  // SUPABASE: const [user, setUser] = useState<User | null>(null);
  const [user, setUser] = useState<MySQLUser | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [refs, setRefs] = useState<File[]>([]);
  const [refPreviewUrls, setRefPreviewUrls] = useState<string[]>([]);
  const [selectedPerspectives, setSelectedPerspectives] = useState<
    SelectedPerspective[]
  >([
    {
      perspective: "Photorealistic Exterior",
      imageCount: 1,
      aspectRatio: "16:9",
    },
  ]);
  const [customPrompt, setCustomPrompt] = useState<string>(
    "modern architectural masterpiece, twilight lighting, ambient occlusion, global illumination, highly detailed",
  );
  const [denoise, setDenoise] = useState<number>(0.75);
  const [mode, setMode] = useState<"image" | "video">("image");
  const [activeApp, setActiveApp] = useState<string | null>(null);

  const [dbHero, setDbHero] = useState<any[]>([]);
  const [dbTools, setDbTools] = useState<any[]>([]);
  const [dbApps, setDbApps] = useState<any[]>([]);
  const [dbPlans, setDbPlans] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/content/hero`).then((r) => r.json()).catch(() => ({})),
      fetch(`${API_BASE}/content/tools`).then((r) => r.json()).catch(() => ({})),
      fetch(`${API_BASE}/content/apps`).then((r) => r.json()).catch(() => ({})),
      fetch(`${API_BASE}/content/plans`).then((r) => r.json()).catch(() => ({}))
    ]).then(([hRes, tRes, aRes, pRes]) => {
      if (hRes?.data) setDbHero(hRes.data);
      if (tRes?.data) setDbTools(tRes.data);
      if (aRes?.data) setDbApps(aRes.data);
      if (pRes?.data) setDbPlans(pRes.data);
    });
  }, []);

  const [loading, setLoading] = useState(false);
  const [resps, setResps] = useState<Record<string, ApiResponse>>({});

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [historySidebarOpen, setHistorySidebarOpen] = useState(true);
  // Per-session loading indicators (fetch in progress)
  const [sessionLoadingIds, setSessionLoadingIds] = useState<Set<string>>(new Set());

  const pollingIntervalsRef = React.useRef<Record<string, NodeJS.Timeout>>({});
  const pollFunctionsRef = React.useRef<Record<string, () => void>>({});
  const currentSessionIdRef = React.useRef(currentSessionId);
  const respsSessionIdRef = React.useRef<string | null>(null);
  // Tracks sessions whose resps have been successfully loaded from DB (no re-fetch needed)
  const fetchedSessionIdsRef = React.useRef<Set<string>>(new Set());
  // Always-fresh mirror of sessions state (avoids stale closures in async functions)
  const sessionsRef = React.useRef<UserSession[]>([]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);


  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState === "visible") {
        Object.values(pollFunctionsRef.current).forEach(poll => poll());
      }
    };
    document.addEventListener("visibilitychange", handleVisChange);
    return () => document.removeEventListener("visibilitychange", handleVisChange);
  }, []);

  const pendingJobIdsRef = React.useRef<Record<string, string[]>>({});

  const startPolling = (sid: string, pendingJobIds: string[]) => {
    // Merge new job IDs with any still-pending ones from a previous generation run on this session
    const existingPendingIds = pendingJobIdsRef.current[sid] || [];
    const mergedJobIds = Array.from(new Set([...existingPendingIds, ...pendingJobIds]));
    pendingJobIdsRef.current[sid] = mergedJobIds;

    if (pollingIntervalsRef.current[sid]) {
      clearInterval(pollingIntervalsRef.current[sid]);
    }

    const pollOnce = async () => {
      // Use the latest merged IDs (may have grown if another generation started)
      const jobIds = pendingJobIdsRef.current[sid] || [];
      if (jobIds.length === 0) return;
      try {
        const updates = await Promise.all(
          jobIds.map(async (jid) => {
            const statusRes = await fetch(`${API_BASE}/status/${jid}`);
            return await statusRes.json();
          })
        );

        let allDone = true;
        updates.forEach((data) => {
          if (data && !['COMPLETED', 'FAILED', 'TIMEOUT'].includes((data as ApiOk).status || '')) {
            allDone = false;
          }
        });

        let latestSessionResps: Record<string, ApiResponse> | null = null;
        setSessions((prev) => prev.map(s => {
          if (s.id === sid) {
            const nextResps = { ...s.resps };
            updates.forEach((data, index) => {
              const jid = jobIds[index];
              if (jid && data !== null) {
                nextResps[jid] = { ...nextResps[jid], ...(data as ApiResponse) };
              }
            });
            latestSessionResps = nextResps;
            return { ...s, resps: nextResps };
          }
          return s;
        }));

        if (currentSessionIdRef.current === sid) {
          setResps((prev) => {
            const next = { ...prev };
            updates.forEach((data, index) => {
              const jid = jobIds[index];
              if (jid && data !== null) {
                next[jid] = { ...next[jid], ...(data as ApiResponse) };
              }
            });
            return next;
          });
        }

        if (allDone) {
          clearInterval(pollingIntervalsRef.current[sid]);
          delete pollingIntervalsRef.current[sid];
          delete pollFunctionsRef.current[sid];
          delete pendingJobIdsRef.current[sid];
          if (currentSessionIdRef.current === sid) setLoading(false);

          if (latestSessionResps) {
            // Save to backend DB session store
            // SUPABASE WAS: const supabase = createClient(); supabase.from("user_sessions").update({ resps: ... }).eq("id", sid).then();
            apiUpdateSession(sid, { resps: stripBase64ForSave(latestSessionResps) as Record<string, unknown> }).catch(() => { });
          }
        }
      } catch { }
    };

    pollOnce();
    pollFunctionsRef.current[sid] = pollOnce;
    pollingIntervalsRef.current[sid] = setInterval(pollOnce, 3000);
  };

  // ── Auth initialization (MySQL replaces Supabase) ─────────────────────────
  // SUPABASE WAS:
  // useEffect(() => {
  //   const supabase = createClient();
  //   supabase.auth.getUser().then(({ data: { user: u } }) => setUser(u ?? null));
  //   const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
  //   return () => subscription.unsubscribe();
  // }, []);
  useEffect(() => {
    // Try from stored user first (fast), then verify with server
    const stored = getStoredUser();
    if (stored) setUser(stored);

    apiGetMe().then((me) => {
      if (me) {
        setUser(me);
        setStoredUser(me);
      } else {
        // Token invalid/expired
        removeToken();
        setUser(null);
      }
    }).catch(() => {
      if (!stored) setUser(null);
    });
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSessions([]);
      setCurrentSessionId(null);
      fetchedSessionIdsRef.current.clear();
      return;
    }
    const fetchSessions = async () => {
      setIsSessionsLoading(true);

      // SUPABASE WAS:
      // const supabase = createClient();
      // const { data, error } = await supabase.from("user_sessions").select("...").eq("user_id", user.id).order("updated_at", { ascending: false });
      const data = await apiGetSessions();

      if (data && data.length >= 0) {
        const typed = data as unknown as UserSession[];
        setSessions(typed);
        sessionsRef.current = typed;
        typed.forEach((s) => fetchedSessionIdsRef.current.add(s.id));

        const storedSessionId = localStorage.getItem("currentSessionId");
        const targetId =
          storedSessionId && typed.some((s) => s.id === storedSessionId)
            ? storedSessionId
            : typed.length > 0
              ? typed[0].id
              : null;

        setIsSessionsLoading(false);

        if (targetId) {
          const preloadedResps = typed.find((s) => s.id === targetId)?.resps;
          handleSelectSession(targetId, preloadedResps as Record<string, ApiResponse> | undefined);
        }
      } else {
        setIsSessionsLoading(false);
      }
    };
    fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Keep a ref that always has the latest resps so the debounce can read freshly
  const latestRespsRef = React.useRef(resps);
  useEffect(() => { latestRespsRef.current = resps; }, [resps]);

  /**
   * Strips heavy base64 image_data_url fields before saving to DB.
   */
  const stripBase64ForSave = (r: Record<string, ApiResponse>): Record<string, ApiResponse> => {
    const out: Record<string, ApiResponse> = {};
    for (const [jid, val] of Object.entries(r)) {
      const v = val as ApiOk;
      if (v.image_data_url) {
        const rest = { ...v };
        delete (rest as Record<string, unknown>).image_data_url;
        out[jid] = rest as ApiOk;
      } else {
        out[jid] = val;
      }
    }
    return out;
  };

  // Debounced auto-save to backend DB
  // SUPABASE WAS: supabase.from("user_sessions").update({ resps: ..., updated_at: ... }).eq("id", activeSessionToSave);
  useEffect(() => {
    if (!user?.id || !currentSessionId) return;
    localStorage.setItem('currentSessionId', currentSessionId);

    const handler = setTimeout(async () => {
      const activeSessionToSave = respsSessionIdRef.current;
      if (!activeSessionToSave || activeSessionToSave !== currentSessionId) return;
      const snapshotResps = latestRespsRef.current;
      if (!snapshotResps || Object.keys(snapshotResps).length === 0) return;

      const respsToSave = stripBase64ForSave(snapshotResps);
      await apiUpdateSession(activeSessionToSave, { resps: respsToSave as Record<string, unknown> });

      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionToSave ? { ...s, resps: snapshotResps } : s))
      );
    }, 3000);

    return () => clearTimeout(handler);
  }, [resps, currentSessionId, user?.id]);

  const handleNewSession = async () => {
    if (!user) return;
    const defaultTitle = selectedPerspectives.length > 0 ? selectedPerspectives[0].perspective : "New Session";
    const userTitle = window.prompt("ادخل اسماً لهذه الجلسة الجديدة:", defaultTitle);
    if (userTitle === null) return;
    const finalTitle = userTitle.trim() !== "" ? userTitle.trim() : defaultTitle + " - " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // SUPABASE WAS: const supabase = createClient(); supabase.from("user_sessions").insert({...}).select().single();
    const data = await apiCreateSession(finalTitle, {});

    if (data) {
      const typed = data as unknown as UserSession;
      setSessions((prev) => [typed, ...prev]);
      setCurrentSessionId(typed.id);
      currentSessionIdRef.current = typed.id;
      localStorage.setItem('currentSessionId', typed.id);
      respsSessionIdRef.current = typed.id;
      setResps({});
      onClear();
    } else {
      alert("تعذر إنشاء الجلسة. تحقق من اتصال قاعدة بيانات Supabase (DATABASE_URL) ثم أعد المحاولة.");
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;

    // SUPABASE WAS: const supabase = createClient(); await supabase.from("user_sessions").delete().eq("id", id);
    await apiDeleteSession(id);

    fetchedSessionIdsRef.current.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      currentSessionIdRef.current = null;
      localStorage.removeItem('currentSessionId');
      respsSessionIdRef.current = null;
      setResps({});
      onClear();
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].id, remaining[0].resps as Record<string, ApiResponse> | undefined);
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-session-menu]')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const handleDuplicateSession = async (e: React.MouseEvent, session: UserSession) => {
    e.stopPropagation();
    if (!user || duplicatingId) return;
    setOpenMenuId(null);

    const defaultName = `${session.title} (Copy)`;
    const newName = window.prompt("Enter a name for the duplicate session:", defaultName);
    if (newName === null) return;

    setDuplicatingId(session.id);
    try {
      // SUPABASE WAS: const supabase = createClient(); supabase.from('user_sessions').insert({...}).select().single();
      const respsToClone = session.resps || {};
      const data = await apiCreateSession(newName.trim() || defaultName, respsToClone as Record<string, unknown>);
      if (data) {
        const typed = data as unknown as UserSession;
        fetchedSessionIdsRef.current.add(typed.id);
        setSessions((prev) => [typed, ...prev]);
      } else {
        alert('Duplicate Error: Could not duplicate session');
      }
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleRenameSession = async (e: React.MouseEvent, session: UserSession) => {
    e.stopPropagation();
    setOpenMenuId(null);
    const newName = window.prompt("Enter a new name:", session.title || 'Untitled Session');
    if (newName === null || newName.trim() === '') return;

    // SUPABASE WAS: const supabase = createClient(); supabase.from('user_sessions').update({ title: newName.trim() }).eq('id', session.id);
    const ok = await apiUpdateSession(session.id, { title: newName.trim() });
    if (ok) setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: newName.trim() } : s));
  };

  async function handleSelectSession(
    id: string,
    sessionResps?: Record<string, ApiResponse>,
  ) {
    if (currentSessionIdRef.current === id && respsSessionIdRef.current === id) return;

    currentSessionIdRef.current = id;
    setCurrentSessionId(id);
    localStorage.setItem('currentSessionId', id);

    const cachedSession = sessionsRef.current.find((s) => s.id === id);
    const cachedResps = cachedSession?.resps;
    const effectiveResps = sessionResps ?? cachedResps;
    const hasCachedResps = effectiveResps && Object.keys(effectiveResps).length > 0;
    const alreadyFetched = fetchedSessionIdsRef.current.has(id);

    if (hasCachedResps) {
      respsSessionIdRef.current = id;
      setResps(effectiveResps as Record<string, ApiResponse>);
      if (!pollingIntervalsRef.current[id]) setLoading(false);
      setSessionLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      respsSessionIdRef.current = null;
      setResps({});
      onClear();
      if (!alreadyFetched) {
        setSessionLoadingIds((prev) => new Set(prev).add(id));
      }
    }

    if (!alreadyFetched) {
      try {
        // SUPABASE WAS: const supabase = createClient(); supabase.from("user_sessions").select("resps").eq("id", id).single();
        const allSessions = await apiGetSessions();
        const sessionData = allSessions.find(s => s.id === id);

        if (currentSessionIdRef.current !== id) return;

        const freshResps = (sessionData?.resps && Object.keys(sessionData.resps).length > 0)
          ? sessionData.resps as Record<string, ApiResponse>
          : (effectiveResps && Object.keys(effectiveResps).length > 0 ? (effectiveResps as Record<string, ApiResponse>) : {});

        fetchedSessionIdsRef.current.add(id);
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, resps: freshResps } : s)));

        if (Object.keys(freshResps).length >= Object.keys(latestRespsRef.current || {}).length) {
          respsSessionIdRef.current = id;
          setResps(freshResps);
        }

        const pendingJobIds = Object.keys(freshResps).filter((jid) => {
          const status = (freshResps[jid] as ApiOk).status;
          return !['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status || '');
        });
        if (pendingJobIds.length > 0) {
          setLoading(true);
          if (!pollingIntervalsRef.current[id]) startPolling(id, pendingJobIds);
        } else {
          if (!pollingIntervalsRef.current[id]) setLoading(false);
        }
      } finally {
        setSessionLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
    } else {
      const respsToCheck = effectiveResps || {};
      const pendingJobIds = Object.keys(respsToCheck).filter((jid) => {
        const status = (respsToCheck[jid] as ApiOk).status;
        return !['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status || '');
      });
      if (pendingJobIds.length > 0) {
        setLoading(true);
        if (!pollingIntervalsRef.current[id]) startPolling(id, pendingJobIds);
      } else {
        if (!pollingIntervalsRef.current[id]) setLoading(false);
      }
      setSessionLoadingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const getOrCreateSession = async () => {
    if (!user) return null;
    if (currentSessionId) return currentSessionId;
    const title = selectedPerspectives.length > 0 ? selectedPerspectives[0].perspective : "New Session";

    // SUPABASE WAS: const supabase = createClient(); supabase.from("user_sessions").insert({...}).select().single();
    const data = await apiCreateSession(
      title + " - " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      {}
    );

    if (data) {
      const typed = data as unknown as UserSession;
      setSessions((prev) => [typed, ...prev]);
      setCurrentSessionId(typed.id);
      currentSessionIdRef.current = typed.id;
      localStorage.setItem('currentSessionId', typed.id);
      respsSessionIdRef.current = null;
      setResps({});
      return typed.id;
    } else {
      alert("getOrCreateSession Error: Could not create session");
    }
    return null;
  };



  const images = useMemo(() => {
    return Object.values(resps)
      .filter(
        (r) =>
          (r as ApiOk).ok &&
          ((r as ApiOk).image_data_url || (r as ApiOk).file_url),
      )
      .map((r) => ({
        url: (r as ApiOk).file_url || (r as ApiOk).image_data_url!,
        perspective: (r as ApiOk).perspective || "",
        isVideo: !!(r as ApiOk).is_video,
        isRegenerated: !!(r as ApiOk).is_regenerated,
        parentUrl: (r as ApiOk).parent_url,
        aspectRatio: (r as ApiOk).aspect_ratio || "16:9",
      }));
  }, [resps]);

  const jobIds = useMemo(() => {
    return Object.keys(resps);
  }, [resps]);

  async function onSend(isVideo = false) {
    if (!user) {
      router.push("/login");
      return;
    }
    if (selectedPerspectives.length === 0) return;
    const targetSessionId = await getOrCreateSession();
    if (!targetSessionId) return;
    if (currentSessionIdRef.current === targetSessionId) setLoading(true);

    try {
      const fd = new FormData();
      selectedPerspectives.forEach((sp) => {
        fd.append("perspective", sp.perspective);
        fd.append("aspect_ratio", sp.aspectRatio);
        fd.append("image_count", sp.imageCount.toString());
      });
      fd.append("custom_prompt", customPrompt || "");
      fd.append("denoise", denoise.toString());
      fd.append("is_video", isVideo ? "true" : "false");

      if (file) fd.append("file", file);

      if (refs && refs.length > 0) {
        refs.forEach((r) => {
          fd.append("refs", r);
        });
      }

      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: fd,
      });

      const initialData = await res.json();

      if (!initialData.ok || !initialData.job_ids) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      const newJobIds: string[] = initialData.job_ids;
      if (newJobIds.length === 0) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      let jobIdx = 0;
      const initialResps: Record<string, ApiResponse> = {};
      selectedPerspectives.forEach((sp) => {
        const n = Math.max(1, Math.min(Number(sp.imageCount) || 1, 10));
        for (let c = 0; c < n && jobIdx < newJobIds.length; c++) {
          const jid = newJobIds[jobIdx++];
          if (jid) {
            initialResps[jid] = {
              ok: true,
              job_id: jid,
              status: "IN_QUEUE",
              perspective: sp.perspective,
              aspect_ratio: sp.aspectRatio,
            } as ApiOk;
          }
        }
      });
      while (jobIdx < newJobIds.length) {
        const jid = newJobIds[jobIdx++];
        if (jid)
          initialResps[jid] = {
            ok: true,
            job_id: jid,
            status: "IN_QUEUE",
          } as ApiOk;
      }
      if (currentSessionIdRef.current === targetSessionId) {
        respsSessionIdRef.current = targetSessionId;
        setResps((prev) => ({ ...prev, ...initialResps }));
      }
      setSessions((prev) => prev.map(s => {
        if (s.id !== targetSessionId) return s;
        const mergedResps = { ...(s.resps || {}), ...initialResps };
        return { ...s, resps: mergedResps };
      }));

      startPolling(targetSessionId, newJobIds);
    } catch {
      if (currentSessionIdRef.current === targetSessionId) setLoading(false);
    }
  }

  async function urlToFile(url: string, filename: string): Promise<File> {
    try {
      const res = await fetch(`/api/proxy-download?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error("Failed to fetch proxy image");
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || "image/png" });
    } catch (err) {
      console.warn("Proxy fetch failed, falling back to direct URL fetch:", err);
      const res = await fetch(url);
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type || "image/png" });
    }
  }

  async function onGenerateVideoFromGallery(
    startUrl: string,
    endUrl: string,
    prompt: string,
  ) {
    if (!user) {
      router.push("/login");
      return;
    }
    const targetSessionId = await getOrCreateSession();
    if (!targetSessionId) return;
    if (currentSessionIdRef.current === targetSessionId) setLoading(true);
    try {
      const fd = new FormData();
      fd.append("perspective", "Custom Scene");
      fd.append("aspect_ratio", "16:9");
      fd.append("image_count", "1");
      fd.append("custom_prompt", prompt || "");
      fd.append("denoise", "0.75");
      fd.append("is_video", "true");

      if (startUrl) {
        const startFile = await urlToFile(startUrl, "start.png");
        fd.append("file", startFile);
      }

      if (endUrl) {
        const endFile = await urlToFile(endUrl, "end.png");
        fd.append("refs", endFile);
      }

      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: fd,
      });

      const initialData = await res.json();

      if (!initialData.ok || !initialData.job_ids) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      const newJobIds: string[] = initialData.job_ids;
      if (newJobIds.length === 0) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      const initialVideoResps: Record<string, ApiOk> = {};
      newJobIds.forEach((jid) => {
        initialVideoResps[jid] = {
          ok: true,
          job_id: jid,
          status: "IN_QUEUE",
          is_video: true,
          perspective: "Custom Scene",
          aspect_ratio: "16:9",
        } as ApiOk;
      });

      setSessions((ps) => {
        const s = ps.find(x => x.id === targetSessionId);
        if (!s) return ps;
        const next = { ...s.resps, ...initialVideoResps };
        if (currentSessionIdRef.current === targetSessionId) {
          respsSessionIdRef.current = targetSessionId;
          setResps(next);
        }
        return ps.map(x => x.id === targetSessionId ? { ...x, resps: next } : x);
      });

      startPolling(targetSessionId, newJobIds);
    } catch {
      if (currentSessionIdRef.current === targetSessionId) setLoading(false);
    }
  }

  async function onRegenerate(originalImageUrl: string, newPrompt: string, perspective: string, isVideo: boolean = false, aspectRatio: string = "16:9") {
    if (!user) {
      router.push("/login");
      return;
    }
    const targetSessionId = await getOrCreateSession();
    if (!targetSessionId) return;
    if (currentSessionIdRef.current === targetSessionId) setLoading(true);
    try {
      const fd = new FormData();
      fd.append("perspective", perspective || "Custom Scene");
      fd.append("aspect_ratio", aspectRatio);
      fd.append("image_count", "1");
      fd.append("custom_prompt", newPrompt || "");
      fd.append("denoise", "0.75");
      fd.append("is_video", isVideo ? "true" : "false");

      if (originalImageUrl) {
        try {
          const origFile = await urlToFile(originalImageUrl, isVideo ? "original.mp4" : "original.png");
          fd.append("file", origFile);
        } catch (err) {
          console.error("Failed to load original file for regeneration", err);
        }
      }

      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: fd,
      });

      const initialData = await res.json();

      if (!initialData.ok || !initialData.job_ids) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      const newJobIds: string[] = initialData.job_ids;
      if (newJobIds.length === 0) {
        if (currentSessionIdRef.current === targetSessionId) setLoading(false);
        return;
      }

      const initialRegenResps: Record<string, ApiOk> = {};
      newJobIds.forEach((jid) => {
        initialRegenResps[jid] = {
          ok: true,
          job_id: jid,
          status: "IN_QUEUE",
          is_video: isVideo,
          perspective: perspective,
          aspect_ratio: aspectRatio,
          is_regenerated: true,
          parent_url: originalImageUrl,
        } as ApiOk;
      });

      setSessions((ps) => {
        const s = ps.find(x => x.id === targetSessionId);
        if (!s) return ps;
        const next = { ...s.resps, ...initialRegenResps };
        if (currentSessionIdRef.current === targetSessionId) {
          respsSessionIdRef.current = targetSessionId;
          setResps(next);
        }
        return ps.map(x => x.id === targetSessionId ? { ...x, resps: next } : x);
      });

      startPolling(targetSessionId, newJobIds);
    } catch {
      if (currentSessionIdRef.current === targetSessionId) setLoading(false);
    }
  }

  function onDownload(url: string) {
    if (!url) return;
    const downloadUrl = `/api/proxy-download?url=${encodeURIComponent(url)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "studio_creation";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function onClear() {
    setFile(null);
    setPreviewUrl("");
    setRefs([]);
    setRefPreviewUrls([]);
    setLoading(false);
  }

  async function onDeleteItem(url: string) {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId) return;

    // Find job id by url
    const jidToDelete = Object.keys(resps).find(jid => {
      const r = resps[jid] as ApiOk;
      return r.file_url === url || r.image_data_url === url;
    });

    if (!jidToDelete) return;

    // Compute updated resps without the deleted item
    const updatedResps = { ...resps };
    delete updatedResps[jidToDelete];

    // 1) Remove from local state immediately (optimistic update)
    setResps(updatedResps);
    latestRespsRef.current = updatedResps;
    respsSessionIdRef.current = sessionId;

    setSessions(ps => ps.map(s => {
      if (s.id !== sessionId) return s;
      const next = { ...(s.resps || {}) };
      delete next[jidToDelete];
      return { ...s, resps: next };
    }));

    // 2) Persist deletion to DB so it survives page reloads
    // SUPABASE WAS: const supabase = createClient(); supabase.from("user_sessions").update({ resps: ..., updated_at: ... }).eq("id", sessionId);
    try {
      const respsToSave = stripBase64ForSave(updatedResps);
      await apiUpdateSession(sessionId, { resps: respsToSave as Record<string, unknown> });
    } catch (err) {
      console.error("Failed to persist deletion to DB:", err);
    }
  }

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Create", href: "#create" },
    { label: "Gallery", href: "#gallery" },
    { label: "Pricing", href: "#pricing" },
    { label: "API", href: "#api" },
  ];

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-x-hidden bg-[#09090b] text-slate-50 relative selection:bg-cyan-500/30">
      {/* Ambient Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-radial from-purple-600/20 to-transparent blur-[120px] mix-blend-screen animate-[float_20s_infinite_ease-in-out_alternate]"></div>
        <div className="absolute -bottom-[20%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-radial from-indigo-600/20 to-transparent blur-[120px] mix-blend-screen animate-[float_25s_infinite_ease-in-out_alternate-reverse]"></div>
      </div>

      {/* Top Header - Floating Style */}
      <header className="sticky top-0 z-50 w-full bg-[#09090b]/80 backdrop-blur-xl border-b border-white/5">
        <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10 xl:px-16">
          <nav className="flex h-[72px] items-center justify-between">
            {/* Logo */}
            <a href="#" className="flex items-center gap-3 shrink-0 group" onClick={(e) => { e.preventDefault(); setActiveApp(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[1px] shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-transform duration-300 group-hover:scale-105">
                <div className="relative w-full h-full bg-[#040508] rounded-xl flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#logo-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:rotate-12">
                    <defs>
                      <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="50%" stopColor="#c084fc" />
                        <stop offset="100%" stopColor="#f472b6" />
                      </linearGradient>
                    </defs>
                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                    <polyline points="2 17 12 22 22 17"></polyline>
                    <polyline points="2 12 12 17 22 12"></polyline>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-black text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/80">H_ARCH</span>
                <span className="text-[9px] text-purple-400 font-bold tracking-[0.2em] uppercase mt-0.5">Studio</span>
              </div>
            </a>

            {/* Desktop Menu - Floating Pill */}
            <div className="hidden md:flex items-center bg-[#18181b] rounded-2xl p-1.5 border border-white/10 gap-1 shadow-lg shadow-black/50">
              <button onClick={() => setActiveApp(null)} className={`p-2 rounded-xl transition-all ${!activeApp ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><HomeIcon size={18} strokeWidth={2.5} /></button>
              <button onClick={() => setActiveApp("generation")} className={`p-2 rounded-xl transition-all ${activeApp === "generation" ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}><Wand2 size={18} strokeWidth={2} /></button>
              <button onClick={() => router.push("/video")} className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"><Video size={18} strokeWidth={2} /></button>
              <button className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"><Search size={18} strokeWidth={2} /></button>
              <button className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"><LayoutGrid size={18} strokeWidth={2} /></button>
              <button className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"><Brush size={18} strokeWidth={2} /></button>
              <button className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"><Folder size={18} strokeWidth={2} /></button>
            </div>

            {/* User / Auth & Mobile Toggle */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-500 font-medium text-sm">
                <Coins size={14} />
                <span>0</span>
                <Plus size={14} className="opacity-50" />
              </div>
              {user ? (
                <div className="flex items-center gap-2 pl-2 pr-4 py-1.5 rounded-full bg-[#18181b] border border-white/10 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={async () => { await apiLogout(); setUser(null); }}>
                  <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold uppercase">
                    {user.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden sm:block text-xs font-medium text-zinc-300">
                    {user.full_name || user.email?.split('@')[0]}
                  </span>
                </div>
              ) : (
                <a href="/login" className="inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 text-sm font-semibold text-white hover:opacity-90 transition-opacity shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                  Sign In
                </a>
              )}
              {/* Mobile Menu Toggle */}
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </nav>
        </div>
        
        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 w-full bg-[#09090b]/95 backdrop-blur-xl border-b border-white/5 flex flex-col p-4 gap-2 shadow-2xl animate-in slide-in-from-top-2">
            <button onClick={() => { setActiveApp(null); setMobileMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`p-4 rounded-xl flex items-center gap-3 font-semibold ${!activeApp ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <HomeIcon size={20} /> Home
            </button>
            <button onClick={() => { setActiveApp("generation"); setMobileMenuOpen(false); }} className={`p-4 rounded-xl flex items-center gap-3 font-semibold ${activeApp === "generation" ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <Wand2 size={20} /> AI Workspace
            </button>
            <button onClick={() => { router.push("/video"); setMobileMenuOpen(false); }} className="p-4 rounded-xl flex items-center gap-3 font-semibold text-zinc-400 hover:text-white hover:bg-white/5">
              <Video size={20} /> Video Generation
            </button>
            <button onClick={() => { document.getElementById("apps")?.scrollIntoView({ behavior: "smooth" }); setMobileMenuOpen(false); }} className="p-4 rounded-xl flex items-center gap-3 font-semibold text-zinc-400 hover:text-white hover:bg-white/5">
              <LayoutGrid size={20} /> Explore Apps
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area - Spacious */}
      <main className="flex-grow w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-8 lg:py-12 relative z-10">

        {/* Welcome / Hero Section - يظهر فقط لغير المسجلين */}
        {!activeApp ? (
          <div className="flex flex-col gap-24 animate-[fadeInUp_0.8s_ease-out] w-full mt-4">
            {/* Hero Section */}
            <section className="flex flex-col items-center text-center mt-10">
              <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tighter mb-8 leading-[1.1] max-w-4xl">
                Design, from Concept to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-pink-400">Reality</span>
              </h1>
              <div className="flex flex-wrap items-center justify-center gap-4 mb-16 w-full px-2">
                <button onClick={() => setActiveApp("generation")} className="px-5 sm:px-6 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-[0_0_20px_rgba(139,92,246,0.4)] whitespace-nowrap text-sm sm:text-base">
                  Get Started <ArrowRight size={18} className="shrink-0" />
                </button>
                <button onClick={() => document.getElementById("apps")?.scrollIntoView({ behavior: "smooth" })} className="px-5 sm:px-6 py-3 rounded-full bg-[#18181b] border border-white/10 text-white font-semibold flex justify-center hover:bg-white/5 transition-all whitespace-nowrap text-sm sm:text-base">
                  Explore Apps
                </button>
              </div>

              {/* Hero Images Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mx-auto px-4">
                {dbHero.slice(0, 3).map((hero, index) => (
                  <div key={hero.id} onClick={() => router.push(`/apps/${hero.id}`)} className={`cursor-pointer aspect-[3/4] rounded-3xl overflow-hidden relative group ${index === 1 ? 'md:-translate-y-6' : ''}`}>
                    <img src={hero.image_url} alt={hero.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent flex items-end">
                      <div className="p-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0 w-full">
                        <span className="text-white font-bold text-lg drop-shadow-xl font-display">{hero.title}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Explore Tools Section */}
            <section className="max-w-6xl mx-auto w-full px-4">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4 font-display">Explore <span className="text-purple-400">Our Tools</span></h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">Powerful AI tools designed to transform your architectural and interior design workflow.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {dbTools.map((t) => {
                  const Icon = IconMap[t.icon] || Sparkles;
                  return (
                    <div key={t.id} onClick={() => {
                        if (t.title?.toLowerCase().includes("video")) {
                          router.push("/video");
                        } else {
                          setActiveApp(t.action_id || "generation");
                        }
                      }} className="bg-[#121214] border border-white/5 rounded-3xl p-6 cursor-pointer hover:border-purple-500/30 hover:bg-[#18181b] transition-all group">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Icon className="text-purple-400" size={24} />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-2">{t.title}</h3>
                      <p className="text-zinc-500 text-sm leading-relaxed">{t.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Explore Apps Section */}
            <section id="apps" className="max-w-[1400px] mx-auto w-full mb-20 mt-20 px-4">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4 font-display">Explore <span className="text-purple-400">H_ARCH Apps</span></h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">Explore our innovative AI Powered applications and tools for creative professionals.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {dbApps.map((a) => (
                  <div key={a.id} className="flex flex-col gap-4">
                    <div className="aspect-[4/5] rounded-3xl overflow-hidden relative group cursor-pointer" onClick={() => router.push(`/apps/${a.id}`)}>
                      <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-purple-500 text-white text-[11px] font-bold shadow-lg">New</div>
                      <img src={a.image_url} alt={a.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
                    </div>
                    <div className="px-1">
                      <div className="inline-block px-3 py-1 rounded-full border border-white/10 text-zinc-400 text-[11px] font-medium mb-3">{a.category}</div>
                      <h3 className="text-lg font-bold text-white mb-2">{a.title}</h3>
                      <p className="text-zinc-500 text-[13px] mb-4 line-clamp-2 leading-relaxed">{a.description}</p>
                      <button onClick={() => router.push(`/apps/${a.id}`)} className="w-full py-2.5 rounded-xl border border-white/5 bg-[#121214] hover:bg-[#18181b] hover:border-white/10 transition-all flex items-center justify-center gap-2 text-sm font-medium hover:text-purple-300">
                        <Sparkles size={16} className="text-purple-400" /> Open App
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Pricing Section (Dynamic) */}
            <section id="pricing" className="max-w-6xl mx-auto w-full mb-24 px-4">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4 font-display">Choose Your <span className="text-purple-400">Plan</span></h2>
                <p className="text-zinc-400 max-w-2xl mx-auto">Flexible subscription options designed to fit your workflow needs.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {dbPlans.map((p) => (
                  <div key={p.id} className={`bg-[#18181b] border ${p.is_popular ? 'border-purple-500 ring-1 ring-purple-500' : 'border-white/5'} rounded-3xl p-8 flex flex-col relative transition-all group hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)]`}>
                    {p.is_popular ? (
                      <div className="absolute top-0 right-8 -translate-y-1/2 px-4 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[11px] font-bold rounded-full uppercase tracking-widest shadow-lg">
                        Most Popular
                      </div>
                    ) : null}
                    <div className="mb-6">
                      <h3 className="text-2xl font-bold mb-2">{p.name}</h3>
                      <div className="flex items-end gap-1">
                        <span className="text-4xl font-black">${p.price}</span>
                        <span className="text-zinc-500 mb-1">/{p.period}</span>
                      </div>
                    </div>
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-4 mb-8 flex flex-col gap-1 items-center justify-center text-center">
                      <span className="text-3xl font-bold text-emerald-400">{p.credits} <Coins size={20} className="inline opacity-80" /></span>
                      <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Credits included</span>
                    </div>
                    <ul className="flex flex-col gap-4 flex-1 mb-8">
                      {p.features.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                          <CheckCircle2 size={18} className="text-purple-400 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${p.is_popular ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90 shadow-lg' : 'bg-[#121214] border border-white/10 text-white hover:bg-white/5'}`}>
                      Select Plan
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="w-full flex-grow flex flex-col items-center animate-[fadeInUp_0.4s_ease-out]">
            {/* Generation Interface Inspired by Image 5 */}
            <div className="w-full max-w-4xl mx-auto flex flex-col items-center mt-10 mb-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6 text-center">
                <Layers className="text-purple-400 shrink-0" size={36} />
                <h2 className="text-2xl sm:text-4xl font-display font-bold leading-tight max-w-2xl">Complete Architectural Rendering Workspace</h2>
              </div>
            </div>

            {/* Studio Workspace - Layout: History (left, toggleable) | Gallery (center) | Settings (right) */}
            <div id="create" className={`relative w-full grid gap-8 xl:gap-14 2xl:gap-20 animate-[fadeInUp_0.8s_ease-out_0.2s_both] scroll-mt-24 ${user && historySidebarOpen
              ? "grid-cols-1 xl:grid-cols-[240px_1fr_300px] 2xl:grid-cols-[260px_1fr_320px]"
              : "grid-cols-1 xl:grid-cols-[1fr_300px] 2xl:grid-cols-[1fr_320px]"
              }`}>
              {/* Show History toggle button when sidebar is hidden */}
              {user && !historySidebarOpen && (
                <button
                  onClick={() => setHistorySidebarOpen(true)}
                  className="fixed left-4 top-[50%] -translate-y-1/2 z-40 flex items-center justify-center w-10 h-12 rounded-r-xl bg-slate-900/90 backdrop-blur-xl border border-l-0 border-white/10 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 shadow-lg transition-all hover:pl-1"
                  title="Show History"
                  aria-label="Show History"
                >
                  <PanelLeft size={20} strokeWidth={2} />
                </button>
              )}

              {/* 1. History - Left sidebar (toggleable, natural height) */}
              {user && historySidebarOpen && (
                <div className="order-3 xl:order-1 w-full xl:self-start flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.3)] relative">
                  <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/15 rounded-full blur-[60px] pointer-events-none" aria-hidden />
                  <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/5 relative z-10">
                    <div className="flex flex-col flex-1 min-w-0">
                      <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 font-display">
                        History
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Your past creations</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={handleNewSession}
                        className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-400/40 text-indigo-300 hover:text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)] hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:-translate-y-0.5"
                        title="New Session"
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => setHistorySidebarOpen(false)}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
                        title="Hide History"
                        aria-label="Hide History"
                      >
                        <PanelLeftClose size={18} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 px-4 pb-5 relative z-10">
                    {isSessionsLoading ? (
                      <div className="flex justify-center items-center py-10">
                        <Loader2 size={24} className="animate-spin text-indigo-500" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-center py-12 px-4 bg-black/20 rounded-2xl border border-white/5 border-dashed h-full">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
                          <MessageSquare size={20} className="text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-300 mb-1">No sessions found</p>
                        <p className="text-xs text-slate-500">Create a new session to begin</p>
                      </div>
                    ) : <>{sessions.map((session: UserSession) => {
                      const isActive = currentSessionId === session.id;
                      const isMenuOpen = openMenuId === session.id;
                      const isDuplicating = duplicatingId === session.id;
                      const isSessionFetching = sessionLoadingIds.has(session.id);

                      return (
                        <div key={session.id}>
                          <div
                            onClick={() => handleSelectSession(session.id, session.resps)}
                            className={`group flex items-center gap-2 p-3 rounded-2xl cursor-pointer transition-all duration-300 border relative ${isActive
                              ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-100 shadow-[0_4px_20px_rgba(99,102,241,0.15)]"
                              : "bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10 text-slate-300"
                              }`}
                          >
                            {isActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-400 to-blue-500 rounded-l-2xl" />
                            )}

                            {/* Info */}
                            <div className="flex flex-col overflow-hidden flex-1 min-w-0 ml-1">
                              <div className="flex items-center gap-2">
                                <MessageSquare size={13} className={`shrink-0 ${isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-400"}`} />
                                <span className="text-xs truncate font-medium flex-1">
                                  {session.title || "Untitled Session"}
                                </span>
                                {isSessionFetching && (
                                  <Loader2 size={10} className="animate-spin text-indigo-400 shrink-0" />
                                )}
                              </div>
                              <span className="text-[9px] text-slate-600 mt-1 ml-5 font-mono group-hover:text-slate-500 transition-colors">
                                {new Date(session.updated_at).toLocaleDateString()} {new Date(session.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            {/* 3-dot menu / loading spinner */}
                            <div className="relative shrink-0" data-session-menu>
                              {isDuplicating ? (
                                <div className="p-1.5">
                                  <Loader2 size={13} className="animate-spin text-indigo-400" />
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : session.id); }}
                                  className={`p-1.5 rounded-lg transition-all duration-200 ${isMenuOpen ? "bg-white/15 text-white" : "text-slate-500 hover:text-slate-200 hover:bg-white/10 opacity-0 group-hover:opacity-100"
                                    } ${isActive ? "!opacity-100" : ""}`}
                                >
                                  <MoreVertical size={13} strokeWidth={2} />
                                </button>
                              )}

                              {isMenuOpen && (
                                <div
                                  data-session-menu
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-full mt-2 w-44 bg-[#0c1118] border border-white/10 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] z-[100] overflow-hidden backdrop-blur-2xl"
                                >
                                  <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                                  {/* Rename */}
                                  <button
                                    onClick={(e) => handleRenameSession(e, session)}
                                    className="w-full flex items-center gap-3 px-3.5 py-3 text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-all group/rn border-b border-white/5"
                                  >
                                    <span className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center group-hover/rn:bg-white/15 transition-colors shrink-0">
                                      <Pencil size={11} className="text-slate-400" />
                                    </span>
                                    <span className="font-semibold">Rename</span>
                                  </button>

                                  {/* Duplicate */}
                                  <button
                                    onClick={(e) => handleDuplicateSession(e, session)}
                                    disabled={!!duplicatingId}
                                    className="w-full flex items-center gap-3 px-3.5 py-3 text-xs text-slate-300 hover:text-white hover:bg-indigo-500/20 transition-all group/di border-b border-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <span className="w-6 h-6 rounded-lg bg-indigo-500/15 flex items-center justify-center group-hover/di:bg-indigo-500/30 transition-colors shrink-0">
                                      {isDuplicating
                                        ? <Loader2 size={11} className="animate-spin text-indigo-400" />
                                        : <Copy size={11} className="text-indigo-400" />
                                      }
                                    </span>
                                    <span className="font-semibold">{isDuplicating ? "Duplicating…" : "Duplicate"}</span>
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={(e) => { setOpenMenuId(null); handleDeleteSession(e, session.id); }}
                                    className="w-full flex items-center gap-3 px-3.5 py-3 text-xs text-slate-300 hover:text-red-300 hover:bg-red-500/15 transition-all group/del"
                                  >
                                    <span className="w-6 h-6 rounded-lg bg-red-500/10 flex items-center justify-center group-hover/del:bg-red-500/25 transition-colors shrink-0">
                                      <Trash2 size={11} className="text-red-400" />
                                    </span>
                                    <span className="font-semibold">Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Duplicating overlay */}
                          {isDuplicating && (
                            <div className="mt-1 mx-0.5 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-medium animate-pulse">
                              <Loader2 size={10} className="animate-spin shrink-0" />
                              <span>Creating copy…</span>
                            </div>
                          )}
                        </div>
                      );
                    })}</>}
                  </div>
                </div>
              )}

              {/* 2. Output Gallery - Center (sizes by content) */}
              <div id="gallery" className="order-2 w-full min-w-0 xl:self-start flex flex-col scroll-mt-24">
                <ResultDisplay
                  currentSessionId={currentSessionId}
                  images={images}
                  loading={loading}
                  resps={resps}
                  isSessionDataLoading={currentSessionId ? sessionLoadingIds.has(currentSessionId) : false}
                  onDownload={onDownload}
                  onGenerateVideoFromGallery={onGenerateVideoFromGallery}
                  onRegenerate={onRegenerate}
                  onDelete={onDeleteItem}
                />
              </div>

              {/* 3. Settings & Controls - Right on desktop, top on mobile (natural height, no stretch) */}
              <div className="order-1 xl:order-3 w-full xl:self-start">
                <ControlPanel
                  file={file}
                  previewUrl={previewUrl}
                  selectedPerspectives={selectedPerspectives}
                  setSelectedPerspectives={setSelectedPerspectives}
                  customPrompt={customPrompt}
                  denoise={denoise}
                  loading={loading}
                  jobIds={jobIds}
                  refs={refs}
                  refPreviewUrls={refPreviewUrls}
                  setFile={setFile}
                  setPreviewUrl={setPreviewUrl}
                  setCustomPrompt={setCustomPrompt}
                  setDenoise={setDenoise}
                  setRefs={setRefs}
                  setRefPreviewUrls={setRefPreviewUrls}
                  mode={mode}
                  setMode={setMode}
                  onSend={() => onSend(false)}
                  onGenerateVideo={() => onSend(true)}
                  onClear={onClear}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer with anchors for Pricing & API */}
      <footer id="pricing" className="mt-16 py-10 border-t border-white/10 bg-black/40 text-center relative z-10 backdrop-blur-md scroll-mt-24">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10 xl:px-16">
          <p className="text-sm text-slate-500 font-medium">
            H_ARCH STUDIO &copy; {new Date().getFullYear()}. Empowering designers.
          </p>
          <div id="api" className="h-0 overflow-hidden" aria-hidden="true" />
        </div>
      </footer>

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap");

        @keyframes float {
          0% {
            transform: translateY(0) scale(1);
          }
          100% {
            transform: translateY(5%) scale(1.1);
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
