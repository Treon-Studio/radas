import { useCallback, useState } from "react";
import {
  setFavicon,
  startTalkingFavicon,
  stopTalkingFavicon,
  triggerMascotReaction,
  setMascotNotificationBadge,
  bindMascotSpeech,
  type FaviconFrame,
  type MascotReactionType,
  type BindSpeechOptions,
  type TalkOptions,
} from "@/lib/interactiveFavicon";

/**
 * useMascot — React hook for controlling mascot favicon emotions, speech bubbles, and tab titles.
 */
export function useMascot() {
  const [isTalking, setIsTalking] = useState(false);
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);

  const say = useCallback((message: string, options?: TalkOptions) => {
    setIsTalking(true);
    setActiveSpeech(message);
    startTalkingFavicon(message, options);
  }, []);

  const silence = useCallback((customRevertTitle?: string) => {
    setIsTalking(false);
    setActiveSpeech(null);
    stopTalkingFavicon(customRevertTitle);
  }, []);

  const react = useCallback((reaction: MascotReactionType, message?: string, durationMs?: number) => {
    setIsTalking(false);
    setActiveSpeech(message || null);
    triggerMascotReaction(reaction, message, durationMs);
  }, []);

  const bind = useCallback((text: string, options?: BindSpeechOptions) => {
    return bindMascotSpeech(text, {
      ...options,
      onEnter: () => {
        setIsTalking(true);
        setActiveSpeech(text);
        options?.onEnter?.();
      },
      onLeave: () => {
        setIsTalking(false);
        setActiveSpeech(null);
        options?.onLeave?.();
      },
    });
  }, []);

  const setBadge = useCallback((count: number) => {
    setMascotNotificationBadge(count);
  }, []);

  const setFrame = useCallback((frame: FaviconFrame) => {
    setFavicon(frame);
  }, []);

  return {
    isTalking,
    activeSpeech,
    say,
    silence,
    react,
    bind,
    setBadge,
    setFrame,
  };
}
