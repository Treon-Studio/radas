import {
  RiFlashlightFill as Lightning,
  RiCpuFill as Cpu,
  RiStarFill as Star,
  RiShieldFill as Shield,
} from "@remixicon/react";

export function PxlCloudIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5 text-[#107A4D]`}>
      <Lightning className="h-5 w-5" />
    </div>
  );
}

export function PxlCpuIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12 text-[#107A4D]`}>
      <Cpu className="h-5 w-5" />
    </div>
  );
}

export function PxlSparklesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-125 group-hover:rotate-45 text-[#107A4D]`}>
      <Star className="h-5 w-5" />
    </div>
  );
}

export function PxlShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center justify-center ${className} transition-transform duration-300 group-hover:scale-110 group-hover:translate-y-0.5 text-[#107A4D]`}>
      <Shield className="h-5 w-5" />
    </div>
  );
}

