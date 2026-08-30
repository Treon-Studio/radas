/**
 * Interactive Animated Favicon & Dynamic Title Manager
 * Provides utilities and state management for talking mascots, reactive titles, and tab badges.
 */

export type FaviconFrame = "idle" | "talk-1" | "talk-2" | "talk-3" | "happy" | "sleep" | "wink";
export type MascotReactionType = "success" | "error" | "happy" | "sleep" | "wink" | "alert" | "loading";

export interface TalkOptions {
  intervalMs?: number;
  durationMs?: number;
  emoji?: string;
}

export interface BindSpeechOptions {
  emoji?: string;
  revertTitle?: string;
  onEnter?: () => void;
  onLeave?: () => void;
}

let talkInterval: ReturnType<typeof setInterval> | null = null;
let revertTimeout: ReturnType<typeof setTimeout> | null = null;
let originalTitle = typeof document !== "undefined" ? document.title || "RADAS — Modern GitOps Platform" : "RADAS";
let currentFrameIndex = 0;

const TALK_FRAMES: FaviconFrame[] = ["talk-1", "talk-2", "talk-3", "talk-2", "idle"];

/**
 * Update the active favicon in the document head
 */
export function setFavicon(frameOrUrl: FaviconFrame | string) {
  if (typeof document === "undefined") return;
  const href = frameOrUrl.startsWith("/") || frameOrUrl.startsWith("data:")
    ? frameOrUrl
    : `/favicon-frames/${frameOrUrl}.png`;

  let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

/**
 * Animate the talking mascot favicon in a loop with optional tab title dialogue
 */
export function startTalkingFavicon(speechText?: string, options: TalkOptions = {}) {
  if (typeof document === "undefined") return;

  const { intervalMs = 130, durationMs, emoji = "💬" } = options;

  // Clear existing timers
  if (revertTimeout) {
    clearTimeout(revertTimeout);
    revertTimeout = null;
  }
  if (talkInterval) {
    clearInterval(talkInterval);
    talkInterval = null;
  }

  // Update tab title
  if (speechText) {
    document.title = `${emoji} RADAS — "${speechText}"`;
  }

  // Start frame animation
  currentFrameIndex = 0;
  setFavicon(TALK_FRAMES[0] ?? "");

  talkInterval = setInterval(() => {
    currentFrameIndex = (currentFrameIndex + 1) % TALK_FRAMES.length;
    setFavicon(TALK_FRAMES[currentFrameIndex] ?? "");
  }, intervalMs);

  // Optional auto-stop duration
  if (durationMs && durationMs > 0) {
    setTimeout(() => {
      stopTalkingFavicon();
    }, durationMs);
  }
}

/**
 * Stop talking animation, play a quick cheerful wink and restore original document title
 */
export function stopTalkingFavicon(customRevertTitle?: string) {
  if (typeof document === "undefined") return;

  if (talkInterval) {
    clearInterval(talkInterval);
    talkInterval = null;
  }

  // Play a brief friendly wink
  setFavicon("wink");

  revertTimeout = setTimeout(() => {
    setFavicon("idle");
    document.title = customRevertTitle || originalTitle;
    revertTimeout = null;
  }, 600);
}

/**
 * Trigger an instant mascot emotion reaction (e.g. on copy, success, error)
 */
export function triggerMascotReaction(
  reaction: MascotReactionType,
  message?: string,
  durationMs: number = 2000
) {
  if (typeof document === "undefined") return;

  if (revertTimeout) clearTimeout(revertTimeout);
  if (talkInterval) clearInterval(talkInterval);

  const emojiMap: Record<MascotReactionType, { frame: FaviconFrame; emoji: string }> = {
    success: { frame: "happy", emoji: "✨" },
    happy: { frame: "happy", emoji: "🎉" },
    wink: { frame: "wink", emoji: "😉" },
    sleep: { frame: "sleep", emoji: "💤" },
    alert: { frame: "talk-3", emoji: "⚠️" },
    error: { frame: "talk-3", emoji: "🚨" },
    loading: { frame: "talk-1", emoji: "⏳" },
  };

  const { frame, emoji } = emojiMap[reaction] || { frame: "idle", emoji: "💬" };

  setFavicon(frame);
  if (message) {
    document.title = `${emoji} RADAS — ${message}`;
  }

  revertTimeout = setTimeout(() => {
    setFavicon("idle");
    document.title = originalTitle;
    revertTimeout = null;
  }, durationMs);
}

/**
 * Render a dynamic badge number on the favicon via HTML5 Canvas
 */
export function setMascotNotificationBadge(count: number) {
  if (typeof document === "undefined") return;

  if (count <= 0) {
    setFavicon("idle");
    return;
  }

  const img = new Image();
  img.src = "/favicon-frames/idle.png";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, 64, 64);

    // Draw notification badge circle (top right)
    ctx.beginPath();
    ctx.arc(50, 14, 12, 0, 2 * Math.PI);
    ctx.fillStyle = "#EF4444";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#FFFFFF";
    ctx.stroke();

    // Draw count text
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(count > 9 ? "9+" : String(count), 50, 14);

    setFavicon(canvas.toDataURL("image/png"));
  };
}

/**
 * Initialize tab visibility listener (Sleep when user switches tab, Wake & Welcome on return)
 */
export function initFaviconTabListener(): () => void {
  if (typeof document === "undefined") return () => {};

  originalTitle = document.title || "RADAS — Modern GitOps Platform";

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (talkInterval) clearInterval(talkInterval);
      setFavicon("sleep");
      document.title = "💤 RADAS — Come back soon!";
    } else {
      setFavicon("happy");
      document.title = "✨ RADAS — Welcome back!";
      setTimeout(() => {
        setFavicon("idle");
        document.title = originalTitle;
      }, 1800);
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => document.removeEventListener("visibilitychange", onVisibilityChange);
}

/**
 * React JSX props helper to easily bind speech hover interactions to buttons/cards
 */
export function bindMascotSpeech(text: string, options: BindSpeechOptions = {}) {
  const { emoji, revertTitle, onEnter, onLeave } = options;
  return {
    onMouseEnter: () => {
      startTalkingFavicon(text, { emoji });
      onEnter?.();
    },
    onMouseLeave: () => {
      stopTalkingFavicon(revertTitle);
      onLeave?.();
    },
    onFocus: () => {
      startTalkingFavicon(text, { emoji });
      onEnter?.();
    },
    onBlur: () => {
      stopTalkingFavicon(revertTitle);
      onLeave?.();
    },
  };
}
