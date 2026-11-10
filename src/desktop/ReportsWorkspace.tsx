import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
type ReportData = {
 role:string; branches:{id:string;name:string}[];
 summary:{transactions:number;grossSales:number;discounts:number;refunds:number;netSales:number;averageSale:number;returns:number;purchaseOrders:number;purchases:number;payables:number;products:number;stockUnits:number;stockValue:number;lowStock:number;accountingIncome:number;accountingExpenses:number;accountingNet:number};
 dailySales:{date:string;transactions:number;sales:number;refunds:number;netSales:number}[];
 paymentMethods:{method:string;transactions:number;amount:number}[];
 topProducts:{productId:string;name:string;quantity:number;revenue:number;cost:number;returnedQuantity:number}[];
 branchSummary:{branchId:string;branch:string;transactions:number;sales:number}[];
};
const isoDate=(date:Date)=>{const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d;};
const money=(v:number)=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:2}).format(v||0);
const number=(v:number)=>new Intl.NumberFormat('en-KE',{maximumFractionDigits:2}).format(v||0);
export default function ReportsWorkspace({session}:{session:{staffId:string;role:string}}){
 const today=isoDate(new Date()),monthStart=isoDate(new Date(new Date().getFullYear(),new Date().getMonth(),1));
 const [startDate,setStartDate]=useState(monthStart),[endDate,setEndDate]=useState(today),[branchId,setBranchId]=useState('');
 const [data,setData]=useState<ReportData|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function loadReports(){setBusy(true);setError('');try{const result=await invoke<ReportData>('get_management_reports',{actorStaffId:session.staffId,startDate,endDate,branchId:branchId||null});setData(result);}catch(e){setError(String(e).replace(/^Error: /,''));}finally{setBusy(false);setLoading(false);}}
 useEffect(()=>{loadReports();},[session.staffId]);
 const csvRows=useMemo(()=>{if(!data)return[];return [['Report','Value'],['Period',startDate+' to '+endDate],['Transactions',String(data.summary.transactions)],['Gross sales',String(data.summary.grossSales)],['Discounts',String(data.summary.discounts)],['Refunds',String(data.summary.refunds)],['Net sales',String(data.summary.netSales)],['Average sale',String(data.summary.averageSale)],['Purchase orders',String(data.summary.purchaseOrders)],['Purchases',String(data.summary.purchases)],['Outstanding supplier balances',String(data.summary.payables)],['Stock value',String(data.summary.stockValue)],['Low stock records',String(data.summary.lowStock)],['Accounting income',String(data.summary.accountingIncome)],['Accounting expenses',String(data.summary.accountingExpenses)],['Accounting net',String(data.summary.accountingNet)],[],['Daily sales'],['Date','Transactions','Gross sales','Refunds','Net sales'],...data.dailySales.map(x=>[x.date,String(x.transactions),String(x.sales),String(x.refunds),String(x.netSales)]),[],['Top products'],['Product','Quantity sold','Revenue','Cost'],...data.topProducts.map(x=>[x.name,String(x.quantity),String(x.revenue),String(x.cost)]),[],['Payment methods'],['Method','Transactions','Amount'],...data.paymentMethods.map(x=>[x.method,String(x.transactions),String(x.amount)]),[],['Branch summary'],['Branch','Transactions','Gross sales'],...data.branchSummary.map(x=>[x.branch,String(x.transactions),String(x.sales)])];},[data,startDate,endDate]);
 function exportCsv(){const csv=csvRows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const link=document.createElement('a');link.href=url;link.download='hardware-management-report-'+startDate+'-to-'+endDate+'.csv';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
 if(loading)return <section className="reports-workspace"><div className="content-card">Loading management reports…</div></section>;
 return <section className="reports-workspace">
  <div className="reports-toolbar content-card"><div><span className="eyebrow">BUSINESS PERFORMANCE</span><h2>Management reports</h2><p className="muted">Sales, inventory, purchasing and accounting snapshots from this computer's local database.</p></div>
   <div className="reports-filters"><label>From<input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)}/></label><label>To<input type="date" value={endDate} min={startDate} onChange={e=>setEndDate(e.target.value)}/></label>
    {data&&data.branches.length>0&&<label>Branch<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">All accessible branches</option>{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <button className="primary" onClick={loadReports} disabled={busy||!startDate||!endDate}>{busy?'Updating…':'Apply filters'}</button></div></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {data&&<>
   <div className="reports-actions"><span className="muted">Reporting period: {startDate} — {endDate}{branchId?' · '+(data.branches.find(b=>b.id===branchId)?.name||'Selected branch'):''}</span><div><button className="secondary" onClick={exportCsv}>Export CSV</button><button className="secondary" onClick={()=>window.print()}>Print report</button></div></div>
   <div className="reports-kpis">{[
    ['Net sales',money(data.summary.netSales),number(data.summary.transactions)+' transactions'],
    ['Refunds',money(data.summary.refunds),number(data.summary.returns)+' return transactions'],
    ['Discounts',money(data.summary.discounts),'Applied at point of sale'],
    ['Average sale',money(data.summary.averageSale),'Per recorded transaction'],
    ['Stock value',money(data.summary.stockValue),number(data.summary.products)+' active products'],
    ['Low stock',number(data.summary.lowStock),'Product / branch records at or below minimum']
   ].map(x=><article key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong><small>{x[2]}</small></article>)}</div>
   <div className="reports-grid">
    <section className="content-card"><div className="section-heading"><div><h3>Daily sales</h3><p>Gross sales less refunds recorded on the same date</p></div></div>
     {data.dailySales.length?<div className="table-wrap"><table><thead><tr><th>Date</th><th>Transactions</th><th>Gross</th><th>Refunds</th><th>Net sales</th></tr></thead><tbody>{data.dailySales.map(x=><tr key={x.date}><td>{x.date}</td><td>{number(x.transactions)}</td><td>{money(x.sales)}</td><td>{money(x.refunds)}</td><td><strong>{money(x.netSales)}</strong></td></tr>)}</tbody></table></div>:<p className="empty-state">No sales were recorded in this period.</p>}
    </section>
    <section className="content-card"><div className="section-heading"><div><h3>Payment methods</h3><p>Sales grouped by recorded payment method</p></div></div>{data.paymentMethods.length?<div className="report-list">{data.paymentMethods.map(x=><div key={x.method}><span><strong>{x.method}</strong><small>{number(x.transactions)} transactions</small></span><strong>{money(x.amount)}</strong></div>)}</div>:<p className="empty-state">No payment activity in this period.</p>}</section>
    <section className="content-card"><div className="section-heading"><div><h3>Top-selling products</h3><p>Ranked by recorded line revenue</p></div></div>{data.topProducts.length?<div className="table-wrap"><table><thead><tr><th>Product</th><th>Qty sold</th><th>Revenue</th><th>Cost</th></tr></thead><tbody>{data.topProducts.map(x=><tr key={x.productId}><td>{x.name}</td><td>{number(x.quantity)}</td><td>{money(x.revenue)}</td><td>{money(x.cost)}</td></tr>)}</tbody></table></div>:<p className="empty-state">No product sales in this period.</p>}</section>
    <section className="content-card"><div className="section-heading"><div><h3>Purchasing overview</h3><p>Purchase orders created in the selected period</p></div></div><div className="report-metric-list"><div><span>Purchase orders</span><strong>{number(data.summary.purchaseOrders)}</strong></div><div><span>Purchase value</span><strong>{money(data.summary.purchases)}</strong></div><div><span>Outstanding supplier balances</span><strong>{money(data.summary.payables)}</strong></div></div></section>
    <section className="content-card"><div className="section-heading"><div><h3>Accounting summary</h3><p>Posted journals for the selected period (business-wide)</p></div></div><div className="report-metric-list"><div><span>Accounting income</span><strong>{money(data.summary.accountingIncome)}</strong></div><div><span>Accounting expenses</span><strong>{money(data.summary.accountingExpenses)}</strong></div><div><span>Net result</span><strong>{money(data.summary.accountingNet)}</strong></div></div><small className="muted">Historic transactions not migrated to the ledger are excluded.</small></section>
    <section className="content-card"><div className="section-heading"><div><h3>Branch performance</h3><p>Gross sales and transaction count</p></div></div>{data.branchSummary.length?<div className="report-list">{data.branchSummary.map(x=><div key={x.branchId}><span><strong>{x.branch}</strong><small>{number(x.transactions)} transactions</small></span><strong>{money(x.sales)}</strong></div>)}</div>:<p className="empty-state">No branch data available.</p>}</section>
   </div>
   <p className="reports-footnote">Reports are calculated from data stored on this computer. Cloud consolidation and cross-branch synchronised reporting will be added separately; the accounting summary is business-wide and uses posted journals only.</p>
  </>}
 </section>;
}