import { useState } from "react";
import { Code2, Copy, Check, ChevronDown, Database, ArrowRight } from "lucide-react";

/**
 * Shows the SQL the backend executed for this screen.
 * v2: pass `meta` (the API response) to also show the full flow
 *   Front end -> SQL -> Oracle (as <db_user>) -> N rows in X ms
 * which is exactly the "Front End -> SQL Query -> Database -> Result"
 * chain the project brief asks to demonstrate.
 */
export default function SqlPanel({ sql, meta, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  if (!sql) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  }

  const rows = meta?.row_count ?? (Array.isArray(meta?.results) ? meta.results.length : meta?.rows_affected);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="inline-flex items-center gap-1.5 bg-surface border border-border-strong text-accent-strong rounded-md px-3 py-1.5 text-[0.78rem] hover:bg-accent-soft transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          <Code2 size={14} />
          {open ? "Hide" : "Show"} SQL executed
          <ChevronDown size={13} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {meta && (meta.db_user || meta.elapsed_ms != null) && (
          <span className="inline-flex items-center gap-1.5 text-[0.72rem] text-ink-muted bg-surface-2 border border-border rounded-full px-2.5 py-1">
            UI <ArrowRight size={11} /> SQL <ArrowRight size={11} />
            <Database size={11} className="text-accent" /> Oracle
            {meta.db_user && <> as <strong className="font-mono text-ink-soft">{String(meta.db_user).toLowerCase()}</strong></>}
            <ArrowRight size={11} />
            {rows != null && <>{rows} row{rows === 1 ? "" : "s"}</>}
            {meta.elapsed_ms != null && <> in {meta.elapsed_ms} ms</>}
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2.5 rounded-lg bg-structure border border-structure-3 p-4">
          <div className="flex justify-between items-start gap-4">
            <pre className="m-0 flex-1 font-mono text-[0.82rem] text-[#d9ece8] whitespace-pre-wrap break-words">{sql}</pre>
            <button
              className="inline-flex items-center gap-1.5 bg-transparent border border-[#3a5a54] text-[#d9ece8] rounded-md px-2.5 py-1.5 text-xs hover:bg-white/5 transition-colors"
              onClick={copy}
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
