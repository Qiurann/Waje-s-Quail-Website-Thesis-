import React from 'react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-[#2D5016] via-[#3d6b1f] to-[#2D5016]">
      <div className="mb-8 relative">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl animate-bounce">
          <img src="/logo_quailfarm.png" alt="Logo" className="w-16 h-16 object-contain" />
        </div>
        <div className="w-16 h-2 bg-black/20 rounded-full blur-sm mx-auto mt-4 animate-pulse" />
      </div>
      <div className="w-64">
        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white animate-progress origin-left" />
        </div>
        <p className="text-white/80 text-xs mt-3 font-semibold text-center uppercase tracking-widest animate-pulse">
          Loading Farm Management
        </p>
      </div>
    </div>
  );
}