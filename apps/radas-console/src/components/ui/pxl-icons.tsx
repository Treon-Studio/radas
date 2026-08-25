import { PxlKitIcon } from "@pxlkit/core";
import { Lightning, Scroll, Star, Shield } from "@pxlkit/gamification";

export function PxlCloudIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5`}>
      <PxlKitIcon icon={Lightning} size={20} appearance="palette" />
    </div>
  );
}

export function PxlCpuIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12`}>
      <PxlKitIcon icon={Scroll} size={20} appearance="palette" />
    </div>
  );
}

export function PxlSparklesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-125 group-hover:rotate-45`}>
      <PxlKitIcon icon={Star} size={20} appearance="palette" />
    </div>
  );
}

export function PxlShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:translate-y-0.5`}>
      <PxlKitIcon icon={Shield} size={20} appearance="palette" />
    </div>
  );
}
