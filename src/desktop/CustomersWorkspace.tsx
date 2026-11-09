import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Session = { staffId: string; displayName: string; role: string; branchId: string | null };
type Sale = { id: string; receiptNumber: string; total: number; paymentMethod: string; createdAt: string };
type Customer = {
  id: string; name: string; phone: string; email: string; address: string; kraPin: string;
  notes: string; active: boolean; salesCount: number; totalSpend: number;
  lastPurchaseAt: string | null; history: Sale[];
};
type Workspace = { role: string; assignedBranchId: string | null; customers: Customer[] };
type CustomerForm = { name: string; phone: string; email: string; address: string; kraPin: string; notes: string };
const emptyForm: CustomerForm = { name: '', phone: '', email: '', address: '', kraPin: '', notes: '' };

export default function CustomersWorkspace({ session }: { session: Session }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const data = await invoke<Workspace>('get_customers_workspace', { actorStaffId: session.staffId });
    setWorkspace({ ...data, customers: Array.isArray(data.customers) ? data.customers : [] });
  }
  useEffect(() => { load().catch(e => setError(String(e).replace(/^Error: /, ''))); }, [session.staffId]);

  const customers = workspace?.customers || [];
  const filtered = useMemo(() => customers.filter(c =>
    (c.name + ' ' + c.phone + ' ' + c.email).toLowerCase().includes(search.toLowerCase())
  ), [customers, search]);
  const selected = customers.find(c => c.id === selectedId) || null;
  const canDeactivate = ['Business Owner', 'Manager'].includes(session.role);

  function edit(customer: Customer) {
    setEditingId(customer.id);
    setForm({ name: customer.name || '', phone: customer.phone || '', email: customer.email || '', address: customer.address || '', kraPin: customer.kraPin || '', notes: customer.notes || '' });
    setSelectedId(customer.id);
  }
  function clear() { setEditingId(null); setForm(emptyForm); }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await invoke('save_customer', { actorStaffId: session.staffId, id: editingId, ...form });
      await load(); setNotice(editingId ? 'Customer details updated.' : 'Customer added to this business.');
      clear();
    } catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }
  async function toggleStatus(customer: Customer) {
    setBusy(true); setError(''); setNotice('');
    try {
      await invoke('set_customer_status', { actorStaffId: session.staffId, customerId: customer.id, active: !customer.active });
      await load(); setNotice(customer.active ? 'Customer deactivated. Their transaction history has been retained.' : 'Customer reactivated.');
    } catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }

  if (!workspace) return <section className="content-card"><p>{error || 'Loading customer records…'}</p></section>;

  return <div className="customers-workspace">
    <div className="pos-topline">
      <div><span className="eyebrow">CUSTOMER RELATIONSHIPS</span><h2>Customers</h2><p className="muted">Customer records and purchase history are stored in this computer's local database.</p></div>
      <div className="customer-count"><strong>{customers.length}</strong><span>Customer records</span></div>
    </div>
    {error && <p className="error global-message">{error}</p>}
    {notice && <p className="success global-message">{notice}</p>}
    <div className="customer-layout">
      <section className="content-card">
        <div className="section-heading"><div><h3>{editingId ? 'Edit customer' : 'Add a customer'}</h3><p>Name and phone number are required.</p></div></div>
        <form className="customer-form" onSubmit={save}>
          <label>Customer name *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required minLength={2} maxLength={160} placeholder="Full name or business name"/></label>
          <label>Phone number *<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required maxLength={40} placeholder="+254…"/></label>
          <label>Email address<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} maxLength={160}/></label>
          <label>KRA PIN<input value={form.kraPin} onChange={e=>setForm({...form,kraPin:e.target.value.toUpperCase()})} maxLength={30}/></label>
          <label className="wide">Address / location<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} maxLength={240}/></label>
          <label className="wide">Notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3} maxLength={1000}/></label>
          <div className="customer-form-actions"><button type="button" className="secondary" onClick={clear}>Clear</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add customer'}</button></div>
        </form>
      </section>
      <section className="content-card">
        <div className="section-heading"><div><h3>Customer directory</h3><p>Search by name, phone or email.</p></div><span className="count-pill">{filtered.length} shown</span></div>
        <input className="pos-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customers…"/>
        <div className="customer-list">
          {filtered.map(c=><button type="button" className={selectedId===c.id?'customer-list-item selected':'customer-list-item'} key={c.id} onClick={()=>setSelectedId(c.id)}>
            <span className="customer-avatar">{c.name.slice(0,1).toUpperCase()}</span><span className="customer-list-copy"><strong>{c.name}</strong><small>{c.phone} · {c.email || 'No email'}</small></span><span className={c.active?'customer-status active':'customer-status'}>{c.active?'Active':'Inactive'}</span>
          </button>)}
          {!filtered.length && <div className="empty-state">No customers match this search. Add a new customer using the form.</div>}
        </div>
      </section>
    </div>
    {selected && <section className="content-card customer-profile">
      <div className="section-heading"><div><span className="eyebrow">CUSTOMER PROFILE</span><h3>{selected.name}</h3><p>{selected.phone} · {selected.email || 'No email address'} · {selected.address || 'No address recorded'}</p></div><div className="customer-profile-actions"><button className="secondary" onClick={()=>edit(selected)}>Edit details</button>{canDeactivate && <button className="secondary" disabled={busy} onClick={()=>toggleStatus(selected)}>{selected.active?'Deactivate':'Reactivate'}</button>}</div></div>
      <div className="customer-metrics"><article><span>Linked sales</span><strong>{selected.salesCount}</strong></article><article><span>Total spend</span><strong>KSh {Number(selected.totalSpend).toLocaleString('en-KE',{maximumFractionDigits:2})}</strong></article><article><span>Last purchase</span><strong>{selected.lastPurchaseAt?new Date(selected.lastPurchaseAt).toLocaleDateString('en-KE'):'No purchases yet'}</strong></article></div>
      <div className="section-heading"><div><h3>Recent purchase history</h3><p>Latest 10 completed sales linked to this customer.</p></div></div>
      {selected.history.length ? <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Payment</th><th>Total</th></tr></thead><tbody>{selected.history.map(s=><tr key={s.id}><td>{s.receiptNumber}</td><td>{new Date(s.createdAt).toLocaleString()}</td><td>{s.paymentMethod}</td><td>KSh {Number(s.total).toLocaleString('en-KE',{maximumFractionDigits:2})}</td></tr>)}</tbody></table></div> : <div className="empty-state">No linked sales yet. Select this customer during checkout to build their purchase history.</div>}
      {selected.kraPin && <p className="customer-meta"><strong>KRA PIN:</strong> {selected.kraPin}</p>}
      {selected.notes && <p className="customer-meta"><strong>Notes:</strong> {selected.notes}</p>}
    </section>}
  </div>;
}
