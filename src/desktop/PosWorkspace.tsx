import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Session = { staffId: string; displayName: string; role: string; branchId: string | null };
type Branch = { id: string; name: string; code?: string | null };
type Product = { id: string; name: string; sku: string; unit: string; buyingPrice: number; sellingPrice: number };
type Stock = { productId: string; branchId: string; quantity: number };
type Shift = { id: string; branchId: string; openingFloat: number; openedAt: string };
type Customer = { id: string; name: string; phone: string };
type Sale = { id: string; receiptNumber: string; branchId: string; total: number; discountAmount?:number; status?:string; paymentMethod: string; paymentReference: string; customerName: string; customerPhone: string; createdAt: string; cashier: string };
type SaleItem={saleItemId:string;productId:string;productName:string;quantity:number;unitPrice:number;unitCost:number;netLineTotal:number;returnedQuantity:number};
type SaleDetails={id:string;receiptNumber:string;branchId:string;total:number;status:string};
type ReturnLine=SaleItem&{returnQuantity:number;restock:boolean};
type Reconciliation = { openingFloat:number;cashSales:number;mpesaSales:number;expectedCash:number;closingCash:number;closingMpesa:number;cashVariance:number;mpesaVariance:number };
type Workspace = { role: string; assignedBranchId: string | null; branches: Branch[]; products: Product[]; stock: Stock[]; customers: Customer[]; openShift: Shift | null };

const roundMoney=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const money = (value:number) => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:2}).format(value || 0);

export default function PosWorkspace({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [branchId,setBranchId]=useState(session.branchId||'');
  const [openingFloat,setOpeningFloat]=useState('0');
  const [closingCash,setClosingCash]=useState('0');
  const [closingMpesa,setClosingMpesa]=useState('0');
  const [basket,setBasket]=useState<{productId:string;quantity:number;unitPrice:number;discountPercent:number}[]>([]);
  const [orderDiscountPercent,setOrderDiscountPercent]=useState('0');
  const [approverUsername,setApproverUsername]=useState('');
  const [approverPassword,setApproverPassword]=useState('');
  const [returnSale,setReturnSale]=useState<SaleDetails|null>(null);
  const [returnLines,setReturnLines]=useState<ReturnLine[]>([]);
  const [returnReason,setReturnReason]=useState('');
  const [returnCash,setReturnCash]=useState('0');
  const [returnMpesa,setReturnMpesa]=useState('0');
  const [returnReference,setReturnReference]=useState('');
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
  const subtotal=roundMoney(basket.reduce((sum,line)=>sum+roundMoney(line.quantity*line.unitPrice),0));
  const afterLineDiscounts=roundMoney(basket.reduce((sum,line)=>sum+roundMoney(roundMoney(line.quantity*line.unitPrice)*(1-line.discountPercent/100)),0));
  const lineDiscountTotal=roundMoney(subtotal-afterLineDiscounts);
  const orderDiscountAmount=roundMoney(afterLineDiscounts*(Math.max(0,Math.min(100,Number(orderDiscountPercent)||0))/100));
  const discountTotal=roundMoney(lineDiscountTotal+orderDiscountAmount);
  const total=Math.max(0,roundMoney(subtotal-discountTotal));
  const hasDiscount=discountTotal>0.005;
  const requiresManagerApproval=hasDiscount&&!['Business Owner','Manager'].includes(session.role);
  const returnTotal=roundMoney(returnLines.reduce((sum,line)=>sum+(line.returnQuantity>0?roundMoney((line.netLineTotal/line.quantity)*line.returnQuantity):0),0));
  const returnPaid=Number(returnCash||0)+Number(returnMpesa||0);
  const requiresReturnApproval=!['Business Owner','Manager'].includes(session.role);
  const paid=Number(cashAmount||0)+Number(mpesaAmount||0);
  const available=(id:string)=>workspace?.stock.find(s=>s.productId===id&&s.branchId===branchId)?.quantity||0;

  function add(product:Product){
    setBasket(current=>{const found=current.find(x=>x.productId===product.id);return found?current.map(x=>x.productId===product.id?{...x,quantity:x.quantity+1}:x):[...current,{productId:product.id,quantity:1,unitPrice:product.sellingPrice,discountPercent:0}];});
  }
  function update(id:string,patch:Partial<{quantity:number;unitPrice:number;discountPercent:number}>){setBasket(rows=>rows.map(x=>x.productId===id?{...x,...patch}:x));}
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
    if(hasDiscount&&requiresManagerApproval&&(!approverUsername.trim()||!approverPassword)){setError('Enter a Manager or Business Owner username and password to approve this discount.');return;}
    if(Math.abs(paid-total)>0.01){setError('Cash and M-Pesa amounts must add up exactly to the sale total.');return;}
    if(Number(cashAmount)<0||Number(mpesaAmount)<0){setError('Payment amounts cannot be negative.');return;}
    if(Number(mpesaAmount)>0&&!paymentReference.trim()){setError('Enter the M-Pesa transaction reference.');return;}
    await perform(async()=>{
      const method=Number(cashAmount)>0&&Number(mpesaAmount)>0?'SPLIT':Number(mpesaAmount)>0?'MPESA':'CASH';
      const result=await invoke<any>('process_pos_sale',{
        actorStaffId:session.staffId,branchId,shiftId:shift.id,
        items:basket.map(x=>({productId:x.productId,quantity:x.quantity,unitPrice:x.unitPrice,discountPercent:x.discountPercent})),
        orderDiscountPercent:Number(orderDiscountPercent||0),approverUsername:approverUsername||null,approverPassword:approverPassword||null,
        paymentMethod:method,cashAmount:Number(cashAmount||0),mpesaAmount:Number(mpesaAmount||0),paymentReference:paymentReference||null,
        customerId:customerId||null,customerName:customerName||null,customerPhone:customerPhone||null
      });
      setReceipt(result);setBasket([]);setOrderDiscountPercent('0');setCashAmount('');setMpesaAmount('');setPaymentReference('');setCustomerId('');setCustomerName('');setCustomerPhone('');setApproverUsername('');setApproverPassword('');
    },'Sale completed and stock deducted.');
  }

  async function beginReturn(sale:Sale){
    setBusy(true);setError('');setNotice('');
    try{
      const detail=await invoke<{sale:SaleDetails;items:SaleItem[]}>('get_pos_sale_details',{actorStaffId:session.staffId,saleId:sale.id});
      setReturnSale(detail.sale);
      setReturnLines(detail.items.map(item=>({...item,returnQuantity:0,restock:true})));
      setReturnReason('');setReturnCash('0');setReturnMpesa('0');setReturnReference('');
      setApproverUsername('');setApproverPassword('');
    }catch(e){setError(String(e).replace(/^Error: /,''));}
    finally{setBusy(false);}
  }
  async function submitReturn(){
    if(!returnSale)return;
    const selected=returnLines.filter(x=>x.returnQuantity>0);
    if(!selected.length){setError('Select at least one item and quantity to return.');return;}
    if(returnReason.trim().length<3){setError('Enter a reason for the return.');return;}
    if(Math.abs(returnPaid-returnTotal)>0.01){setError('Cash and M-Pesa refunds must add up exactly to the return amount.');return;}
    if(requiresReturnApproval&&(!approverUsername.trim()||!approverPassword)){setError('A Manager or Business Owner must approve this return.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const result=await invoke<{returnNumber:string;refundTotal:number;status:string}>('process_pos_return',{
        actorStaffId:session.staffId,saleId:returnSale.id,
        items:selected.map(x=>({saleItemId:x.saleItemId,quantity:x.returnQuantity,restock:x.restock})),
        reason:returnReason,cashAmount:Number(returnCash||0),mpesaAmount:Number(returnMpesa||0),
        paymentReference:returnReference||null,approverUsername:approverUsername||null,approverPassword:approverPassword||null
      });
      setReturnSale(null);setReturnLines([]);setApproverUsername('');setApproverPassword('');
      await loadSales();await load();
      setNotice('Return '+result.returnNumber+' completed. Refund: '+money(result.refundTotal)+'. Sale status: '+result.status+'.');
    }catch(e){setError(String(e).replace(/^Error: /,''));}
    finally{setBusy(false);}
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
          {!basket.length?<div className="empty-state">Select products to add them to this sale.</div>:<div className="basket-list">{basket.map(line=>{const p=workspace.products.find(x=>x.id===line.productId);if(!p)return null;return <div className="basket-line" key={line.productId}><strong>{p.name}</strong><div className="pos-two"><label>Quantity<input type="number" min="0.001" step="0.001" max={available(p.id)} value={line.quantity} onChange={e=>update(p.id,{quantity:Number(e.target.value)})}/></label><label>Unit price<input type="text" value={money(line.unitPrice)} readOnly/></label></div><label>Discount (%)<input type="number" min="0" max="100" step="0.1" value={line.discountPercent} onChange={e=>update(p.id,{discountPercent:Math.max(0,Math.min(100,Number(e.target.value)||0))})}/></label><div className="ledger-row"><span>Line discount</span><strong>{money(line.quantity*line.unitPrice*line.discountPercent/100)}</strong></div><div className="ledger-row"><span>Line total after discount</span><strong>{money(line.quantity*line.unitPrice*(1-line.discountPercent/100))}</strong></div><button type="button" className="text-button" onClick={()=>setBasket(rows=>rows.filter(x=>x.productId!==p.id))}>Remove</button></div>;})}</div>}
          <div className="discount-panel"><div className="ledger-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><label>Whole-sale discount (%)<input type="number" min="0" max="100" step="0.1" value={orderDiscountPercent} onChange={e=>setOrderDiscountPercent(String(Math.max(0,Math.min(100,Number(e.target.value)||0))))}/></label><div className="ledger-row"><span>Total discount</span><strong>{money(discountTotal)}</strong></div><div className="pos-total"><span>Amount payable</span><strong>{money(total)}</strong></div></div>
          {hasDiscount&&requiresManagerApproval&&<div className="approval-panel"><strong>Manager approval required</strong><p className="muted">A Manager or Business Owner must authorise this discount. Approval is recorded against the sale.</p><div className="pos-two"><label>Approver username<input value={approverUsername} onChange={e=>setApproverUsername(e.target.value)} autoComplete="off"/></label><label>Approver password<input type="password" value={approverPassword} onChange={e=>setApproverPassword(e.target.value)} autoComplete="off"/></label></div></div>}

          <label>Saved customer (optional)<select value={customerId} onChange={e=>{const c=workspace.customers.find(x=>x.id===e.target.value);setCustomerId(e.target.value);setCustomerName(c?.name||'');setCustomerPhone(c?.phone||'');}}><option value="">Walk-in / enter customer details</option>{workspace.customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
          <div className="pos-two"><label>Customer name<input value={customerName} onChange={e=>{setCustomerName(e.target.value);setCustomerId('');}} placeholder="Optional"/></label><label>Customer phone<input value={customerPhone} onChange={e=>{setCustomerPhone(e.target.value);setCustomerId('');}} placeholder="Optional"/></label></div>
          <div className="pos-two"><label>Cash amount<input type="number" min="0" step="0.01" value={cashAmount} onChange={e=>setCashAmount(e.target.value)} placeholder="0.00"/></label><label>M-Pesa amount<input type="number" min="0" step="0.01" value={mpesaAmount} onChange={e=>setMpesaAmount(e.target.value)} placeholder="0.00"/></label></div>
          {Number(mpesaAmount)>0&&<label>M-Pesa transaction reference<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value.toUpperCase())} required/></label>}
          <div className="ledger-row"><span>Amount paid</span><strong>{money(paid)}</strong></div><div className="ledger-row"><span>Balance due</span><strong>{money(total-paid)}</strong></div>
          <button className="primary pos-checkout" disabled={busy||!shift||!basket.length||Math.abs(paid-total)>0.01||(hasDiscount&&requiresManagerApproval&&(!approverUsername.trim()||!approverPassword))||basket.some(x=>!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>available(x.productId)||!Number.isFinite(x.unitPrice)||x.unitPrice<0)||(Number(mpesaAmount)>0&&!paymentReference.trim())} onClick={checkout}>Complete sale · {money(total)}</button>
          {!shift&&<p className="muted">Open a cashier shift before processing sales.</p>}
        </section>
      </div>
    </>}
    {view==='history'&&<section className="content-card"><div className="section-heading"><div><h3>Recent sales</h3><p>Latest 100 receipts for this branch.</p></div><button className="secondary" onClick={()=>loadSales().catch(e=>setError(String(e)))}>Refresh</button></div><input className="pos-search" value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Search receipt, customer or cashier"/>{filteredSales.length===0?<div className="empty-state">No matching sales found.</div>:filteredSales.map(s=><article className="purchase-card" key={s.id}><div className="record-row"><div className="record-copy"><strong>{s.receiptNumber}</strong><small>{new Date(s.createdAt).toLocaleString()} · {s.cashier||'Cashier'} · {s.paymentMethod} · {s.status||'COMPLETED'}</small></div><strong>{money(s.total)}</strong></div><div className="ledger-row"><span>{s.customerName||'Walk-in customer'} {s.customerPhone?'· '+s.customerPhone:''}</span><span>{s.paymentReference||'No payment reference'}</span></div>{(s.status||'COMPLETED')!=='RETURNED'&&<button className="secondary" disabled={busy} onClick={()=>beginReturn(s)}>Process return / refund</button>}</article>)}
      {returnSale&&<section className="return-panel"><div className="section-heading"><div><h3>Return against {returnSale.receiptNumber}</h3><p>Only quantities not previously returned can be refunded.</p></div><button className="text-button" onClick={()=>setReturnSale(null)}>Cancel</button></div>
       {returnLines.map(line=><div className="return-line" key={line.saleItemId}><div><strong>{line.productName}</strong><small>Sold {line.quantity} · Already returned {line.returnedQuantity} · Refund rate {money(line.netLineTotal/line.quantity)} per unit</small></div><div className="pos-two"><label>Return quantity<input type="number" min="0" max={Math.max(0,line.quantity-line.returnedQuantity)} step="0.001" value={line.returnQuantity} onChange={e=>setReturnLines(rows=>rows.map(x=>x.saleItemId===line.saleItemId?{...x,returnQuantity:Math.max(0,Math.min(line.quantity-line.returnedQuantity,Number(e.target.value)||0))}:x))}/></label><label className="check-label"><input type="checkbox" checked={line.restock} onChange={e=>setReturnLines(rows=>rows.map(x=>x.saleItemId===line.saleItemId?{...x,restock:e.target.checked}:x))}/> Return to sellable stock</label></div></div>)}
       <label>Reason for return<input value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder="e.g. Wrong size supplied" required/></label>
       <div className="pos-total"><span>Refund due</span><strong>{money(returnTotal)}</strong></div>
       <div className="pos-two"><label>Cash refund<input type="number" min="0" step="0.01" value={returnCash} onChange={e=>setReturnCash(e.target.value)}/></label><label>M-Pesa refund<input type="number" min="0" step="0.01" value={returnMpesa} onChange={e=>setReturnMpesa(e.target.value)}/></label></div>
       {Number(returnMpesa)>0&&<label>M-Pesa refund reference<input value={returnReference} onChange={e=>setReturnReference(e.target.value.toUpperCase())}/></label>}
       {requiresReturnApproval&&<div className="approval-panel"><strong>Manager approval required</strong><p className="muted">A Manager or Business Owner must approve every return and refund.</p><div className="pos-two"><label>Approver username<input value={approverUsername} onChange={e=>setApproverUsername(e.target.value)}/></label><label>Approver password<input type="password" value={approverPassword} onChange={e=>setApproverPassword(e.target.value)}/></label></div></div>}
       <button className="primary" disabled={busy||!returnLines.some(x=>x.returnQuantity>0)||Math.abs(returnPaid-returnTotal)>0.01||returnReason.trim().length<3||(requiresReturnApproval&&(!approverUsername.trim()||!approverPassword))||(Number(returnMpesa)>0&&!returnReference.trim())} onClick={submitReturn}>Confirm return & issue refund</button>
      </section>}
    </section>}
    {shift&&<form className="content-card" onSubmit={closeShift}><div className="section-heading"><div><h3>Close cashier shift</h3><p>Count the physical cash and confirm the M-Pesa total before closing.</p></div></div><div className="pos-two"><label>Closing cash counted<input type="number" min="0" step="0.01" value={closingCash} onChange={e=>setClosingCash(e.target.value)} required/></label><label>Closing M-Pesa total<input type="number" min="0" step="0.01" value={closingMpesa} onChange={e=>setClosingMpesa(e.target.value)} required/></label></div><button className="secondary" disabled={busy}>Close shift & reconcile</button></form>}
    {reconciliation&&<section className="content-card"><div className="section-heading"><div><h3>Last shift reconciliation</h3><p>Variance = amount counted minus expected amount.</p></div></div><div className="ledger-row"><span>Opening float</span><strong>{money(reconciliation.openingFloat)}</strong></div><div className="ledger-row"><span>Cash sales</span><strong>{money(reconciliation.cashSales)}</strong></div><div className="ledger-row"><span>M-Pesa sales</span><strong>{money(reconciliation.mpesaSales)}</strong></div><div className="ledger-row"><span>Cash variance</span><strong>{money(reconciliation.cashVariance)}</strong></div><div className="ledger-row"><span>M-Pesa variance</span><strong>{money(reconciliation.mpesaVariance)}</strong></div></section>}
    {receipt&&<section className="receipt-panel"><div><strong>Sale completed</strong><span>{receipt.receiptNumber}{receipt.customerName?' · '+receipt.customerName:''}</span></div><strong>Total: {money(Number(receipt.total))}</strong><button className="secondary" onClick={()=>setReceipt(null)}>Dismiss</button></section>}
  </div>;
}
