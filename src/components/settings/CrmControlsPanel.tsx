'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';

type Settings = Record<string, string>;

const SURCHARGES: Array<[string, string]> = [
  ['payments.surcharge.payment_link', 'Payment link'],
  ['payments.surcharge.pos', 'POS machine'],
  ['payments.surcharge.tabby', 'Tabby'],
  ['payments.surcharge.tamara', 'Tamara'],
];

// CEO-adjustable CRM controls: office-network lock, overdue e-mail threshold, reminder lead time, payment surcharges.
export default function CrmControlsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [yourIp, setYourIp] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/app-settings')
      .then((r) => r.json())
      .then((j) => { setSettings(j.settings); setYourIp(j.yourIp || ''); setCanEdit(!!j.canEdit); })
      .catch(() => setMsg({ ok: false, text: 'Failed to load CRM controls' }));
  }, []);

  if (!settings) return <p className="text-sm text-slate-500">{msg ? msg.text : 'Loading…'}</p>;
  const set = (key: string, value: string) => setSettings((p) => ({ ...(p as Settings), [key]: value }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/app-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to save');
      setSettings(j.settings);
      setMsg({ ok: true, text: 'CRM controls saved.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-28 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50';
  return (
    <div className="space-y-6">
      {!canEdit && <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Only the CEO can change these controls.</p>}
      {msg && <div className={`rounded-md border px-4 py-3 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{msg.text}</div>}

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Office network lock</h3>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" disabled={!canEdit} checked={settings['security.office_network_only'] === '1'} onChange={(e) => set('security.office_network_only', e.target.checked ? '1' : '0')} />
          Allow CRM sign-in only from the office Wi-Fi (CEO / Chairman are always exempt)
        </label>
        <div>
          <label className="mb-1 block text-sm text-slate-600">Allowed office public IPs / CIDR ranges (one per line)</label>
          <textarea disabled={!canEdit} rows={3} value={settings['security.office_allowed_ips']} onChange={(e) => set('security.office_allowed_ips', e.target.value)} className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-50" placeholder="203.0.113.10" />
          <p className="mt-1 text-xs text-slate-500">
            Your current IP: <strong>{yourIp || 'unknown'}</strong>{' '}
            {canEdit && yourIp && yourIp !== 'unknown' && (
              <button type="button" className="text-blue-600 underline" onClick={() => set('security.office_allowed_ips', [settings['security.office_allowed_ips'], yourIp].filter(Boolean).join('\n'))}>add it</button>
            )}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Overdue follow-up e-mail</h3>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" disabled={!canEdit} checked={settings['alerts.overdue_email_enabled'] === '1'} onChange={(e) => set('alerts.overdue_email_enabled', e.target.checked ? '1' : '0')} />
          E-mail the counselor and branch manager when a follow-up stays overdue
        </label>
        <label className="flex items-center gap-2 text-sm">Send after
          <input type="number" min={0.5} max={24} step={0.5} disabled={!canEdit} value={settings['alerts.overdue_email_hours']} onChange={(e) => set('alerts.overdue_email_hours', e.target.value)} className={input} /> hours overdue (0.5 to 24; typically 2 to 3)
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Meeting / follow-up reminder</h3>
        <label className="flex items-center gap-2 text-sm">Show a persistent reminder
          <input type="number" min={1} max={240} disabled={!canEdit} value={settings['alerts.meeting_toast_minutes']} onChange={(e) => set('alerts.meeting_toast_minutes', e.target.value)} className={input} /> minutes before
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-slate-900">Payment method surcharge (added when the payment is extra)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {SURCHARGES.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">{label}
              <input type="number" min={0} max={50} step={0.01} disabled={!canEdit} value={settings[key]} onChange={(e) => set(key, e.target.value)} className={input} /> %
            </label>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-500">The discount approval limits are set in Discount Approvals.</p>
      {canEdit && (
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save CRM controls'}
        </button>
      )}
    </div>
  );
}
