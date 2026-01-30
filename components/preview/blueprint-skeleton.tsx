import { cn } from "@/lib/utils";

export function BlueprintSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full h-full overflow-hidden bg-[#F8FAFC]", className)}>
      {/* Grid Background */}
      <div 
        className="absolute inset-0 opacity-[0.6]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #E2E8F0 1px, transparent 1px),
            linear-gradient(to bottom, #E2E8F0 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px'
        }}
      />
      
      {/* Wireframe Layout */}
      <div className="relative z-10 flex flex-col h-full p-6 gap-6">
        {/* Header Wireframe */}
        <div className="h-14 w-full bg-white/40 border-2 border-dashed border-slate-300 rounded-lg shrink-0 backdrop-blur-[1px]" />
        
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Sidebar Wireframe */}
          <div className="w-64 hidden md:block h-full bg-white/30 border-2 border-dashed border-slate-300 rounded-lg backdrop-blur-[1px]" />
          
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col gap-6">
            {/* Hero/Top Block */}
            <div className="h-48 w-full bg-white/30 border-2 border-dashed border-slate-300 rounded-lg backdrop-blur-[1px]" />
            
            {/* Content Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white/20 border-2 border-dashed border-slate-300 rounded-lg" />
              <div className="bg-white/20 border-2 border-dashed border-slate-300 rounded-lg" />
              <div className="bg-white/20 border-2 border-dashed border-slate-300 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Unified Shimmer Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
          backgroundSize: '50% 100%',
          backgroundRepeat: 'no-repeat',
          animation: 'shimmer 2.5s infinite linear'
        }}
      />

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: -150% 0; }
          100% { background-position: 150% 0; }
        }
      `}</style>
    </div>
  );
}
