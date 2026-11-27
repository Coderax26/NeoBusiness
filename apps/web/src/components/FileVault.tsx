'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@neo/ui';

export interface FileVaultProps {
  entityType: string;
  entityId: string;
  title?: string;
}

interface AttachedFileRow {
  id: string;
  storage_key?: string;
  mime_type?: string;
  file_size_bytes?: number | null;
  created_at?: string;
}

export function FileVault({ entityType, entityId, title = 'Attached Documents' }: FileVaultProps) {
  const [files, setFiles] = useState<AttachedFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/files/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data?.files)
          ? data.files
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];
        setFiles(list);
      }
    } catch {
      /* ignore network failure */
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !entityId) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setUploading(true);
    try {
      const preRes = await fetch('/api/proxy/files/presign-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
        }),
      });
      const preData = await preRes.json().catch(() => null);
      if (!preRes.ok) {
        throw new Error(preData?.message || `Presign failed (HTTP ${preRes.status})`);
      }
      const fileKey = String(preData?.fileKey || `uploads/${Date.now()}/${file.name}`);

      const confirmRes = await fetch('/api/proxy/files/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          entityId,
          fileKey,
          mimeType: file.type || preData?.mimeType || 'application/octet-stream',
          fileSizeBytes: file.size,
        }),
      });
      const confirmData = await confirmRes.json().catch(() => null);
      if (!confirmRes.ok) {
        throw new Error(confirmData?.message || `Confirm failed (HTTP ${confirmRes.status})`);
      }

      setSuccessMsg(`Attached ${file.name}.`);
      await loadFiles();
    } catch (err) {
      setErrorMsg((err as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="rounded-[3px] border border-rule bg-sheet p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-ink">{title}</h4>
          <p className="text-[11px] text-ink-3">
            Stored against {entityType} ({files.length} file{files.length === 1 ? '' : 's'}).
          </p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            disabled={uploading || !entityId}
            onChange={handleFileChange}
          />
          <Button variant="secondary" size="sm" disabled={uploading || !entityId} type="button">
            {uploading ? 'Uploading...' : '+ Upload Document'}
          </Button>
        </label>
      </div>

      {errorMsg && (
        <div className="rounded-[3px] border border-madder/30 bg-madder-soft px-3 py-2 text-madder font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="rounded-[3px] border border-leaf/30 bg-leaf-soft px-3 py-2 text-leaf font-medium">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="text-ink-3 py-2">Loading attachments...</div>
      ) : files.length === 0 ? (
        <div className="rounded-[3px] border border-dashed border-rule bg-paper p-4 text-center text-ink-3">
          No documents attached yet. Use &ldquo;+ Upload Document&rdquo; to register KYC, challan, or contract files.
        </div>
      ) : (
        <ul className="divide-y divide-rule rounded-[3px] border border-rule bg-paper">
          {files.map((f) => {
            const rawKey = String(f.storage_key || f.id);
            const displayName = rawKey.split('/').pop() || rawKey;
            const kb = f.file_size_bytes ? `${Math.max(1, Math.round(f.file_size_bytes / 1024))} KB` : '';
            return (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-mono font-semibold text-ink">{displayName}</div>
                  <div className="text-[11px] text-ink-3">
                    {f.mime_type || 'application/octet-stream'}
                    {kb ? ` · ${kb}` : ''}
                    {f.created_at ? ` · ${String(f.created_at).slice(0, 10)}` : ''}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-sunken px-2 py-0.5 font-mono text-[10px] text-ink-2">
                  ATTACHED
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
