import { X } from "lucide-react";

export default function Modal({ title, open, onClose, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9000] flex items-start justify-center p-4 pt-16 bg-black/40 animate-fade" onClick={onClose}>
      <div
        className={`bg-surface rounded-xl shadow-xl border border-border w-full ${wide ? "max-w-3xl" : "max-w-xl"} max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="font-display text-lg m-0">{title}</h3>
          <button className="p-1.5 rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
