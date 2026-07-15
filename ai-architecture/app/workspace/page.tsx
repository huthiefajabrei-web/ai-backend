"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Home,
  Search,
  Layers,
  Compass,
  FolderOpen,
  Book,
  LayoutGrid,
  Image as ImageIcon,
  Video,
  Mic,
  MessageSquare,
  Share2,
  RefreshCw,
  Heart,
  SlidersHorizontal,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Bell,
  Moon,
  X,
  Menu
} from 'lucide-react';
import MobileBottomNav from '@/app/components/MobileBottomNav';
import { auth, db } from '../../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, addDoc, setDoc, deleteField } from 'firebase/firestore';
import { createPortal } from 'react-dom';

interface Space {
  id: string;
  name: string;
  updatedAt: string;
  rawUpdatedAt?: string;
}

export default function WorkspaceDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function loadAndMigrateSpaces(uid: string) {
    setLoading(true);
    try {
      const userDocRef = doc(db, 'app_user_workspaces', uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let loadedSpaces: Space[] = [];
      
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        const spacesObj = data.spaces || {};
        
        // Migration check: if spaces object doesn't exist but legacy nodes do
        if (!data.spaces && data.nodes && data.nodes.length > 0) {
          const legacyId = "legacy_" + Date.now();
          spacesObj[legacyId] = {
            id: legacyId,
            name: "Legacy Space",
            nodes: data.nodes,
            edges: data.edges || [],
            createdAt: data.updatedAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString()
          };
          
          // Save the migrated data
          await setDoc(userDocRef, {
            spaces: spacesObj,
            nodes: deleteField(),
            edges: deleteField()
          }, { merge: true });
        }
        
        // Convert spaces object to array
        loadedSpaces = Object.keys(spacesObj).map(key => ({
          id: key,
          name: spacesObj[key].name || "Untitled space",
          updatedAt: spacesObj[key].updatedAt ? new Date(spacesObj[key].updatedAt).toLocaleString() : "Just now",
          rawUpdatedAt: spacesObj[key].updatedAt || new Date().toISOString()
        }));
      }

      // Sort by updatedAt descending
      loadedSpaces.sort((a, b) => {
        const timeA = a.rawUpdatedAt ? new Date(a.rawUpdatedAt).getTime() : 0;
        const timeB = b.rawUpdatedAt ? new Date(b.rawUpdatedAt).getTime() : 0;
        return timeB - timeA;
      });
      
      setSpaces(loadedSpaces);
    } catch (err) {
      console.error('Error fetching workspaces:', err);
      alert('Error loading workspaces: ' + (err instanceof Error ? err.message : String(err)));
    }
    setLoading(false);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadAndMigrateSpaces(currentUser.uid);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSpaceName.trim()) return;
    
    setIsCreating(true);
    try {
      const userDocRef = doc(db, 'app_user_workspaces', user.uid);
      const newSpaceId = "space_" + Date.now();
      
      const newSpaceData = {
        name: newSpaceName.trim(),
        nodes: [],
        edges: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Update the user's document with the new space
      await setDoc(userDocRef, {
        spaces: {
          [newSpaceId]: newSpaceData
        }
      }, { merge: true });
      
      router.push(`/workspace/editor?spaceId=${newSpaceId}`);
    } catch (error: any) {
      console.error("Error creating space", error);
      alert("Failed to create space: " + (error?.message || String(error)));
      setIsCreating(false);
    }
  };

  const menuItems = [
    { name: 'Home', icon: Home, route: '/' },
    { name: 'Search', icon: Search, route: '#' },
    { name: 'Stock', icon: Layers, route: '#' },
    { name: 'Explore', icon: Compass, route: '#' },
    { name: 'Projects', icon: FolderOpen, route: '#' },
    { name: 'Library', icon: Book, route: '#' },
  ];

  const toolItems = [
    { name: 'Spaces', icon: LayoutGrid, route: '/workspace', active: true },
    { name: 'Image Generator', icon: ImageIcon, route: '/?studio=1' },
    { name: 'Video Generator', icon: Video, route: '/video' },
    { name: 'Voice Generator', icon: Mic, route: '#' },
    { name: 'Assistant', icon: MessageSquare, route: '#' },
  ];

  return (
    <div className="flex min-h-[100dvh] bg-[#111111] text-gray-200 font-sans pb-mobile-nav">
      {sidebarOpen && (
        <button
          type="button"
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-50 w-[min(280px,85vw)] md:w-64 bg-[#141417] border-r border-gray-800 flex flex-col justify-between overflow-y-auto transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div>
          {/* Logo */}
          <div className="px-4 sm:px-6 py-5 sm:py-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
              <span className="font-display font-black text-xl sm:text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/80">
                H_ARCH
              </span>
            </div>
            <button type="button" className="md:hidden p-2 text-gray-400 hover:text-white tap-target" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          </div>

          <div className="px-4 mb-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full bg-[#ff2e93] hover:bg-[#e6207f] text-white flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-colors"
            >
              <Plus size={20} />
              <span>Create</span>
            </button>
          </div>

          <div className="px-3">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.name} href={item.route} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#252529] transition-colors mb-1 tap-target">
                  <Icon size={20} strokeWidth={2} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 px-6 mb-2">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              All tools
            </div>
          </div>

          <div className="px-3 mb-6">
            {toolItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.route}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 tap-target ${
                    item.active
                      ? 'bg-[#252529] text-gray-100'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-[#252529]'
                  }`}
                >
                  <Icon size={20} strokeWidth={2} className={item.active ? 'text-gray-200' : ''} />
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer Icons */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-around text-gray-400">
          <button className="hover:text-white transition-colors"><Settings size={18} /></button>
          <button className="hover:text-white transition-colors relative">
            <Bell size={18} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#ff2e93] rounded-full"></span>
          </button>
          <button className="hover:text-white transition-colors"><Moon size={18} /></button>
          <button className="hover:text-white transition-colors"><LogOut size={18} /></button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#111111] overflow-y-auto min-w-0">
        <header className="px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3 sticky top-0 z-30 bg-[#111111]/95 backdrop-blur-md border-b border-gray-800/50 md:border-none">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" className="md:hidden p-2 -ml-1 text-gray-400 hover:text-white tap-target" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2 bg-[#1c1c1f] border border-gray-800 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#252529] transition-colors min-w-0">
              <div className="w-3 h-3 rounded-sm bg-orange-400 shrink-0"></div>
              <span className="text-sm font-medium truncate">Personal project</span>
              <ChevronDown size={16} className="text-gray-400 ml-1 shrink-0" />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-5 shrink-0">
            <Link href="/#pricing" className="hidden sm:inline text-sm font-medium text-[#ff2e93] hover:text-[#ff56a5] transition-colors">
              Pricing
            </Link>
            <button type="button" className="hidden sm:flex items-center gap-2 bg-[#1c1c1f] border border-gray-800 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#252529] transition-colors">
              <Share2 size={16} />
              Share
            </button>
            <button type="button" className="bg-[#1c1c1f] border border-gray-800 p-2.5 rounded-lg hover:bg-[#252529] transition-colors text-gray-400 tap-target" onClick={() => user && loadAndMigrateSpaces(user.uid)}>
              <RefreshCw size={18} />
            </button>
            <div className="w-9 h-9 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center overflow-hidden shrink-0">
              <User size={20} className="text-gray-300" />
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-8 pt-4 sm:pt-6 pb-12 max-w-7xl">
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-3 sm:mb-4">Spaces</h1>
          <p className="text-gray-400 text-sm sm:text-lg mb-8 sm:mb-10 leading-relaxed max-w-2xl">
            Build node-based generative workflows and bring your ideas to life.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
            <div className="flex items-center gap-4 sm:gap-8 border-b border-gray-800 w-full pb-4 overflow-x-auto scrollbar-hide">
              <button type="button" className="flex items-center gap-2 text-white font-medium relative px-2 shrink-0 whitespace-nowrap">
                <User size={18} className="text-gray-300" />
                My spaces
                <span className="absolute -bottom-[17px] left-0 w-full h-0.5 bg-white rounded-t-full"></span>
              </button>
              <button className="flex items-center gap-2 text-gray-500 hover:text-gray-300 font-medium px-2 transition-colors">
                <Share2 size={18} />
                Shared
              </button>
              <button className="flex items-center gap-2 text-gray-500 hover:text-gray-300 font-medium px-2 transition-colors">
                <LayoutGrid size={18} />
                Templates
              </button>
              
              <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="bg-white text-black hover:bg-gray-200 flex items-center gap-2 py-2.5 px-4 rounded-lg font-medium transition-colors text-sm tap-target whitespace-nowrap"
                >
                  <Plus size={16} />
                  New space
                </button>
                <button className="bg-[#1c1c1f] border border-gray-800 p-2 rounded-lg hover:bg-[#252529] transition-colors text-gray-400">
                  <Heart size={18} />
                </button>
                <button className="bg-[#1c1c1f] border border-gray-800 p-2 rounded-lg hover:bg-[#252529] transition-colors text-gray-400">
                  <SlidersHorizontal size={18} />
                </button>
                <button className="bg-[#1c1c1f] border border-gray-800 p-2 rounded-lg hover:bg-[#252529] transition-colors text-gray-400">
                  <Search size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {!loading && spaces.map(space => (
              <div
                key={space.id}
                onClick={() => router.push(`/workspace/editor?spaceId=${space.id}`)}
                className="group bg-[#141417] border border-gray-800 rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 transition-all duration-300"
              >
                <div className="h-44 w-full bg-[#1c1c1f] relative overflow-hidden flex items-center justify-center p-4">
                  {/* Decorative graphics mimicking workflow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-purple-900/20 z-0"></div>
                  <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                     <div className="w-full flex justify-between px-4 opacity-70 group-hover:opacity-100 transition-opacity">
                        <div className="w-16 h-12 bg-[#2a2a2e] rounded-md border border-gray-700 p-1 flex flex-col gap-1 shadow-lg">
                          <div className="w-full h-1 bg-gray-600 rounded-sm"></div>
                          <div className="w-3/4 h-1 bg-gray-600 rounded-sm"></div>
                        </div>
                        <div className="w-20 h-20 bg-gradient-to-tr from-[#ff2e93] to-purple-600 rounded-md border border-gray-700 shadow-lg transform rotate-6"></div>
                     </div>
                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-1 bg-gray-600/50 rounded-full z-0 opacity-50"></div>
                  </div>
                </div>
                
                <div className="p-4">
                  <h3 className="text-white font-medium mb-1 truncate">{space.name}</h3>
                  <p className="text-xs text-gray-500">Last updated: {space.updatedAt}</p>
                </div>
              </div>
            ))}
            
            {!loading && (
              <div
                onClick={() => setIsModalOpen(true)}
                className="group bg-[#141417] border border-gray-800 border-dashed rounded-xl overflow-hidden cursor-pointer hover:border-gray-600 hover:bg-[#1a1a1e] transition-all duration-300 flex flex-col items-center justify-center h-[240px]"
              >
                <div className="w-12 h-12 rounded-full bg-[#1c1c1f] border border-gray-700 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-gray-400 group-hover:text-white">
                  <Plus size={24} />
                </div>
                <h3 className="text-white font-medium">Create new space</h3>
                <p className="text-xs text-gray-500 mt-1">Start a blank workflow</p>
              </div>
            )}

            {loading && (
              <div className="h-[240px] bg-[#141417] border border-gray-800 rounded-xl animate-pulse flex items-center justify-center">
                 <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Create Space Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 nodrag nopan">
          <div className="bg-[#1c1c1f] border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Create New Space</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white bg-[#252529] hover:bg-[#35353a] p-1.5 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleCreateSpace}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">Workspace Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Living Room Design"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  className="w-full bg-[#0f0f11] text-white p-3 rounded-xl border border-gray-700 focus:border-[#ff2e93] focus:ring-1 focus:ring-[#ff2e93] focus:outline-none transition-all"
                />
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl font-medium text-gray-300 hover:bg-[#252529] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newSpaceName.trim()}
                  className="bg-[#ff2e93] hover:bg-[#e6207f] disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Space'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <MobileBottomNav
        highlight="studio"
        isLoggedIn={!!user}
        onHome={() => router.push("/")}
        onStudio={() => router.push("/?studio=1")}
        onApps={() => router.push("/#apps")}
        onVideo={() => router.push("/video")}
        onAccount={() => router.push(user ? "/#pricing" : "/login")}
      />
    </div>
  );
}
