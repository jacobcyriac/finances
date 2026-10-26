import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChartNoAxesColumnIncreasing, Github, LoaderCircle } from 'lucide-react';
import { connect, tryDemo, importZip } from '../api/client';
import { normalizeServerURL } from '../lib/url';
import { ACTUAL_SERVER_URL, ACTUAL_SYNC_ID } from '../config';
import type { ConnectRequest } from '../types';

const FIELDS: {
  key: keyof ConnectRequest;
  label: string;
  type: string;
  placeholder: string;
  optional?: boolean;
  hint?: string;
}[] = [
  { key: 'password', label: 'Password', type: 'password', placeholder: 'Your server password' },
  { key: 'encryptionKey', label: 'End-to-end encryption key', type: 'password', placeholder: 'Only if your file is encrypted', optional: true },
];

export function Login({ onConnected }: { onConnected: (credentials: ConnectRequest | null) => void }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ConnectRequest>(() => ({
    serverURL: normalizeServerURL(ACTUAL_SERVER_URL),
    password: '',
    syncId: ACTUAL_SYNC_ID,
    encryptionKey: '',
  }));

  const done = (credentials: ConnectRequest | null = null) => {
    qc.invalidateQueries({ queryKey: ['snapshot'] });
    onConnected(credentials);
  };

  const mutation = useMutation({
    mutationFn: (credentials: ConnectRequest) => connect(credentials),
    onSuccess: (_data, credentials) => done(credentials),
  });

  const demoMutation = useMutation({
    mutationFn: () => tryDemo(),
    onSuccess: () => done(null),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => importZip(file),
    onSuccess: () => done(null),
  });

  const busy =
    mutation.isPending || demoMutation.isPending || importMutation.isPending;
  const canSubmit = form.serverURL && form.password && form.syncId && !busy;

  return (
    <div className="grid min-h-full place-items-center px-5 py-12">
      <div className="w-full max-w-md rise">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 8px 30px -8px var(--brand-shadow-strong)' }}>
            <ChartNoAxesColumnIncreasing size={22} strokeWidth={2.2} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Financial Analysis</h1>
          <p className="mt-2 text-sm text-[var(--text-dim)]">
            Connect your Actual budget. Read-only, runs entirely on your machine.
          </p>
        </div>

        <form
          className="panel space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate(form);
          }}
        >
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1.5 flex items-baseline justify-between">
                <span className="label">{f.label}</span>
                {f.optional && <span className="text-xs text-[var(--text-faint)]">optional</span>}
              </label>
              <input
                className="input"
                type={f.type}
                autoComplete="off"
                data-1p-ignore
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
              {f.hint && <p className="mt-1 text-xs text-[var(--text-faint)]">{f.hint}</p>}
            </div>
          ))}

          <ErrorNote error={mutation.error} />

          <button className="btn-primary w-full" type="submit" disabled={!canSubmit}>
            {mutation.isPending ? (
              <>
                <Spinner /> Connecting & downloading budget…
              </>
            ) : (
              'Analyze my finances'
            )}
          </button>
        </form>

        <div className="mt-5">
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
            <span className="text-xs uppercase tracking-wider text-[var(--text-faint)]">or</span>
            <span className="h-px flex-1" style={{ background: 'var(--line)' }} />
          </div>

          <button
            type="button"
            className="btn-ghost mt-4 w-full"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {importMutation.isPending ? (
              <>
                <Spinner /> Importing budget file…
              </>
            ) : (
              'Import a budget file'
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so selecting the same file again still fires onChange.
              e.target.value = '';
              if (file) importMutation.mutate(file);
            }}
          />
          <p className="mt-2 text-center text-xs text-[var(--text-faint)]">
            Upload an Actual export (.zip) — analyzed on your machine, offline.
          </p>

          <ErrorNote error={importMutation.error} className="mt-3" />

          <button
            type="button"
            className="btn-ghost mt-3 w-full"
            disabled={busy}
            onClick={() => demoMutation.mutate()}
          >
            {demoMutation.isPending ? (
              <>
                <Spinner /> Loading demo…
              </>
            ) : (
              'Try the demo'
            )}
          </button>
          <p className="mt-2 text-center text-xs text-[var(--text-faint)]">
            Explore with sample data — no account needed.
          </p>

          <ErrorNote error={demoMutation.error} className="mt-3" />
        </div>

        <p className="mt-5 text-center text-xs leading-relaxed text-[var(--text-faint)]">
          This browser remembers your password and optional encryption key so you can reconnect
          after reopening the dashboard. Disconnect clears them. Scripts
          running on this dashboard origin can access these saved credentials. Budget data stays
          in this browser, and the Actual engine keeps its local cache on this device.
        </p>

        <p className="mt-3 text-center text-xs text-[var(--text-faint)]">
          <a
            className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--text-dim)]"
            href="https://github.com/jacobcyriac/finances"
            target="_blank"
            rel="noreferrer noopener"
          >
            <Github size={13} aria-hidden="true" />
            View source on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}

function ErrorNote({ error, className = '' }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <div
      className={`rounded-[0.7rem] px-3.5 py-2.5 text-sm ${className}`}
      style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-text)' }}
    >
      {(error as Error).message}
    </div>
  );
}

function Spinner() {
  return (
    <LoaderCircle className="animate-spin" size={15} stroke="var(--on-brand)" aria-hidden="true" />
  );
}
