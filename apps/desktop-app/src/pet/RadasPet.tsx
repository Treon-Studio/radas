import React, { useState, useEffect, useRef } from "react";

type PetMood = "idle" | "happy" | "working";

const MESSAGES = [
  "RADAS 🚀",
  "4 Stacks OK",
  "9Router Active",
  "Click Console",
];

export function RadasPet() {
  const [mood, setMood] = useState<PetMood>("idle");
  const [msgIdx, setMsgIdx] = useState(0);
  const [flip, setFlip] = useState(false);

  // Mouse Dragging State
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const hasMoved = useRef(false);

  // Rotate speech bubble status every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % MESSAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    startX.current = e.screenX;
    startY.current = e.screenY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.screenX - startX.current;
    const deltaY = e.screenY - startY.current;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved.current = true;
    }

    startX.current = e.screenX;
    startY.current = e.screenY;

    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require("electron");
        ipcRenderer.send("move-pet-window", { deltaX, deltaY });
      } catch (err) {}
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handlePetClick = (e: React.MouseEvent) => {
    // If the mouse was dragged, do not trigger single click console toggle
    if (hasMoved.current) {
      hasMoved.current = false;
      return;
    }

    setMood("happy");
    
    // Electron IPC call to toggle console
    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require("electron");
        ipcRenderer.send("toggle-console");
      } catch (err) {
        console.log("Toggle console IPC", err);
      }
    } else {
      window.open("http://localhost:8080", "_blank");
    }

    setTimeout(() => setMood("idle"), 1000);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    setFlip(true);
    setMood("happy");
    setTimeout(() => {
      setFlip(false);
      setMood("idle");
    }, 500);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ WebkitAppRegion: "drag" } as any}
      className="flex flex-col items-center justify-center h-screen w-screen bg-transparent p-0.5 font-mono select-none cursor-move"
    >
      {/* 1. Speech Bubble (Ultra-Compact Tooltip) */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as any}
        className="relative mb-1 animate-bounce-slow"
      >
        <div className="bg-[#1c1917] text-emerald-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 shadow-[1px_1px_0px_0px_#0f172a] whitespace-nowrap text-center">
          {MESSAGES[msgIdx]}
        </div>
        <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[4px] border-t-emerald-500/40 mx-auto -mt-[1px]" />
      </div>

      {/* 2. Micro RADAS Login Logo Mascot Character */}
      <div
        onClick={handlePetClick}
        onDoubleClick={handleDoubleClick}
        style={{ WebkitAppRegion: "no-drag" } as any}
        className={`group relative cursor-pointer transition-transform duration-300 ${
          flip ? "rotate-[360deg] scale-110" : "hover:scale-105"
        }`}
        title="Click to toggle RADAS Console, Drag to move!"
      >
        {/* Glow */}
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/30 to-cyan-500/30 rounded-lg blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />

        {/* RADAS Login Logo Container */}
        <div className="relative h-7 w-7 bg-[#090d16] rounded-lg border border-emerald-500/60 shadow-[2px_2px_0px_0px_#020617] flex items-center justify-center p-1">
          {/* RADAS Pixel Logo */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
            className={`w-full h-full ${
              mood === "happy" ? "text-emerald-400 scale-110" : "text-cyan-400"
            } transition-all duration-200`}
            aria-label="RADAS Logo"
          >
            <path d="M16 8h2v2h2v2h2v8H2v-8h2v-2h2V8h2V6h8v2Zm-8 8h2v-4H8v4Zm6-4v4h2v-4h-2ZM6 8H4V6h2v2Zm14 0h-2V6h2v2ZM4 6H2V4h2v2Zm18 0h-2V4h2v2Z" />
          </svg>
        </div>

        {/* Micro Indicator Dot */}
        <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-emerald-500 rounded-full border border-slate-900 shadow animate-pulse" />
      </div>
    </div>
  );
}
