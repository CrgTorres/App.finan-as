"use client";

import { useRef, useState } from "react";
import { Upload, FileText, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFile: (file: File) => void;
  loading: boolean;
}

const ACCEPTED = ".csv,.txt,.pdf,.ofx,.qif,.xml,.XML";
const ACCEPTED_TYPES = [
  "text/csv",
  "application/pdf",
  "text/plain",
  "application/xml",
  "text/xml",
  "application/octet-stream",
];

export function FileDropzone({ onFile, loading }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file: File) {
    if (!file) return;
    onFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !loading && inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-all select-none",
        dragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/40",
        loading && "pointer-events-none opacity-60"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl">
          <Upload className="h-7 w-7 text-blue-500" />
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {dragging ? "Solte o arquivo aqui" : "Arraste o extrato bancário ou clique para selecionar"}
        </p>
        <p className="text-xs text-slate-400">
          Formatos aceitos: CSV, TXT, PDF, OFX, QIF, XML
        </p>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" />
          CSV
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <FileText className="h-3.5 w-3.5 text-red-500" />
          PDF
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <FileText className="h-3.5 w-3.5 text-blue-500" />
          OFX / QIF
        </div>
      </div>
    </div>
  );
}
