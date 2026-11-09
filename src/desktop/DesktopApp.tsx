import { FormEvent, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type LocalStatus = { setupRequired: boolean; deviceId: string; staffCount: number; schemaVersion: number };
type StaffSession = { staffId: string; username: string; displayName: string; role: string; branchId: string | null; mustChangePassword?: boolean };
type BusinessProfile = { id: string; name: string; currency: string; timezone: string; phone: string | null; email: string | null; address: string | null; logoDataUrl: string | null };
type Branch = { id: string; name: string; code: string | null; status: string };
type Staff = { staffId: string; displayName: string; role: string; branchId: string | null; username: string; status: string; mustChangePassword: boolean };
type Device = { id: string; deviceName: string; deviceType: string; status: string; lastSeenAt: string };
type Tab = 'overview' | 'business' | 'branches' | 'staff' | 'devices';
type SyncStatus = { paired: boolean; ownerDevice: boolean; lastSyncAt: string | null };
type SyncResult = { ownerDevice: boolean; updatedAt: string; branches: number; staff: number };
type PairingCodeResult = { code: string; expiresAt: string; ownerDevice: boolean };

export default function DesktopApp() {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Cashier');
  const [newStaffBranch, setNewStaffBranch] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ paired: false, ownerDevice: false, lastSyncAt: null });
  const [pairingCode, setPairingCode] = useState('');
  const [pairingResult, setPairingResult] = useState<PairingCodeResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const initialise = async () => {
      try {
        let local = await invoke<LocalStatus>('get_local_status');
        const sync = await invoke<SyncStatus>('get_device_sync_status');
        setSyncStatus(sync);
        if (sync.paired && navigator.onLine) {
          try {
            const result = await invoke<SyncResult>('sync_desktop_workspace');
            setSyncStatus({ ...sync, lastSyncAt: result.updatedAt });
            local = await invoke<LocalStatus>('get_local_status');
          } catch (syncError) { setError('Cloud sync is pending: ' + String(syncError)); }
        }
        setStatus(local);
      } catch (e) { setError(String(e)); }
      finally { setLoading(false); }
    };
    initialise();
    const onOnline = () => setOnline(true), onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  async function refreshWorkspace(actorId: string) {
    const [profile, branchRows, staffRows, deviceRows, localStatus] = await Promise.all([
      invoke<BusinessProfile>('get_business_profile', { actorId }),
      invoke<Branch[]>('list_branches', { actorId }),
      invoke<Staff[]>('list_staff', { actorId }),
      invoke<Device[]>('list_devices', { actorId }),
      invoke<LocalStatus>('get_local_status'),
    ]);
    setBusiness(profile); setBranches(branchRows); setStaff(staffRows); setDevices(deviceRows); setStatus(localStatus);
  }

  useEffect(() => {
    if (session?.role === 'Business Owner') refreshWorkspace(session.staffId).catch((e) => setError(String(e)));
  }, [session?.staffId]);

  async function syncIfPaired() {
    const current = await invoke<SyncStatus>('get_device_sync_status');
    setSyncStatus(current);
    if (!current.paired || !navigator.onLine) return;
    const result = await invoke<SyncResult>('sync_desktop_workspace');
    setSyncStatus({ ...current, lastSyncAt: result.updatedAt });
  }

  async function pairThisComputer(event?: FormEvent) {
    event?.preventDefault(); setError(''); setNotice(''); setSyncing(true);
    try {
      if (!navigator.onLine) throw new Error('Connect this computer to the internet before pairing.');
      await invoke('pair_desktop_device', { pairingCode: pairingCode.trim(), deviceName: 'Windows desktop' });
      setPairingCode('');
      const result = await invoke<SyncResult>('sync_desktop_workspace');
      const next = await invoke<SyncStatus>('get_device_sync_status');
      setSyncStatus({ ...next, lastSyncAt: result.updatedAt });
      setStatus(await invoke<LocalStatus>('get_local_status'));
      if (session?.role === 'Business Owner') await refreshWorkspace(session.staffId);
      setNotice(result.ownerDevice ? 'This is now the primary owner computer. Business and staff data have been uploaded securely.' : 'This computer has been paired and the latest staff accounts and business setup have been downloaded.');
    } catch (e) {
      const next = await invoke<SyncStatus>('get_device_sync_status').catch(() => syncStatus);
      setSyncStatus(next); setError(String(e).replace(/^Error: /, ''));
    } finally { setSyncing(false); }
  }

  async function generatePairingCode() {
    setError(''); setNotice(''); setSyncing(true); setPairingResult(null);
    try {
      if (!navigator.onLine) throw new Error('Connect this primary computer to the internet to generate a pairing code.');
      const result = await invoke<PairingCodeResult>('generate_desktop_pairing_code');
      setPairingResult(result);
      setNotice('A one-time pairing code has been generated. It expires in 10 minutes.');
    } catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setSyncing(false); }
  }

  async function syncNow() {
    setError(''); setNotice(''); setSyncing(true);
    try {
      const result = await invoke<SyncResult>('sync_desktop_workspace');
      const next = await invoke<SyncStatus>('get_device_sync_status');
      setSyncStatus({ ...next, lastSyncAt: result.updatedAt });
      setStatus(await invoke<LocalStatus>('get_local_status'));
      if (session?.role === 'Business Owner') await refreshWorkspace(session.staffId);
      setNotice(`Sync complete. ${result.branches} branch(es) and ${result.staff} staff account(s) are in the cloud snapshot.`);
    } catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setSyncing(false); }
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = status?.setupRequired
        ? await invoke<StaffSession>('setup_owner', { displayName, username, password })
        : await invoke<StaffSession>('login_staff', { username, password });
      setSession(result); setPassword('');
      setStatus(await invoke<LocalStatus>('get_local_status'));
      const sync = await invoke<SyncStatus>('get_device_sync_status'); setSyncStatus(sync);
      if (sync.paired && navigator.onLine) { try { const result = await invoke<SyncResult>('sync_desktop_workspace'); setSyncStatus({ ...sync, lastSyncAt: result.updatedAt }); } catch (syncError) { setError('Cloud sync is pending: ' + String(syncError)); } }
    } catch (reason) { setError(String(reason).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }

  async function saveBusiness(event: FormEvent) {
    event.preventDefault(); if (!session || !business) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await invoke('save_business_profile', { actorId: session.staffId, name: business.name, phone: business.phone || null, email: business.email || null, address: business.address || null, logoDataUrl: business.logoDataUrl || null, currency: business.currency, timezone: business.timezone });
      await syncIfPaired();
      setNotice('Business profile saved on this computer' + (syncStatus.paired ? ' and synchronised.' : '.'));
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function addBranch(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await invoke<Branch>('create_branch', { actorId: session.staffId, name: branchName, code: branchCode });
      setBranchName(''); setBranchCode(''); await syncIfPaired(); await refreshWorkspace(session.staffId); setNotice('Branch created successfully.');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  async function addStaff(event: FormEvent) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(''); setNotice(''); setCredentials(null);
    try {
      const result = await invoke<{ username: string; temporaryPassword: string }>('create_staff', { actorId: session.staffId, displayName: newStaffName, role: newStaffRole, branchId: newStaffBranch || null });
      setCredentials(result); setNewStaffName(''); await syncIfPaired(); await refreshWorkspace(session.staffId); setNotice('Staff account created. Copy the temporary password now; it will not be shown again.');
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  if (loading) return <main className="screen"><div className="loading">Preparing your local workspace…</div></main>;
  if (!status) return <main className="screen"><section className="panel narrow"><Brand /><h1>Unable to open local workspace</h1><p className="muted">The local database could not be initialised. Your existing cloud workspace has not been changed.</p><p className="error">{error}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button></section></main>;

  if (!session) return (
    <main className="screen"><section className="panel narrow"><Brand />
      <div className="status-line"><span className={online ? 'dot online' : 'dot offline'} />{online ? 'Internet available' : 'Offline mode'} <span>· Local database ready</span></div>
      <h1>{status.setupRequired ? 'Set up this computer' : 'Sign in to your business'}</h1>
      <p className="muted">{status.setupRequired ? 'Create the first Business Owner account. Your account is stored securely on this computer.' : 'Sign in using your local staff username and password. Offline sign-in is supported after the account is registered on this computer.'}</p>
      <form onSubmit={submitLogin}>
        {status.setupRequired && <label>Your name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoComplete="name" required minLength={2} maxLength={100}/></label>}
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={40}/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={status.setupRequired?'new-password':'current-password'} required minLength={status.setupRequired?12:1} maxLength={128}/>{status.setupRequired&&<small>Use at least 12 characters.</small>}</label>
        {error&&<p className="error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy?'Please wait…':status.setupRequired?'Create owner account':'Sign in'}</button>
      </form>
      <div className="pair-device-card">
        <h2>Already have a business?</h2>
        <p>Enter the one-time code generated by the Business Owner on the primary computer. Staff accounts will be downloaded for offline sign-in.</p>
        <form onSubmit={pairThisComputer}>
          <label>8-digit pairing code<input value={pairingCode} onChange={e=>setPairingCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" maxLength={8} placeholder="Enter pairing code" required/></label>
          <button className="secondary" type="submit" disabled={syncing || pairingCode.length!==8 || !online}>{syncing?'Pairing and syncing…':'Pair this computer'}</button>
        </form>
        {syncStatus.paired&&<button className="secondary" onClick={syncNow} disabled={syncing || !online}>{syncing?'Syncing…':'Sync now'}</button>}
      </div>
      <div className="footnote">Device ID: {status.deviceId}</div>
    </section></main>
  );


  if (session.mustChangePassword) return <main className="screen"><section className="panel narrow"><Brand/><h1>Change your temporary password</h1><p className="muted">Your owner provided a temporary password. Set a new password before continuing.</p><form onSubmit={async (event)=>{event.preventDefault();setError('');if(newPassword!==confirmPassword){setError('The new passwords do not match.');return;}setBusy(true);try{await invoke('change_staff_password',{staffId:session.staffId,currentPassword,newPassword});try{const sync=await invoke<SyncResult>('sync_desktop_workspace');const syncState=await invoke<SyncStatus>('get_device_sync_status');setSyncStatus({...syncState,lastSyncAt:sync.updatedAt});setNotice('Your new password has been synchronised securely.');}catch{setNotice('Your password has been changed on this computer. Cloud synchronisation will retry when internet is available.');}setSession({...session,mustChangePassword:false});setCurrentPassword('');setNewPassword('');setConfirmPassword('');}catch(e){setError(String(e));}finally{setBusy(false);}}}><label>Temporary password<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></label><label>New password<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={12} maxLength={128} required/><small>Use at least 12 characters.</small></label><label>Confirm new password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={12} maxLength={128} required/></label>{error&&<p className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Saving…':'Save new password'}</button></form><button className="secondary" onClick={()=>setSession(null)}>Sign out</button></section></main>;

  if (session.role !== 'Business Owner') return <main className="screen"><section className="panel narrow"><Brand/><h1>Welcome, {session.displayName}</h1><p className="muted">Your staff workspace will be enabled in the next desktop module release.</p><button className="secondary" onClick={()=>setSession(null)}>Sign out</button></section></main>;

  const updateBusiness = (key: keyof BusinessProfile, value: string) => setBusiness(current => current ? { ...current, [key]: value } : current);
  const nav: { id: Tab; label: string; icon: string }[] = [
    {id:'overview',label:'Overview',icon:'⌂'},{id:'business',label:'Business profile',icon:'▤'},{id:'branches',label:'Branches',icon:'⌖'},{id:'staff',label:'Staff & access',icon:'♙'},{id:'devices',label:'Devices',icon:'▣'}
  ];

  return <main className="app-shell">
    <aside className="sidebar"><Brand compact/><div className="side-caption">OWNER WORKSPACE</div>
      {nav.map(item=><button key={item.id} className={tab===item.id?'nav-item active':'nav-item'} onClick={()=>{setTab(item.id);setError('');setNotice('');}}><span>{item.icon}</span>{item.label}</button>)}
      <div className="side-bottom"><span className={online?'dot online':'dot offline'}/>{online?'Internet available':'Offline mode'}<small>Device {status.deviceId.slice(0,8)}…</small><button className="secondary signout" onClick={()=>setSession(null)}>Sign out</button></div>
    </aside>
    <section className="main-area"><header className="main-header"><div><span className="eyebrow">HARDWARE RETAIL MANAGEMENT</span><h1>{nav.find(n=>n.id===tab)?.label}</h1></div><div className="owner-chip"><span className="avatar">{session.displayName.slice(0,1).toUpperCase()}</span><span>{session.displayName}<small>Business Owner</small></span></div></header>
      {error&&<p className="error global-message">{error}</p>}{notice&&<p className="success global-message">{notice}</p>}
      {!business?<div className="panel"><p>Loading your business workspace…</p></div>:<>
      {tab==='overview'&&<><div className="welcome-card"><div><p className="eyebrow">YOUR BUSINESS WORKSPACE</p><h2>{business.name}</h2><p>Manage your business details, branches, staff accounts and authorised computers from one place.</p></div><div className="welcome-mark">HR</div></div>
        <div className="metric-grid"><Metric label="Branches" value={branches.length} hint="Registered locations"/><Metric label="Staff accounts" value={staff.length} hint="Local accounts on this device"/><Metric label="Authorised devices" value={devices.length} hint="Device records on this computer"/></div>
        <div className="section-heading"><div><h2>Getting started</h2><p>Complete these setup steps before daily operations.</p></div></div>
        <div className="setup-list"><SetupStep done={business.name!==`${session.displayName}'s Business`} title="Complete business profile" detail="Add your trading name and contact information" onClick={()=>setTab('business')}/><SetupStep done={branches.length>0} title="Register your first branch" detail="Create the main store or first outlet" onClick={()=>setTab('branches')}/><SetupStep done={staff.length>1} title="Add your team" detail="Create staff logins and assign their roles" onClick={()=>setTab('staff')}/></div>
      </>}
      {tab==='business'&&business&&<div className="content-card"><div className="section-heading"><div><h2>Business details</h2><p>These details identify your business in the desktop workspace.</p></div></div>
        <form className="form-grid" onSubmit={saveBusiness}><div className="wide logo-upload"><div className="logo-preview">{business.logoDataUrl?<img src={business.logoDataUrl} alt="Business logo"/>:<span>LOGO</span>}</div><label>Business logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>100*1024){setError("For reliable cloud sync, use a logo image of 100 KB or smaller.");return;}const reader=new FileReader();reader.onload=()=>updateBusiness("logoDataUrl",String(reader.result));reader.readAsDataURL(file);}}/><small>PNG, JPG or WebP · Maximum 100 KB</small></label>{business.logoDataUrl&&<button type="button" className="secondary" onClick={()=>updateBusiness("logoDataUrl","")}>Remove logo</button>}</div><label className="wide">Business / trading name<input value={business.name} onChange={e=>updateBusiness('name',e.target.value)} required minLength={2} maxLength={120}/></label><label>Phone number<input value={business.phone||''} onChange={e=>updateBusiness('phone',e.target.value)} placeholder="+254…"/></label><label>Email address<input type="email" value={business.email||''} onChange={e=>updateBusiness('email',e.target.value)} placeholder="name@business.co.ke"/></label><label className="wide">Business address<textarea value={business.address||''} onChange={e=>updateBusiness('address',e.target.value)} rows={3}/></label><label>Currency<select value={business.currency} onChange={e=>updateBusiness('currency',e.target.value)}><option value="KES">KES — Kenyan Shilling</option><option value="USD">USD — US Dollar</option><option value="UGX">UGX — Uganda Shilling</option><option value="TZS">TZS — Tanzania Shilling</option></select></label><label>Time zone<input value={business.timezone} onChange={e=>updateBusiness('timezone',e.target.value)} required/></label><div className="wide form-actions"><button className="primary" disabled={busy}>Save business profile</button></div></form>
      </div>}
      {tab==='branches'&&<><div className="content-card"><div className="section-heading"><div><h2>Add a branch</h2><p>Create the main store or another business location.</p></div></div><form className="inline-form" onSubmit={addBranch}><label>Branch name<input value={branchName} onChange={e=>setBranchName(e.target.value)} placeholder="e.g. Nakuru Main Store" required minLength={2}/></label><label>Branch code<input value={branchCode} onChange={e=>setBranchCode(e.target.value.toUpperCase())} placeholder="e.g. NKR01" required minLength={2} maxLength={12}/></label><button className="primary" disabled={busy}>Add branch</button></form></div><div className="content-card"><div className="section-heading"><div><h2>Registered branches</h2><p>{branches.length} branch(es) registered locally.</p></div></div>{branches.length===0?<Empty text="No branches yet. Add your first branch above."/>:<DataTable headers={['Branch name','Branch code','Status']} rows={branches.map(b=>[b.name,b.code||'—',b.status])}/>}</div></>}
      {tab==='staff'&&<><div className="content-card"><div className="section-heading"><div><h2>Create a staff account</h2><p>A temporary password is generated automatically. Staff must replace it with a new password at their first sign-in.</p></div></div><form className="form-grid" onSubmit={addStaff}><label className="wide">Staff member's full name<input value={newStaffName} onChange={e=>setNewStaffName(e.target.value)} required minLength={2} maxLength={100} placeholder="Enter full name"/></label><label>Role<select value={newStaffRole} onChange={e=>setNewStaffRole(e.target.value)}><option>Cashier</option><option>Storekeeper</option><option>Manager</option><option>Accountant</option><option>Supervisor</option></select></label><label>Assigned branch<select value={newStaffBranch} onChange={e=>setNewStaffBranch(e.target.value)}><option value="">No branch assigned</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label><div className="wide form-actions"><button className="primary" disabled={busy}>Generate staff credentials</button></div></form>
        {credentials&&<div className="credential-box"><h3>New staff login credentials</h3><p>Share these details securely with the staff member. The temporary password is displayed only this once.</p><div className="credential-line"><span>Username</span><strong>{credentials.username}</strong><button className="secondary" type="button" onClick={()=>navigator.clipboard.writeText(credentials.username)}>Copy</button></div><div className="credential-line"><span>Temporary password</span><strong>{credentials.temporaryPassword}</strong><button className="secondary" type="button" onClick={()=>navigator.clipboard.writeText(credentials.temporaryPassword)}>Copy</button></div><button className="secondary" onClick={()=>navigator.clipboard.writeText(`Username: ${credentials.username}\nTemporary password: ${credentials.temporaryPassword}`)}>Copy both credentials</button></div>}
      </div><div className="content-card"><div className="section-heading"><div><h2>Staff accounts</h2><p>{staff.length} account(s) stored on this computer.</p></div></div>{staff.length===0?<Empty text="No staff accounts have been created yet."/>:<DataTable headers={['Name','Username','Role','Status']} rows={staff.map(s=>[s.displayName,s.username,s.role,s.status])}/>}</div></>}
      {tab==='devices'&&<div className="content-card"><div className="section-heading"><div><h2>Computer devices</h2><p>Manage authorised computers for this business. Only the primary computer can generate pairing codes.</p></div></div>
        <div className="device-sync-status"><strong>{syncStatus.paired?'Paired with owner portal':'Not yet paired'}</strong><span>{syncStatus.paired?(syncStatus.ownerDevice?'Primary owner computer':'Additional business computer'):'The Business Owner generates a code on the primary computer.'}</span><small>Last successful sync: {syncStatus.lastSyncAt?new Date(syncStatus.lastSyncAt).toLocaleString():'Not yet synchronised'}</small></div>
        {!syncStatus.paired&&<form className="inline-form" onSubmit={pairThisComputer}><label>8-digit pairing code<input value={pairingCode} onChange={e=>setPairingCode(e.target.value.replace(/\D/g,'').slice(0,8))} inputMode="numeric" maxLength={8} placeholder="Enter pairing code" required/></label><button className="primary" disabled={busy||syncing||pairingCode.length!==8||!online}>Pair this computer</button></form>}
        {syncStatus.paired&&<div className="device-actions">
          {syncStatus.ownerDevice&&<><button className="primary" onClick={generatePairingCode} disabled={syncing||!online}>{syncing?'Generating…':'Generate pairing code'}</button>
          {pairingResult&&<div className="credential-box"><h3>One-time computer pairing code</h3><strong className="pairing-code">{pairingResult.code}</strong><p>Enter this code on the additional Windows computer. It expires at {new Date(pairingResult.expiresAt).toLocaleString()}.</p><button className="secondary" onClick={()=>navigator.clipboard.writeText(pairingResult.code)}>Copy code</button></div>}</>}
          {!syncStatus.ownerDevice&&<p className="muted">Pairing codes can only be generated from the primary Business Owner computer.</p>}
          <button className="secondary" onClick={syncNow} disabled={syncing||!online}>{syncing?'Synchronising…':'Sync now'}</button>
        </div>}
        <div className="device-id">This computer ID: {status.deviceId}</div>
      </div>}
      <footer className="app-footer">Local database · Schema v{status.schemaVersion} <span>Business setup and staff accounts sync securely when internet is available.</span></footer>
      </>}
    </section>
  </main>;
}

function Brand({compact=false}:{compact?:boolean}){return <div className={compact?'brand compact':'brand'}><div className="brand-mark">HR</div><div><strong>Hardware Retail</strong><span>Management System</span></div></div>}
function Metric({label,value,hint}:{label:string;value:number;hint:string}){return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>}
function SetupStep({done,title,detail,onClick}:{done:boolean;title:string;detail:string;onClick:()=>void}){return <button className="setup-step" onClick={onClick}><span className={done?'step-check done':'step-check'}>{done?'✓':'○'}</span><span><strong>{title}</strong><small>{detail}</small></span><span className="step-arrow">›</span></button>}
function Empty({text}:{text:string}){return <div className="empty-state">{text}</div>}
function DataTable({headers,rows}:{headers:string[];rows:string[][]}){return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
