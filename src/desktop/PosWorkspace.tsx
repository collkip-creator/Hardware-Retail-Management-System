import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Session = { staffId: string; displayName: string; role: string; branchId: string | null };
type Branch = { id: string; name: string; code?: string | null };
type Product = { id: string; name: string; sku: string; unit: string; buyingPrice: number; sellingPrice: number };
type Stock = { productId: string; branchId: string; quantity: number };
type Shift = { id: string; branchId: string; openingFloat: number; openedAt: string };
type Customer = { id: string; name: string; phone: string };
type Workspace = { role: string; assignedBranchId: string | null; branches: Branch[]; products: Product[]; stock: Stock[]; customers: Customer[]; openShift: Shift | null };

export default function PosWorkspace({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [branchId, setBranchId] = useState(session.branchId || '');
  const [openingFloat, setOpeningFloat] = useState('0');
  const [basket, setBasket] = useState<{ productId: string; quantity: number; unitPrice: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [productName, setProductName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [buyingPrice, setBuyingPrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [receiveProduct, setReceiveProduct] = useState('');
  const [receiveQuantity, setReceiveQuantity] = useState('');
  const [receiveCost, setReceiveCost] = useState('');

  async function load() {
    const data = await invoke<Workspace>('get_pos_workspace', { actorStaffId: session.staffId });
    setWorkspace(data);
    setBranchId(current => data.openShift?.branchId || current || data.assignedBranchId || data.branches[0]?.id || '');
  }
  useEffect(() => { load().catch(e => setError(String(e))); }, [session.staffId]);

  const shift = workspace?.openShift && workspace.openShift.branchId === branchId ? workspace.openShift : null;
  const availableProducts = useMemo(() => (workspace?.products || []).filter(p =>
    (p.name + ' ' + p.sku).toLowerCase().includes(search.toLowerCase())
  ), [workspace, search]);
  const cartTotal = basket.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const canManageStock = ['Business Owner', 'Storekeeper'].includes(session.role);

  function stockFor(productId: string) {
    return workspace?.stock.find(s => s.productId === productId && s.branchId === branchId)?.quantity || 0;
  }
  function addToBasket(product: Product) {
    setBasket(current => {
      const existing = current.find(x => x.productId === product.id);
      if (existing) return current.map(x => x.productId === product.id ? { ...x, quantity: x.quantity + 1 } : x);
      return [...current, { productId: product.id, quantity: 1, unitPrice: product.sellingPrice }];
    });
  }
  function updateLine(productId: string, patch: Partial<{ quantity: number; unitPrice: number }>) {
    setBasket(current => current.map(x => x.productId === productId ? { ...x, ...patch } : x));
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); setNotice(success); }
    catch (e) { setError(String(e).replace(/^Error: /, '')); }
    finally { setBusy(false); }
  }
  async function createProduct(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const p = await invoke<Product>('create_pos_product', {
        actorStaffId: session.staffId, name: productName, sku, unit,
        buyingPrice: Number(buyingPrice), sellingPrice: Number(sellingPrice)
      });
      setProductName(''); setSku(''); setBuyingPrice('0'); setSellingPrice('0');
      setReceiveProduct(p.id);
    }, 'Product saved to this computer.');
  }
  async function receiveStock(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!branchId) throw new Error('Create a branch before receiving stock.');
      await invoke('receive_pos_stock', {
        actorStaffId: session.staffId, productId: receiveProduct, branchId,
        quantity: Number(receiveQuantity), unitCost: Number(receiveCost), reference: 'OPENING-STOCK'
      });
      setReceiveQuantity(''); setReceiveCost('');
    }, 'Stock received and recorded locally.');
  }
  async function openShift(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await invoke('open_pos_shift', { actorStaffId: session.staffId, branchId, openingFloat: Number(openingFloat) });
    }, 'Cashier shift opened.');
  }
  async function checkout() {
    if (!shift) return;
    await run(async () => {
      const result = await invoke<any>('process_pos_sale', {
        actorStaffId: session.staffId, branchId, shiftId: shift.id,
        items: basket.map(x => ({ productId: x.productId, quantity: x.quantity, unitPrice: x.unitPrice })),
        paymentMethod, paymentReference: paymentReference || null,
        customerId: customerId || null, customerName: customerName || null, customerPhone: customerPhone || null
      });
      setReceipt(result); setBasket([]); setPaymentReference(''); setCustomerId(''); setCustomerName(''); setCustomerPhone('');
    }, 'Sale completed and stock deducted.');
  }

  if (!workspace) return <section className="content-card"><p>Loading local POS…</p>{error && <p className="error">{error}</p>}</section>;

  return <div className="pos-workspace">
    <div className="pos-topline">
      <div><span className="eyebrow">LOCAL OFFLINE POS</span><h2>Point of sale</h2><p className="muted">Sales and stock movements are saved in this computer's local database.</p></div>
      <button className="secondary" onClick={onSignOut}>Sign out</button>
    </div>
    {error && <p className="error global-message">{error}</p>}
    {notice && <p className="success global-message">{notice}</p>}
    <div className="pos-toolbar">
      <label>Branch<select value={branchId} onChange={e=>{setBranchId(e.target.value);setBasket([]);}} disabled={Boolean(workspace.assignedBranchId || workspace.openShift)}>
        <option value="">Select branch</option>{workspace.branches.map(b=><option key={b.id} value={b.id}>{b.name}{b.code ? ' (' + b.code + ')' : ''}</option>)}
      </select></label>
      {shift ? <div className="shift-chip"><strong>Shift open</strong><span>Opening float: {shift.openingFloat.toFixed(2)}</span></div> : <form className="open-shift-form" onSubmit={openShift}>
        <label>Opening cash float<input type="number" min="0" step="0.01" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} required /></label>
        <button className="primary" disabled={busy || !branchId}>Open shift</button>
      </form>}
    </div>

    {canManageStock && <div className="pos-admin-grid">
      <form className="content-card" onSubmit={createProduct}>
        <h3>Add product</h3><label>Product name<input value={productName} onChange={e=>setProductName(e.target.value)} required minLength={2}/></label>
        <label>SKU / code<input value={sku} onChange={e=>setSku(e.target.value.toUpperCase())} required/></label>
        <label>Stock unit<input value={unit} onChange={e=>setUnit(e.target.value)} required/></label>
        <div className="pos-two"><label>Buying cost<input type="number" min="0" step="0.01" value={buyingPrice} onChange={e=>setBuyingPrice(e.target.value)}/></label><label>Selling price<input type="number" min="0" step="0.01" value={sellingPrice} onChange={e=>setSellingPrice(e.target.value)}/></label></div>
        <button className="primary" disabled={busy}>Save product</button>
      </form>
      <form className="content-card" onSubmit={receiveStock}>
        <h3>Receive stock</h3><label>Product<select value={receiveProduct} onChange={e=>setReceiveProduct(e.target.value)} required><option value="">Choose product</option>{workspace.products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" value={receiveQuantity} onChange={e=>setReceiveQuantity(e.target.value)} required/></label>
        <label>Unit cost<input type="number" min="0" step="0.01" value={receiveCost} onChange={e=>setReceiveCost(e.target.value)} required/></label>
        <button className="primary" disabled={busy || !branchId || !receiveProduct}>Receive stock</button>
      </form>
    </div>}

    {receipt && <div className="receipt-panel"><div><strong>Sale completed</strong><span>{receipt.receiptNumber}{receipt.customerName ? ' · ' + receipt.customerName : ''}</span></div><strong>Total: {Number(receipt.total).toFixed(2)}</strong><button className="secondary" onClick={()=>setReceipt(null)}>Dismiss receipt</button></div>}
    <div className="pos-main-grid">
      <section className="content-card">
        <div className="section-heading"><div><h3>Products</h3><p>{workspace.products.length} products available locally</p></div></div>
        <input className="pos-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product name or SKU"/>
        <div className="pos-product-list">{availableProducts.map(p=><button type="button" className="pos-product" key={p.id} onClick={()=>addToBasket(p)} disabled={!shift || stockFor(p.id)<=0}>
          <span><strong>{p.name}</strong><small>{p.sku} · {stockFor(p.id)} {p.unit} in stock</small></span><b>{p.sellingPrice.toFixed(2)}</b>
        </button>)}</div>
      </section>
      <section className="content-card">
        <div className="section-heading"><div><h3>Current sale</h3><p>{basket.length} line(s)</p></div></div>
        {basket.length===0?<div className="empty-state">Select products to add them to the sale.</div>:<div className="basket-list">{basket.map(line=>{
          const p=workspace.products.find(x=>x.id===line.productId)!;
          return <div className="basket-line" key={line.productId}><strong>{p.name}</strong><div className="pos-two"><label>Qty<input type="number" min="0.001" step="0.001" max={stockFor(p.id)} value={line.quantity} onChange={e=>updateLine(p.id,{quantity:Number(e.target.value)})}/></label><label>Unit price<input value={line.unitPrice.toFixed(2)} readOnly /></label></div><button className="text-button" type="button" onClick={()=>setBasket(x=>x.filter(y=>y.productId!==p.id))}>Remove</button></div>;
        })}</div>}
        <div className="pos-total"><span>Total</span><strong>{cartTotal.toFixed(2)}</strong></div>
        <label>Saved customer (optional)<select value={customerId} onChange={e=>{const c=workspace.customers.find(x=>x.id===e.target.value);setCustomerId(e.target.value);setCustomerName(c?.name||'');setCustomerPhone(c?.phone||'');}}><option value="">Walk-in / enter customer details</option>{workspace.customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
        <div className="pos-two"><label>Customer name<input value={customerName} onChange={e=>{setCustomerName(e.target.value);setCustomerId('');}} placeholder="Optional"/></label><label>Customer phone<input value={customerPhone} onChange={e=>{setCustomerPhone(e.target.value);setCustomerId('');}} placeholder="Optional"/></label></div>
        <label>Payment method<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option></select></label>
        {paymentMethod==='MPESA'&&<label>M-Pesa transaction code<input value={paymentReference} onChange={e=>setPaymentReference(e.target.value.toUpperCase())} required/></label>}
        <button className="primary pos-checkout" disabled={busy || !shift || basket.length===0 || (paymentMethod==='MPESA'&&!paymentReference.trim()) || basket.some(x=>x.quantity<=0||x.unitPrice<0||x.quantity>stockFor(x.productId))} onClick={checkout}>Complete sale · {cartTotal.toFixed(2)}</button>
        {!shift&&<p className="muted">Open a cashier shift before completing a sale.</p>}
      </section>
    </div>
  </div>;
}
