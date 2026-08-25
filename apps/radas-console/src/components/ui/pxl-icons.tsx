export function PxlCloudIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110`} shapeRendering="crispEdges">
      <path d="M8 8h8v2h2v2h2v4h-2v2H6v-2H4v-4h2v-2h2V8zM10 6h4v2h-4V6z" />
    </svg>
  );
}

export function PxlCpuIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110`} shapeRendering="crispEdges">
      <path d="M6 6h12v12H6V6zm2 2v8h8V8H8zm-5 2h2v2H3v-2zm0 4h2v2H3v-2zm18-4h2v2h-2v-2zm0 4h2v2h-2v-2zM10 3h2v2h-2V3zm4 0h2v2h-2V3zm-4 18h2v2h-2v-2zm4 0h2v2h-2v-2z" />
    </svg>
  );
}

export function PxlSparklesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} transition-transform duration-300 group-hover:scale-125 group-hover:rotate-45`} shapeRendering="crispEdges">
      <path d="M11 3h2v4h-2V3zm0 14h2v4h-2v-4zm-8-8h4v2H3V9zm14 0h4v2h-4V9zm-5 0h2v4h-2V9zm-2 2h6v2h-6v-2zM6 6h2v2H6V6zm10 0h2v2h-2V6zM6 16h2v2H6v-2zm10 0h2v2h-2v-2z" />
    </svg>
  );
}

export function PxlShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`${className} transition-transform duration-300 group-hover:scale-110 group-hover:translate-y-0.5`} shapeRendering="crispEdges">
      <path d="M5 4h14v6c0 5-3 8-7 10-4-2-7-5-7-10V4zm2 2v4c0 3.5 2 6 5 7.5 3-1.5 5-4 5-7.5V6H7zm3 5l2 2 4-4 1.5 1.5L12 15l-3.5-3.5L10 11z" />
    </svg>
  );
}
