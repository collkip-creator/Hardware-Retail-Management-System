import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Session = { staffId: string; displayName: string; role: string; branchId: string | null };
type Branch = { id: string; name: string; code?: string | null };
type Product = { id: string; name: string; sku: string; unit: string; buyingPrice: number; sellingPrice: number };
type Stock = { productId: string; branchId: string; quantity: number };
type Shift = { id: string; branchId: string; openingFloat: number; openedAt: string };
type Customer = { id: string; name: string; phone: string };
type Sale = { id: string; receiptNumber: string; branchId: string; total: number; paymentMethod: string; paymentReference: string; customerName: string; customerPhone: string; createdAt: string; cashier: string };
type Reconciliation = { openingFloat:number;cashSales:number;mpesaSales:number;expectedCash:number;closingCash:number;closingMpesa:number;cashVariance:number;mpesaVariance:number };
type Workspace = { role: string; assignedBranchId: string | null; branches: Branch[]; products: Product[]; stock: Stock[]; customers: Customer[]; openShift: Shift | null };

const money = (value:number) => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:2}).format(value || 0);

export default function PosWorkspace({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [branchId,setBranchId]=useState(session.branchId||'');
  const [openingFloat,setOpeningFloat]=useState('0');
  const [closingCash,setClosingCash]=useState('0');
  const [closingMpesa,setClosingMpesa]=useState('0');
  const [basket,setBasket]=useState<{productId:string;quantity:number;unitPrice:number}[]>([]);
  const [cashAmount,setCashAmount]=useState('');
  const [mpesaAmount,setMpesaAmount]=useState('');
  const [paymentReference,setPaymentReference]=useState('');
  const [customerId,setCustomerId]=useState('');
  const [customerName,setCustomerName]=useState('');
  const [customerPhone,setCustomerPhone]=useState('');
  const [search,setSearch]=useState('');
  const [historySearch,setHistorySearch]=useState('');
  const [view,setView]=useState<'checkout'|'history'>('checkout');
  const [sales,setSales]=useState<Sale[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [receipt,setReceipt]=useState<any>(null);
  const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);

  async function load(){
    const data=await invoke<Workspace>('get_pos_workspace',{actorStaffId:session.staffId});
    const safe={...data,branches:data.branches||[],products:data.products||[],stock:data.stock||[],customers:data.customers||[]};
    setWorkspace(safe);
    setBranchId(current=>data.openShift?.branchId||current||data.assignedBranchId||safe.branches[0]?.id||'');
  }
  async function loadSales(){
    const rows=await invoke<Sale[]>('get_pos_sales_history',{actorStaffId:session.staffId,branchId:branchId||null});
    setSales(rows||[]);
  }
  useEffect(()=>{load().catch(e=>setError(String(e)));},[session.staffId]);
  useEffect(()=>{if(view==='history')loadSales().catch(e=>setError(String(e)));},[view,branchId,session.staffId]);

  const shift=workspace?.openShift&&workspace.openShift.branchId===branchId?workspace.openShift:null;
  const products=useMemo(()=> (workspace?.products||[]).filter(p=>(p.name+' '+p.sku).toLowerCase().includes(search.toLowerCase())),[workspace,search]);
  const total=basket.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0);
  const paid=Number(cashAmount||0)+Number(mpesaAmount||0);
  const available=(id:string)=>workspace?.stock.find(s=>s.productId===id&&s.branchId===branchId)?.quantity||0;

  function add(product:Product){
    setBasket(current=>{const found=current.find(x=>x.productId===product.id);return found?current.map(x=>x.productId===product.id?{...x,quantity:x.quantity+1}:x):[...current,{productId:product.id,quantity:1,unitPrice:product.sellingPrice}];});
  }
  function update(id:string,patch:Partial<{quantity:number;unitPrice:number}>){setBasket(rows=>rows.map(x=>x.productId===id?{...x,...patch}:x));}
  async function perform(action:()=>Promise<void>,success:string){
    setBusy(true);setError('');setNotice('');
    try{await action();await load();setNotice(success);}
    catch(e){setError(String(e).replace(/^Error: /,''));}
    finally{setBusy(false);}
  }
  async function openShift(e:React.FormEvent){
    e.preventDefault();
    await perform(async()=>{await invoke('open_pos_shift',{actorStaffId:session.staffId,branchId,openingFloat:Number(openingFloat)});},'Cashier shift opened. You can now process sales.');
  }
  async function closeShift(e:React.FormEvent){
    e.preventDefault();if(!shift)return;
    await perform(async()=>{
      const result=await invoke<Reconciliation>('close_pos_shift',{actorStaffId:session.staffId,shiftId:shift.id,closingCash:Number(closingCash),closingMpesa:Number(closingMpesa)});
      setReconciliation(result);setBasket([]);setCashAmount('');setMpesaAmount('');
    },'Shift closed. Review the reconciliation summary below.');
  }
  async function checkout(){
    if(!shift)return;
    if(Math.abs(paid-total)>0.01){setError('Cash and M-Pesa amounts must add up exactly to the sale total.');return;}
    if(Number(cashAmount)<0||Number(mpesaAmount)<0){setError('Payment amounts cannot be negative.');return;}
    if(Number(mpesaAmount)>0&&!paymentReference.trim()){setError('Enter the M-Pesa transaction reference.');return;}
    await perform(async()=>{
      const methods=[...(Number(cashAmount)>0?['CASH']:[]),...(Number(mpesaAmount)>0?['MPESA']:[])];
      if(methods.length!==1)throw new Error('Split payment is not enabled in the current local sales ledger yet. Choose one payment method for this sale.');
      const result=await invoke<any>('process_pos_sale',{
        actorStaffId:session.staffId,branchId,shiftId:shift.id,
        items:basket.map(x=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice})),
        paymentMethod:methods[0],paymentReference:paymentReference||null,
        customerId:customerId||null,customerName:customerName||null,customerPhone:customerPhone||null
      });
      setReceipt(result);setBasket([]);setCashAmount('');setMpesaAmount('');setPaymentReference('');setCustomerId('');setCustomerName('');setCustomerPhone('');
    },'Sale completed and stock deducted.');
  }

  if(!workspace)return <section className="content-card"><p>Loading local POS…</p>{error&&<p className="error">{error}</p>}</section>;
  const filteredSales=sales.filter(s=>(s.receiptNumber+' '+s.customerName+' '+s.customerPhone+' '+s.cashier).toLowerCase().includes(historySearch.toLowerCase()));
  return <div className="pos-workspace">
    <div className="pos-topline"><div><span className="eyebrow">LOCAL OFFLINE POS</span><h2>Point of sale</h2><p className="muted">Checkout, cashier shifts and sales history are stored on this computer.</p></div><button className="secondary" onClick={onSignOut}>Sign out</button></div>
    {error&&<p className="error global-message" role="alert">{error}</p>}{notice&&<p className="success global-message" role="status">{notice}</p>}
    <div className="pos-toolbar">
      <label>Branch<select value={branchId} onChange={e=>{setBranchId(e.target.value);setBasket([]);}} disabled={Boolean(workspace.assignedBranchId||workspace.openShift)}><option value="">Select branch</option>{workspace.branches.map(b=><option key={b.id} value={b.id}>{b.name}{b.code?' ('+b.code+')':''}</option>)}</select></label>
      {shift?<div className="shift-chip"><strong>Shift open</strong><span>Opening float: {money(shift.openingFloat)}</span><span>Opened: {new Date(shift.openedAt).toLocaleString()}</span></div>:<form className="open-shift-form" onSubmit={openShift}><label>Opening cash float<input type="number" min="0" step="0.01" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} required/></label><button className="primary" disabled={busy||!branchId}>Open shift</button></form>}
    </div>
    <div className="section-heading"><div><h3>Sales workspace</h3><p>Choose checkout to make a sale or history to review recent receipts.</p></div><div className="pos-two"><button className={view==='checkout'?'primary':'secondary'} onClick={()=>setView('checkout')}>Checkout</button><button className={view==='history'?'primary':'secondary'} onClick={()=>setView('history')}>Sales history</button></div></div>
    {view==='checkout'&&<>
      <div className="pos-main-grid">
        <section className="content-card"><div className="section-heading"><div><h3>Products</h3><p>{workspace.products.length} active products · stock at selected branch</p></div></div><input className="pos-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product name or SKU"/><div className="pos-product-list">{products.map(p=><button type="button" className="pos-product" key={p.id} onClick={()=>add(p)} disabled={!shift||available(p.id)<=0}><span><strong>{p.name}</strong><small>{p.sku} · {available(p.id)} {p.unit} in stock</small></span><b>{money(p.sellingPrice)}</b></button>)}</div></section>
        <section className="content-card"><div className="section-heading"><div><h3>Current sale</h3><p>{basket.length} line(s)</p></div></div>
          {!basket.length?<div className="empty-state">Select products to add them to this sale.</div>:<div className="basket-list">{basket.map(line=>{const p=workspace.products.find(x=>x.id===line.productId);if(!p)return null;return <div className="basket-line" key={line.productId}><strong>{p.name}</strong><div className="pos-two"><label>Quantity<input type="number" min="0.001" step="0.001" max={available(p.id)} value={line.quantity} onChange={e=>update(p.id,{quantity:Number(e.target.value)})}/></label><label>Unit price<input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>update(p.id,{unitPrice:Number(e.target.value)})}/></label></div><div className="ledger-row"><span>Line total</span><strong>{money(line.quantity*line.unitPrice)}</strong></div><button type="button" className="text-button" onClick={()=>setBasket(rows=>rows.filter(x=>x.productId!==p.id))}>Remove</button></div>;})}</div>}
          <div className="pos-total"><span>Sale total</span><strong>{money(total)}</strong></div>
          <label>Saved customer (optional)<select value={customerId} onChange={e=>{const c=workspace.customers.find(x=>x.id===e.target.value);setCustomerId(e.target.value);setCustomerName(c?.name||'');setCustomerPhone(c?.phone||'');}}><option value="">Walk-in / enter customer details</option>{workspace.customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
          <div className="pos-two"><label>Customer name<input value={customerName} onChange={e=>{setCustomerName(e.target.value);setCustomerId('');}} placeholder="Optional"/></label><label>Customer phone<input value={customerPhone} onChange={e=>{setCustomerPhone(e.target.value);setCustomerId('');}} placeholder="Optional"/></label></div>
          <div className="pos-two"><label>Cash amount<input type="number" min="0" step="0.01" value={cashAmount} onChange={e=>setCashAmount(e.target.value)} placeholder="0.00"/></label><label>M-Pesa amount<input type="number" min="0" step="0.01" value={mpesaAmount} onChange={e=>setMpesaAmount(e.target.value)} placeholder="0.00"/></label></div>
          {Number(mpesaAmount)>0&&<label>M-Pesa transaction reference<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value.toUpperCase())} required/></label>}
          <div className="ledger-row"><span>Amount paid</span><strong>{money(paid)}</strong></div><div className="ledger-row"><span>Balance due</span><strong>{money(total-paid)}</strong></div>
          <button className="primary pos-checkout" disabled={busy||!shift||!basket.length||Math.abs(paid-total)>0.01||basket.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>available(x.productId)||!Number.isFinite(x.unitPrice)||x.unitPrice<0)||(Number(mpesaAmount)>0&&!paymentReference.trim())} onClick={checkout}>Complete sale · {money(total)}</button>
          {!shift&&<p className="muted">Open a cashier shift before processing sales.</p>}
        </section>
      </div>
    </>}
    {view==='history'&&<section className="content-card"><div className="section-heading"><div><h3>Recent sales</h3><p>Latest 100 receipts for this branch.</p></div><button className="secondary" onClick={()=>loadSales().catch(e=>setError(String(e)))}>Refresh</button></div><input className="pos-search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Search receipt, customer or cashier"/>{filteredSales.length===0?<div className="empty-state">No matching sales found.</div>:filteredSales.map(s=><article className="purchase-card" key={s.id}><div className="record-row"><div className="record-copy"><strong>{s.receiptNumber}</strong><small>{new Date(s.createdAt).toLocaleString()} · {s.cashier||'Cashier'} · {s.paymentMethod}</small></div><strong>{money(s.total)}</strong></div><div className="ledger-row"><span>{s.customerName||'Walk-in customer'} {s.customerPhone?'· '+s.customerPhone:''}</span><span>{s.paymentReference||'No payment reference'}</span></div></article>)}</section>}
    {shift&&<form className="content-card" onSubmit={closeShift}><div className="section-heading"><div><h3>Close cashier shift</h3><p>Count the physical cash and confirm the M-Pesa total before closing.</p></div></div><div className="pos-two"><label>Closing cash counted<input type="number" min="0" step="0.01" value={closingCash} onChange={e=>setClosingCash(e.target.value)} required/></label><label>Closing M-Pesa total<input type="number" min="0" step="0.01" value={closingMpesa} onChange={e=>setClosingMpesa(e.target.value)} required/></label></div><button className="secondary" disabled={busy}>Close shift & reconcile</button></form>}
    {reconciliation&&<section className="content-card"><div className="section-heading"><div><h3>Last shift reconciliation</h3><p>Variance = amount counted minus expected amount.</p></div></div><div className="ledger-row"><span>Opening float</span><strong>{money(reconciliation.openingFloat)}</strong></div><div className="ledger-row"><span>Cash sales</span><strong>{money(reconciliation.cashSales)}</strong></div><div className="ledger-row"><span>M-Pesa sales</span><strong>{money(reconciliation.mpesaSales)}</strong></div><div className="ledger-row"><span>Cash variance</span><strong>{money(reconciliation.cashVariance)}</strong></div><div className="ledger-row"><span>M-Pesa variance</span><strong>{money(reconciliation.mpesaVariance)}</strong></div></section>}
    {receipt&&<section className="receipt-panel"><div><strong>Sale completed</strong><span>{receipt.receiptNumber}{receipt.customerName?' · '+receipt.customerName:''}</span></div><strong>Total: {money(Number(receipt.total))}</strong><button className="secondary" onClick={()=>setReceipt(null)}>Dismiss</button></section>}
  </div>;
}
