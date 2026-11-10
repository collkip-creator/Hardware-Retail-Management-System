import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type AuditEvent = {
  id: string; createdAt: string; staff: string; eventType: string;
  entityType: string; entityId: string; details: Record<string, unknown>;
  branchId: string | null; branchName: string;
};
type Branch = { id: string; name: string };
type Result = { events: AuditEvent[]; branches: Branch[]; limit: number };

const today = () => new Date().toISOString().slice(0, 10);
const firstDay = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const readable = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const detailText = (details: Record<string, unknown>) => Object.entries(details)
  .filter(([key]) => key !== 'approvedByName')
  .map(([key, value]) => {
    const label = key === 'approvedBy' ? 'Approved by' : readable(key);
    const display = key === 'approvedBy' && typeof details.approvedByName === 'string'
      ? details.approvedByName
      : value;
    return label + ': ' + (typeof display === 'object' ? JSON.stringify(display) : String(display));
  })
  .join(' · ');

export default function AuditTrailWorkspace({ actorStaffId }: { actorStaffId: string }) {
  const [result, setResult] = useState<Result>({ events: [], branches: [], limit: 2000 });
  const [startDate, setStartDate] = useState(firstDay());
  const [endDate, setEndDate] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [eventType, setEventType] = useState('');
  const [staffName, setStaffName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try {
      const data = await invoke<Result>('get_audit_trail', {
        actorStaffId, startDate, endDate,
        branchId: branchId || null, eventType: eventType || null
      });
      setResult(data); setLoaded(true);
    } catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, [actorStaffId]);

  const eventTypes = useMemo(() => Array.from(new Set(result.events.map(e => e.eventType))).sort(), [result.events]);
  const staffNames = useMemo(() => Array.from(new Set(result.events.map(e => e.staff))).sort(), [result.events]);
  const visible = useMemo(() => result.events.filter(e => !staffName || e.staff === staffName), [result.events, staffName]);

  function exportCsv() {
    const rows = [
      ['Date and time', 'Staff member', 'Action', 'Record type', 'Record ID', 'Branch', 'Details'],
      ...visible.map(e => [e.createdAt, e.staff, e.eventType, e.entityType, e.entityId, e.branchName, detailText(e.details)])
    ];
    const csv = rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'hardware-retail-audit-trail.csv'; link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="audit-workspace">
    <section className="content-card">
      <div className="section-heading"><div><h2>Audit Trail</h2><p>Read-only history of important actions recorded on this computer.</p></div><button className="secondary" type="button" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : '↻ Refresh'}</button></div>
      <div className="form-grid audit-filters">
        <label>From date<input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>To date<input type="date" value={endDate} min={startDate} max={today()} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">All branches</option>{result.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Action type<select value={eventType} onChange={e=>setEventType(e.target.value)}><option value="">All actions</option>{eventTypes.map(t=><option key={t} value={t}>{readable(t)}</option>)}</select></label>
        <label>Staff member<select value={staffName} onChange={e=>setStaffName(e.target.value)}><option value="">All staff</option>{staffNames.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <div className="audit-filter-actions"><button className="primary" type="button" onClick={load} disabled={busy || !startDate || !endDate}>Apply filters</button><button className="secondary" type="button" onClick={exportCsv} disabled={!visible.length}>Export CSV</button></div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="audit-summary"><strong>{visible.length.toLocaleString()} event(s)</strong><span>{loaded ? 'Showing recorded activity for the selected period' : 'Loading audit history…'}</span></div>
      {!busy && visible.length === 0 ? <div className="empty-state">No audit events were found for these filters.</div> :
        <div className="table-wrap"><table className="audit-table"><thead><tr><th>Date & time</th><th>Staff member</th><th>Action</th><th>Record</th><th>Branch</th><th>Details</th></tr></thead><tbody>
          {visible.map(e=><tr key={e.id}><td className="audit-date">{new Date(e.createdAt.replace(' ', 'T') + (e.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString()}</td><td>{e.staff}</td><td><strong>{readable(e.eventType)}</strong></td><td>{readable(e.entityType)}<small>{e.entityId}</small></td><td>{e.branchName || '—'}</td><td className="audit-details">{detailText(e.details) || '—'}</td></tr>)}
        </tbody></table></div>}
      <p className="muted audit-footnote">Audit history is read-only. Up to {result.limit.toLocaleString()} events are returned per query. Some older or unscoped records may not contain branch details.</p>
    </section>
  </div>;
}
