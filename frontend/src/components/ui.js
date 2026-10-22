// Shared Tailwind class strings (same look as the existing pages)
export const inputCls = "w-full rounded-md border border-border-strong px-3 py-2 text-sm bg-surface focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition";
export const panelCls = "bg-surface border border-border rounded-xl p-5 mb-5 shadow-sm";
export const panelHeadCls = "flex justify-between items-center gap-3 flex-wrap mb-4 pb-3 border-b border-border";
export const btnPrimary = "inline-flex items-center gap-1.5 bg-accent hover:bg-accent-strong text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
export const btnGhost = "inline-flex items-center gap-1.5 bg-surface border border-border-strong text-accent-strong rounded-md px-3 py-2 text-sm hover:bg-accent-soft transition-colors disabled:opacity-50";
export const btnSmall = "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors disabled:opacity-40";
export const btnDanger = btnSmall + " border-[#f0c9be] text-urgent hover:bg-urgent-soft";
export const btnSmallGhost = btnSmall + " border-border-strong text-accent-strong hover:bg-accent-soft";
