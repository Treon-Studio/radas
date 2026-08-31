import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  HARO_IDLE_URI,
  HARO_SLEEPY_URI,
  HARO_OVERHEAT_URI,
  HARO_TURBO_URI,
  HARO_SHIELD_URI,
  HARO_HAPPY_URI,
  HARO_LOVE_URI,
  HARO_THINKING_URI,
  HARO_WINK_URI,
} from "./petAssets";
import {
  PET_500_USE_CASES,
  matchDeviceConditionUseCase,
  DeviceTelemetry,
  PetMood,
  PetUseCase,
} from "./pet500UseCases";
import { CONCEPT_BINDINGS } from "./useCaseAnnotations";

export type MoveDirection = "idle" | "left" | "right" | "up" | "down";

// A firing ontology alert rule. The main process evaluates the domain
// ontology's alert rules against live server status and returns them
// severity-sorted (critical > warning > info).
interface RadasAlert {
  id: string;
  severity: string;
  route: string;
  title: string;
}

export function RadasPet() {
  const [mood, setMood] = useState<PetMood>("idle");
  const [direction, setDirection] = useState<MoveDirection>("idle");
  const [caseIdx, setCaseIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [autoPatrolEnabled, setAutoPatrolEnabled] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState<DeviceTelemetry | null>(null);
  const [showBubble, setShowBubble] = useState(false);
  const [radasStatus, setRadasStatus] = useState<{
    authenticated: boolean;
    status?: { workers: { total: number; online: number }; approvals: { pending: number } };
    alerts?: RadasAlert[];
    error?: boolean;
  } | null>(null);

  // Mouse Dragging State
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const hasMoved = useRef(false);
  const resetDirectionTimer = useRef<any>(null);
  const sleepTimer = useRef<any>(null);
  const bubbleTimer = useRef<any>(null);

  // Helper to trigger bubble on-demand for a set duration
  const triggerBubble = (duration = 3200) => {
    setShowBubble(true);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => {
      setShowBubble(false);
    }, duration);
  };

  // Autonomous Flight & Natural Bézier Trajectory State
  const currentPos = useRef<{ x: number; y: number }>({ x: 600, y: 400 });
  const targetPos = useRef<{ x: number; y: number }>({ x: 600, y: 400 });
  const flightP0 = useRef<{ x: number; y: number }>({ x: 600, y: 400 });
  const flightP1 = useRef<{ x: number; y: number }>({ x: 600, y: 400 });
  const flightPctrl = useRef<{ x: number; y: number }>({ x: 600, y: 400 });
  const flightStartTime = useRef<number>(0);
  const flightDuration = useRef<number>(3000);
  const bankAngle = useRef<number>(0);

  const workArea = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  });
  const isMovingToTarget = useRef(false);
  const pauseUntil = useRef<number>(0);
  const animationFrameId = useRef<any>(null);

  // 1. Fetch Real-time Device Condition Telemetry (CPU, Memory, Uptime, Time of Day, Idle)
  useEffect(() => {
    const desktop = (window as any).radasDesktop;
    if (desktop) {
      const fetchDevice = () => {
        desktop.getDeviceStatus().then((status: DeviceTelemetry) => {
          if (status) {
            setDeviceInfo(status);
            // Trigger bubble alert on critical hardware spikes
            if (status.memUsagePct > 85 || status.cpuUsagePct > 80) {
              triggerBubble(4000);
            }
          }
        }).catch(() => {});
      };

      fetchDevice();
      const interval = setInterval(fetchDevice, 3000);
      return () => clearInterval(interval);
    }
  }, []);

  // 1b. Poll RADAS status from the main process. The main process reads the
  // CLI credential store, polls the control plane, evaluates the domain
  // ontology's alert rules, and returns {status, alerts}; the renderer only
  // sees aggregate counts and severity-sorted firing rules — never tokens.
  useEffect(() => {
    const desktop = (window as any).radasDesktop;
    if (!desktop?.getRadasStatus) return;
    const fetchStatus = () => {
      desktop.getRadasStatus().then((status: any) => {
        setRadasStatus(status);
      }).catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // 2. Initialize screen work area and current window position
  useEffect(() => {
    const desktop = (window as any).radasDesktop;
    if (desktop) {
      desktop.getScreenWorkArea().then((info: any) => {
        if (info && info.workArea) {
          workArea.current = info.workArea;
        }
      }).catch(() => {});
      desktop.getPetPosition().then((pos: any) => {
        if (Array.isArray(pos)) {
          currentPos.current = { x: pos[0], y: pos[1] };
          targetPos.current = { x: pos[0], y: pos[1] };
          flightP0.current = { x: pos[0], y: pos[1] };
          flightP1.current = { x: pos[0], y: pos[1] };
        }
      }).catch(() => {});
    }
  }, []);

  // Pick next natural curved flight waypoint across screen
  const pickNextWaypoint = (now: number) => {
    const wa = workArea.current;
    const minX = wa.x + 30;
    const maxX = Math.max(minX + 200, wa.x + wa.width - 210);
    const minY = wa.y + 40;
    const maxY = Math.max(minY + 200, wa.y + wa.height - 200);

    const startX = currentPos.current.x;
    const startY = currentPos.current.y;

    // Pick dynamic coordinates
    const nextX = minX + Math.random() * (maxX - minX);
    const nextY = minY + Math.random() * (maxY - minY);

    const dist = Math.hypot(nextX - startX, nextY - startY);
    if (dist < 40) return;

    flightP0.current = { x: startX, y: startY };
    flightP1.current = { x: nextX, y: nextY };
    targetPos.current = { x: nextX, y: nextY };

    // Create organic apex control point with perpendicular arc
    const midX = (startX + nextX) / 2;
    const midY = (startY + nextY) / 2;
    const perpFactor = (Math.random() * 0.3 + 0.15) * (Math.random() > 0.5 ? 1 : -1);
    const perpX = -(nextY - startY) * perpFactor;
    const perpY = (nextX - startX) * perpFactor;

    flightPctrl.current = {
      x: Math.max(minX, Math.min(maxX, midX + perpX)),
      y: Math.max(minY, Math.min(maxY, midY + perpY)),
    };

    flightStartTime.current = now;
    flightDuration.current = Math.max(2200, Math.min(5500, (dist / 140) * 1000));
    isMovingToTarget.current = true;
  };

  // Autonomous Roaming Animation Loop with Natural Bézier Trajectory & Organic Hovering
  useEffect(() => {
    const loop = (time: number) => {
      if (
        autoPatrolEnabled &&
        !isDragging.current &&
        mood !== "sleepy" &&
        time > pauseUntil.current
      ) {
        if (!isMovingToTarget.current) {
          pickNextWaypoint(time);
        } else {
          const elapsed = time - flightStartTime.current;
          const u = Math.min(1, Math.max(0, elapsed / flightDuration.current));

          // Smooth cubic ease-in-out S-curve
          const s = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

          const p0 = flightP0.current;
          const p1 = flightP1.current;
          const pc = flightPctrl.current;

          // Quadratic Bézier curve position
          const oneMinusS = 1 - s;
          const curveX = oneMinusS * oneMinusS * p0.x + 2 * oneMinusS * s * pc.x + s * s * p1.x;
          const curveY = oneMinusS * oneMinusS * p0.y + 2 * oneMinusS * s * pc.y + s * s * p1.y;

          // Gentle harmonic hover drone bobbing
          const hoverY = Math.sin(time / 450) * 4.5;
          const hoverX = Math.cos(time / 700) * 2.0;

          currentPos.current.x = curveX + hoverX;
          currentPos.current.y = curveY + hoverY;

          // Instantaneous tangent velocity vector
          const vx = 2 * oneMinusS * (pc.x - p0.x) + 2 * s * (p1.x - pc.x);
          const vy = 2 * oneMinusS * (pc.y - p0.y) + 2 * s * (p1.y - pc.y);

          // Dynamic banking tilt
          bankAngle.current = Math.max(-12, Math.min(12, vx * 0.04));

          // Set 4-way direction pose based on velocity vector
          if (Math.abs(vx) > Math.abs(vy) * 0.8) {
            if (vx > 5) setDirection("right");
            else if (vx < -5) setDirection("left");
          } else {
            if (vy < -5) setDirection("up");
            else if (vy > 5) setDirection("down");
          }

          // Move the Electron Pet Window at 60 FPS
          const desktop = (window as any).radasDesktop;
          if (desktop) {
            desktop.setPetPosition(currentPos.current.x, currentPos.current.y);
          }

          if (u >= 1) {
            // Reached destination smoothly: hover, deliver update, rest
            isMovingToTarget.current = false;
            setDirection("idle");
            pauseUntil.current = time + 3000 + Math.random() * 2500;
            setCaseIdx((prev) => (prev + 1) % PET_500_USE_CASES.length);
            triggerBubble(2800);
            setMood("wink");
            setTimeout(() => {
              setMood((prev) => (prev === "wink" ? "idle" : prev));
            }, 900);
          }
        }
      } else if (!isDragging.current && mood !== "sleepy") {
        // Idle gentle hover float in place
        const hoverY = Math.sin(time / 500) * 3.0;
        const hoverX = Math.cos(time / 800) * 1.5;
        const desktop = (window as any).radasDesktop;
        if (desktop && (Math.abs(hoverY) > 0.1 || Math.abs(hoverX) > 0.1)) {
          desktop.setPetPosition(currentPos.current.x + hoverX, currentPos.current.y + hoverY);
        }
      }

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [autoPatrolEnabled, mood]);

  // Reset sleep timer on any interaction
  const resetSleepCountdown = () => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (mood === "sleepy") setMood("idle");
    sleepTimer.current = setTimeout(() => {
      setMood("sleepy");
      triggerBubble(3500); // Show sleepy zzz on sleep onset
    }, 35000); // Take a nap after 35s of continuous inactivity
  };

  // Cycle through 500 use cases periodically if idle
  useEffect(() => {
    resetSleepCountdown();
    const timer = setInterval(() => {
      setCaseIdx((prev) => (prev + 1) % PET_500_USE_CASES.length);
    }, 6000);
    return () => {
      clearInterval(timer);
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    hasMoved.current = false;
    startX.current = e.screenX;
    startY.current = e.screenY;
    // Pause auto roam during and right after user drag
    pauseUntil.current = performance.now() + 10000;
    isMovingToTarget.current = false;
    resetSleepCountdown();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.screenX - startX.current;
    const deltaY = e.screenY - startY.current;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > 2 || absY > 2) {
      hasMoved.current = true;
      resetSleepCountdown();

      // 4-Way Directional Movement Detection
      if (absX >= absY) {
        if (deltaX > 2) {
          setDirection("right");
        } else if (deltaX < -2) {
          setDirection("left");
        }
      } else {
        if (deltaY < -2) {
          setDirection("up");
        } else if (deltaY > 2) {
          setDirection("down");
        }
      }

      // Fast movement triggers surprised state
      if (absX > 15 || absY > 15) {
        setMood("surprised");
      }

      if (resetDirectionTimer.current) clearTimeout(resetDirectionTimer.current);
      resetDirectionTimer.current = setTimeout(() => {
        setDirection("idle");
        if (mood === "surprised") setMood("idle");
      }, 500);
    }

    startX.current = e.screenX;
    startY.current = e.screenY;

    currentPos.current.x += deltaX;
    currentPos.current.y += deltaY;

    const desktop = (window as any).radasDesktop;
    if (desktop) {
      desktop.movePetWindow(deltaX, deltaY);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    pauseUntil.current = performance.now() + 8000; // Resume auto roam after 8s
    setTimeout(() => {
      setDirection("idle");
      if (mood === "surprised") setMood("idle");
    }, 300);
  };

  const handlePetClick = (e: React.MouseEvent) => {
    resetSleepCountdown();
    triggerBubble(3500); // Show bubble on click
    if (hasMoved.current) {
      hasMoved.current = false;
      return;
    }

    setMood("happy");

    // Cycle to next use case on click
    setCaseIdx((prev) => (prev + 1) % PET_500_USE_CASES.length);

    // Electron IPC call: when there's a live RADAS alert, clicking the pet
    // opens the console at the relevant route; otherwise just toggle it.
    const desktop = (window as any).radasDesktop;
    if (desktop) {
      if (radasAlert && desktop.openConsoleAt) {
        desktop.openConsoleAt(radasAlert.route);
      } else {
        desktop.toggleConsole();
      }
    } else {
      window.open("http://localhost:8080", "_blank");
    }

    setTimeout(() => setMood("idle"), 1500);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    resetSleepCountdown();
    triggerBubble(3500); // Show bubble on double click
    setFlip(true);
    setMood("love");
    setTimeout(() => {
      setFlip(false);
      setMood("happy");
      setTimeout(() => setMood("idle"), 1000);
    }, 600);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Right-click toggles auto-patrol mode on/off
    setAutoPatrolEnabled((prev) => !prev);
    setMood("thinking");
    triggerBubble(2500);
    setTimeout(() => setMood("idle"), 1000);
  };

  const handleMouseEnter = () => {
    triggerBubble(3500); // Show bubble on hover
    if (mood === "idle" && !isDragging.current) {
      setMood("wink");
      setTimeout(() => {
        setMood((prev) => (prev === "wink" ? "idle" : prev));
      }, 800);
    }
  };

  const handleMouseLeave = () => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => {
      setShowBubble(false);
    }, 1500);
  };

  // Resolve active prompt matching real-time device conditions or cycling 500 cases
  const deviceUseCase = matchDeviceConditionUseCase(deviceInfo, caseIdx);

  // Ontology-driven alerts take priority over local telemetry and the static
  // 500 cases: alerts are actionable events the user can click through to the
  // console for. The list is already severity-sorted, so the first firing
  // rule wins. Mood and click-through route come from the rule itself
  // (contracts/domain-ontology.json); the bubble text prefers a use case bound
  // to the alert via CONCEPT_BINDINGS (useCaseAnnotations.ts) so the pet speaks
  // about the real concept, falling back to the rule's generic title when the
  // alert is unbound or the bound index is out of range. Mood mapping:
  // critical -> surprised, warning/info -> thinking.
  let radasAlert: { text: string; mood: PetMood; route: string } | null = null;
  const firingAlert = radasStatus?.alerts?.[0];
  // The bound-use-case pick is memoized per firing alert id: Math.random()
  // must not run inline in render, or every hover/position re-render would
  // re-randomize a bubble the user is currently reading. The pick only
  // re-randomizes when a different alert fires.
  const boundUseCaseText = useMemo(() => {
    if (!firingAlert) return undefined;
    const bound = CONCEPT_BINDINGS[firingAlert.id];
    const boundIdx =
      bound && bound.length > 0
        ? bound[Math.floor(Math.random() * bound.length)]
        : undefined;
    return boundIdx !== undefined ? PET_500_USE_CASES[boundIdx]?.text : undefined;
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on the firing alert id only
  }, [firingAlert?.id]);
  if (firingAlert) {
    radasAlert = {
      text: boundUseCaseText ?? firingAlert.title,
      mood: firingAlert.severity === "critical" ? "surprised" : "thinking",
      route: firingAlert.route,
    };
  }

  const currentUseCase = radasAlert
    ? { text: radasAlert.text, mood: radasAlert.mood }
    : deviceUseCase;

  // Active glow color depending on mood or device telemetry condition
  const effectiveMood = mood !== "idle" ? mood : currentUseCase.mood;

  // Select authentic Haro mood sprite matching current context
  let currentSprite = HARO_IDLE_URI;
  if (effectiveMood === "overheat" || effectiveMood === "surprised") {
    currentSprite = HARO_OVERHEAT_URI;
  } else if (effectiveMood === "sleepy") {
    currentSprite = HARO_SLEEPY_URI;
  } else if (effectiveMood === "shield") {
    currentSprite = HARO_SHIELD_URI;
  } else if (effectiveMood === "turbo" || (isMovingToTarget.current && direction !== "idle")) {
    currentSprite = HARO_TURBO_URI;
  } else if (effectiveMood === "happy") {
    currentSprite = HARO_HAPPY_URI;
  } else if (effectiveMood === "love") {
    currentSprite = HARO_LOVE_URI;
  } else if (effectiveMood === "thinking") {
    currentSprite = HARO_THINKING_URI;
  } else if (effectiveMood === "wink") {
    currentSprite = HARO_WINK_URI;
  }

  // 4-Way Directional, Aerodynamic Banking & Mood Transform
  let mascotTransform = "scaleX(1) rotate(0deg)";
  const bank = Math.round(bankAngle.current);
  if (effectiveMood === "sleepy") {
    mascotTransform = "scale(0.95) translateY(4px) rotate(4deg)";
  } else if (direction === "left") {
    mascotTransform = `scaleX(-1) rotate(${-(bank || -6)}deg) translateX(-2px)`;
  } else if (direction === "right") {
    mascotTransform = `scaleX(1) rotate(${bank || 6}deg) translateX(2px)`;
  } else if (direction === "up") {
    mascotTransform = "scale(1.06) translateY(-4px)";
  } else if (direction === "down") {
    mascotTransform = "scale(0.96) translateY(4px)";
  }

  const glowColor =
    effectiveMood === "love"
      ? "from-pink-500/25 via-rose-500/25 to-purple-500/25"
      : effectiveMood === "thinking"
      ? "from-cyan-500/25 via-teal-500/25 to-blue-500/25"
      : effectiveMood === "surprised"
      ? "from-amber-500/30 via-orange-500/30 to-red-500/30"
      : effectiveMood === "sleepy"
      ? "from-slate-500/15 via-blue-500/15 to-indigo-500/15"
      : "from-emerald-500/20 via-cyan-500/20 to-teal-500/20";

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      style={{ WebkitAppRegion: "drag" } as any}
      className="flex flex-col items-center justify-center h-screen w-screen bg-transparent p-1 font-pixel select-none cursor-move"
    >
      {/* 1. NES Balloon Speech Bubble (Zero-Clipping - Only appears when needed) */}
      <div
        style={{ WebkitAppRegion: "no-drag" } as any}
        className={`relative mb-2 shrink-0 transition-all duration-300 transform ${
          showBubble
            ? "opacity-100 scale-100 translate-y-0 animate-bounce-slow"
            : "opacity-0 scale-90 translate-y-1 pointer-events-none"
        }`}
      >
        <div className="nes-balloon-bottom px-2 py-0.5 text-center shadow-sm">
          <p className="font-pixel text-[7.5px] font-bold text-[#212529] select-none tracking-tight leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-[130px]">
            {mood === "sleepy"
              ? "Zzz..."
              : mood === "love"
              ? "RADAS Loved"
              : mood === "thinking"
              ? "Scanning..."
              : currentUseCase.text}
          </p>
        </div>
      </div>

      {/* 2. Pure Official Haro Mascot with Context-Matched Mood Sprite */}
      <div
        onClick={handlePetClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        style={{ WebkitAppRegion: "no-drag" } as any}
        className={`group relative cursor-pointer transition-transform duration-300 ${
          flip
            ? "rotate-[360deg] scale-125"
            : effectiveMood === "happy" || effectiveMood === "love"
            ? "scale-115 -translate-y-1"
            : effectiveMood === "surprised"
            ? "scale-118 rotate-[-6deg]"
            : effectiveMood === "wink"
            ? "scale-105 rotate-3"
            : effectiveMood === "sleepy"
            ? "opacity-85 scale-95"
            : "hover:scale-108"
        }`}
        title="Click to toggle RADAS Console, Drag 4-ways to fly, Double-click for joy!"
      >
        {/* Soft Ambient Glow */}
        <div
          className={`absolute -inset-1 bg-gradient-to-r ${glowColor} rounded-full blur-xs opacity-75 group-hover:opacity-100 transition duration-300 pointer-events-none`}
        />

        {/* Explicit 46px Mascot Sprite Container (+25% scale) */}
        <div
          className={`relative flex items-center justify-center ${
            direction === "idle" && effectiveMood !== "sleepy" ? "animate-pixel-bounce" : ""
          }`}
          style={{
            width: "46px",
            height: "46px",
            transform: mascotTransform,
            transition: "transform 0.15s ease-in-out",
          }}
        >
          <img
            src={currentSprite}
            alt="Animated Haro Mascot"
            className="block select-none pointer-events-none"
            style={{
              width: "46px",
              height: "46px",
              maxWidth: "46px",
              maxHeight: "46px",
              objectFit: "contain",
              imageRendering: "pixelated",
              outline: "none",
              border: "none",
              boxShadow: "none",
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))",
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}





