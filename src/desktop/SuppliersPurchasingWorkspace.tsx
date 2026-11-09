import { FormEvent, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Session = { staffId: string; role: string; branchId: string | null; displayName: string };
type Supplier = { id:string; name:string; contactName:string; phone:string; email:string; kraPin:string; address:string; active:boolean };
type Branch = { id:string; name:string; code:string|null };
type Warehouse = { id:string; branchId:string; name:string };
type Product = { id:string; name:string; sku:string; unit:string; buyingPrice:number };
type PurchaseLine = { productId:string; productName:string; sku:string; unit:string; quantity:number; receivedQuantity:number; unitCost:number; lineTotal:number };
type Payment = { amount:number; paymentMethod:string; reference:string; paidAt:string };
type Purchase = { id:string; orderNumber:string; supplierId:string; supplierName:string; branchId:string; warehouseId:string; invoiceNumber:string; expectedDate:string; notes:string; items:PurchaseLine[]; total:number; paidAmount:number; payments:Payment[]; status:string; paymentStatus:string; createdAt:string };
type Workspace = { role:string; assignedBranchId:string|null; branches:Branch[]; warehouses:Warehouse[]; products:Product[]; suppliers:Supplier[]; purchases:Purchase[] };
const emptySupplier = { name:'', contactName:'', phone:'', email:'', kraPin:'', address:'' };
const money = (n:number) => 'KSh ' + Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});

export default function SuppliersPurchasingWorkspace({session}:{session:Session}) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [section,setSection]=useState<'suppliers'|'purchasing'>('suppliers');
  const [supplier,setSupplier]=useState(emptySupplier);
  const [editingSupplier,setEditingSupplier]=useState<string|null>(null);
  const [supplierSearch,setSupplierSearch]=useState('');
  const [supplierBusy,setSupplierBusy]=useState(false);
  const [supplierId,setSupplierId]=useState('');
  const [branchId,setBranchId]=useState(session.branchId||'');
  const [warehouseId,setWarehouseId]=useState('');
  const [invoiceNumber,setInvoiceNumber]=useState('');
  const [expectedDate,setExpectedDate]=useState('');
  const [notes,setNotes]=useState('');
  const [lines,setLines]=useState([{productId:'',quantity:'1',unitCost:'0'}]);
  const [receiving,setReceiving]=useState<Record<string,string>>({});
  const [payments,setPayments]=useState<Record<string,{amount:string;paymentMethod:string;reference:string}>>({});
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);

  async function load() {
    const data=await invoke<Workspace>('get_procurement_workspace',{actorStaffId:session.staffId});
    setWorkspace(data);
    if(!branchId && data.branches[0]) setBranchId(data.branches[0].id);
    if(!supplierId && data.suppliers[0]) setSupplierId(data.suppliers[0].id);
  }
  useEffect(()=>{load().catch(e=>setError(String(e)));},[session.staffId]);
  const visibleSuppliers=useMemo(()=> (workspace?.suppliers||[]).filter(s=>[s.name,s.contactName,s.phone,s.email,s.kraPin].join(' ').toLowerCase().includes(supplierSearch.toLowerCase())),[workspace,supplierSearch]);
  const selectedWarehouseOptions=(workspace?.warehouses||[]).filter(w=>w.branchId===branchId);
  const orderTotal=lines.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(x.unitCost||0),0);
  function editSupplier(s:Supplier){setEditingSupplier(s.id);setSupplier({name:s.name||'',contactName:s.contactName||'',phone:s.phone||'',email:s.email||'',kraPin:s.kraPin||'',address:s.address||''});}
  async function saveSupplier(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{await invoke('save_supplier',{actorStaffId:session.staffId,id:editingSupplier,name:supplier.name,contactName:supplier.contactName,phone:supplier.phone,email:supplier.email,kraPin:supplier.kraPin,address:supplier.address});setSupplier(emptySupplier);setEditingSupplier(null);await load();setNotice(editingSupplier?'Supplier updated.':'Supplier added.');}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function createOrder(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setNotice('');
    try{
      const items=lines.filter(x=>x.productId).map(x=>({productId:x.productId,quantity:Number(x.quantity),unitCost:Number(x.unitCost)}));
      await invoke('create_purchase_order',{actorStaffId:session.staffId,supplierId,branchId,warehouseId,invoiceNumber,expectedDate,notes,items});
      setInvoiceNumber('');setExpectedDate('');setNotes('');setLines([{productId:'',quantity:'1',unitCost:'0'}]);
      await load();setNotice('Purchase order created. Stock will increase only when goods are received.');
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function receive(order:Purchase,line:PurchaseLine){
    const key=order.id+':'+line.productId;
    const remaining=line.quantity-line.receivedQuantity;
    const quantity=Number(receiving[key]||remaining);
    if(!Number.isFinite(quantity)||quantity<=0||quantity>remaining){setError('Enter a positive quantity no greater than the outstanding quantity.');return;}
    setBusy(true);setError('');setNotice('');
    try{await invoke('receive_purchase_goods',{actorStaffId:session.staffId,purchaseId:order.id,items:[{productId:line.productId,quantity}]});setReceiving({...receiving,[key]:''});await load();setNotice('Goods receipt recorded. Inventory has been updated.');}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function pay(order:Purchase){
    const p=payments[order.id]||{amount:'',paymentMethod:'BANK',reference:''};
    setBusy(true);setError('');setNotice('');
    try{await invoke('record_supplier_payment',{actorStaffId:session.staffId,purchaseId:order.id,amount:Number(p.amount),paymentMethod:p.paymentMethod,reference:p.reference});setPayments({...payments,[order.id]:{...p,amount:''}});await load();setNotice('Supplier payment recorded and added to the local cashbook.');}
    catch(e){setError(String(e));}finally{setBusy(false);}
  }
  if(!workspace)return <div className="content-card"><p>{error||'Loading suppliers and purchasing…'}</p></div>;
  return <div className="procurement-workspace">
    <div className="procurement-toolbar"><div><span className="eyebrow">PROCUREMENT</span><h2>Suppliers & Purchasing</h2><p>Manage supplier records, purchase orders, goods receipts and supplier payments.</p></div><div className="procurement-tabs"><button className={section==='suppliers'?'active':''} onClick={()=>setSection('suppliers')}>Suppliers</button><button className={section==='purchasing'?'active':''} onClick={()=>setSection('purchasing')}>Purchasing</button></div></div>
    {error&&<p className="error global-message">{error}</p>}{notice&&<p className="success global-message">{notice}</p>}
    {section==='suppliers'&&<div className="procurement-grid">
      <section className="content-card"><div className="section-heading"><div><h2>{editingSupplier?'Edit supplier':'Add supplier'}</h2><p>Maintain supplier contact and tax details for purchasing.</p></div></div>
        <form className="form-grid" onSubmit={saveSupplier}>
          <label className="wide">Supplier / company name *<input value={supplier.name} onChange={e=>setSupplier({...supplier,name:e.target.value})} required maxLength={160}/></label>
          <label>Contact person<input value={supplier.contactName} onChange={e=>setSupplier({...supplier,contactName:e.target.value})}/></label>
          <label>Phone<input value={supplier.phone} onChange={e=>setSupplier({...supplier,phone:e.target.value})}/></label>
          <label>Email<input type="email" value={supplier.email} onChange={e=>setSupplier({...supplier,email:e.target.value})}/></label>
          <label>KRA PIN<input value={supplier.kraPin} onChange={e=>setSupplier({...supplier,kraPin:e.target.value})}/></label>
          <label className="wide">Address<input value={supplier.address} onChange={e=>setSupplier({...supplier,address:e.target.value})}/></label>
          <div className="wide form-actions"><button type="button" className="secondary" onClick={()=>{setSupplier(emptySupplier);setEditingSupplier(null);}}>Clear</button><button className="primary" disabled={busy}>{busy?'Saving…':editingSupplier?'Save changes':'Add supplier'}</button></div>
        </form>
      </section>
      <section className="content-card"><div className="section-heading"><div><h2>Supplier directory</h2><p>{workspace.suppliers.length} suppliers registered</p></div><span className="count-pill">{workspace.suppliers.length}</span></div>
        <input className="procurement-search" placeholder="Search suppliers by name, contact, phone or PIN…" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/>
        {visibleSuppliers.length===0?<div className="empty-state">No suppliers found. Add your first supplier to start purchasing.</div>:<div className="procurement-records">{visibleSuppliers.map(s=><article className="procurement-record" key={s.id}><div className="record-icon">▦</div><div className="record-copy"><strong>{s.name}</strong><small>{[s.contactName,s.phone,s.email].filter(Boolean).join(' · ')||'No contact details'}</small><small>{s.kraPin?'KRA PIN: '+s.kraPin:''} {s.address?' · '+s.address:''}</small></div><button className="text-button" onClick={()=>editSupplier(s)}>Edit</button></article>)}</div>}
      </section>
    </div>}
    {section==='purchasing'&&<div className="procurement-purchase-layout">
      <section className="content-card"><div className="section-heading"><div><h2>Create purchase order</h2><p>Record what you are ordering. Stock changes only after goods are received.</p></div></div>
        <form onSubmit={createOrder}>
          <div className="form-grid">
            <label>Supplier *<select required value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Select supplier</option>{workspace.suppliers.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Receiving branch *<select required value={branchId} onChange={e=>{setBranchId(e.target.value);setWarehouseId('');}}><option value="">Select branch</option>{workspace.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>Warehouse *<select required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">Select warehouse</option>{selectedWarehouseOptions.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label>Supplier invoice / reference<input value={invoiceNumber} onChange={e=>setInvoiceNumber(e.target.value)} maxLength={100}/></label>
            <label>Expected delivery date<input type="date" value={expectedDate} onChange={e=>setExpectedDate(e.target.value)}/></label>
            <label>Order notes<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={400}/></label>
          </div>
          <div className="form-section-title separated">Purchase items</div>
          {lines.map((line,index)=><div className="procurement-line" key={index}>
            <label>Product *<select required value={line.productId} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,productId:e.target.value}:x))}><option value="">Select product</option>{workspace.products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' · '+p.sku:''}</option>)}</select></label>
            <label>Quantity *<input type="number" min="0.001" step="any" required value={line.quantity} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label>
            <label>Unit cost (KSh) *<input type="number" min="0" step="0.01" required value={line.unitCost} onChange={e=>setLines(lines.map((x,i)=>i===index?{...x,unitCost:e.target.value}:x))}/></label>
            <button type="button" className="text-button" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove</button>
          </div>)}
          <div className="form-actions procurement-order-actions"><button type="button" className="secondary" onClick={()=>setLines([...lines,{productId:'',quantity:'1',unitCost:'0'}])}>+ Add item</button><strong>Order total: {money(orderTotal)}</strong><button className="primary" disabled={busy||!workspace.suppliers.length||!workspace.branches.length||!workspace.warehouses.length}>{busy?'Creating…':'Create purchase order'}</button></div>
        </form>
      </section>
      <section className="content-card"><div className="section-heading"><div><h2>Purchase orders & supplier balances</h2><p>Receive goods and record payments against supplier invoices.</p></div><span className="count-pill">{workspace.purchases.length} orders</span></div>
        {workspace.purchases.length===0?<div className="empty-state">No purchase orders. Add a supplier and create your first order.</div>:<div className="procurement-orders">{workspace.purchases.slice().reverse().map(order=>{
          const outstanding=Math.max(0,order.total-order.paidAmount);
          const remaining=order.items.reduce((sum,x)=>sum+Math.max(0,x.quantity-x.receivedQuantity),0);
          const payment=payments[order.id]||{amount:'',paymentMethod:'BANK',reference:''};
          return <article className="procurement-order" key={order.id}>
            <div className="procurement-order-heading"><div><strong>{order.orderNumber} · {order.supplierName}</strong><small>{workspace.branches.find(b=>b.id===order.branchId)?.name||'Branch'} · {order.invoiceNumber||'No supplier invoice reference'} · {new Date(order.createdAt).toLocaleDateString()}</small></div><span className="count-pill">{order.status}</span></div>
            {order.items.map(item=>{const left=Math.max(0,item.quantity-item.receivedQuantity);const key=order.id+':'+item.productId;return <div className="procurement-item" key={item.productId}><div><strong>{item.productName}</strong><small>Ordered {item.quantity} {item.unit} · Received {item.receivedQuantity} · Outstanding {left}</small></div><strong>{money(item.lineTotal)}</strong>{left>0&&<div className="procurement-receive"><input aria-label={'Quantity received for '+item.productName} type="number" min="0.001" max={left} step="any" placeholder={'Up to '+left} value={receiving[key]||''} onChange={e=>setReceiving({...receiving,[key]:e.target.value})}/><button className="secondary" disabled={busy} onClick={()=>receive(order,item)}>Receive quantity</button></div>}</div>;})}
            <div className="procurement-balance"><span>Order total {money(order.total)} · Paid {money(order.paidAmount)}</span><strong>Outstanding {money(outstanding)}</strong></div>
            {remaining>0&&<small className="helper">Goods received: pending · You can record multiple partial deliveries.</small>}
            {outstanding>0&&<div className="procurement-payment"><label>Payment amount (KSh)<input type="number" min="0.01" max={outstanding} step="0.01" value={payment.amount} onChange={e=>setPayments({...payments,[order.id]:{...payment,amount:e.target.value}})}/></label><label>Payment method<select value={payment.paymentMethod} onChange={e=>setPayments({...payments,[order.id]:{...payment,paymentMethod:e.target.value}})}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label><label>Payment reference {payment.paymentMethod==='MPESA'?'*':'(optional)'}<input value={payment.reference} onChange={e=>setPayments({...payments,[order.id]:{...payment,reference:e.target.value}})}/></label><button className="primary" disabled={busy} onClick={()=>pay(order)}>Record supplier payment</button></div>}
            <small className="helper">Goods received: {remaining===0?'Complete':'Pending'} · Payment: {order.paymentStatus||'UNPAID'}</small>
          </article>;
        })}</div>}
      </section>
    </div>}
  </div>;
}
