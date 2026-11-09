import { useEffect, useMemo, useState } from 'react';
import { auth } from '@appdeploy/client';
import { api } from '@appdeploy/client';
import {
  Activity,
  ArrowDownUp,
  Boxes,
  Search,
  Pencil,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Users,
  Calculator,
  Warehouse,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { ShoppingCart } from 'lucide-react';

type Business = {
  id: string;
  name: string;
  tradingName?: string;
  kraPin?: string;
  phone?: string;
  email?: string;
  address?: string;
  county?: string;
  town?: string;
  currency: string;
  timezone: string;
  taxStatus: string;
  financialYearStart: string;
};
type Branch = {
  id: string;
  name: string;
  code: string;
  phone?: string;
  address?: string;
  isDefault: boolean;
};
type Store = {
  id: string;
  name: string;
  branchId: string;
  code: string;
  isDefault: boolean;
};
type Staff = {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string;
  status: string;
};

type Product = {
  id: string; name: string; category: string; unit: string; brand?: string;
  variant?: string; sku?: string; barcode?: string; purchaseUnit?: string;
  conversionFactor?: number; buyingPrice?: number; sellingPrice?: number;
  reorderLevel?: number; taxCategory?: string; active?: boolean; source?: string;
};

type Section =
  | 'overview'
  | 'business'
  | 'branches'
  | 'warehouses'
  | 'team'
  | 'products'
  | 'pos'
  | 'suppliers'
  | 'purchasing'
  | 'customers'
  | 'accounting'
  | 'sync';

const roles = [
  'Business Owner',
  'Branch Manager',
  'Accountant',
  'Cashier',
  'Salesperson',
  'Storekeeper',
  'Delivery Personnel',
];

function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [business, setBusiness] = useState<Business | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Store[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [posStock, setPosStock] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [accounting, setAccounting] = useState<any>({ accounts: [], journals: [], trialBalance: [], profitAndLoss: { income: 0, expenses: 0, netProfit: 0 }, balanceSheet: { assets: 0, liabilities: 0, equity: 0 }, cashbook: { cashBalance: 0 } });
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', accountCode: '5190', paymentMethod: 'CASH', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [cashbookForm, setCashbookForm] = useState({ direction: 'RECEIPT', description: '', amount: '', paymentMethod: 'CASH', accountCode: '4200', reference: '', date: new Date().toISOString().slice(0, 10) });
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [openingAmounts, setOpeningAmounts] = useState<Record<string, string>>({});
  const [supplierForm, setSupplierForm] = useState({ name: '', contactName: '', phone: '', email: '', kraPin: '', address: '' });
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', address: '', kraPin: '', notes: '' });
  const [editingCustomer, setEditingCustomer] = useState<string | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({ supplierId: '', branchId: '', warehouseId: '', invoiceNumber: '', expectedDate: '', notes: '' });
  const [purchaseLines, setPurchaseLines] = useState<any[]>([{ productId: '', quantity: '1', unitCost: '0' }]);
  const [purchasePayment, setPurchasePayment] = useState<Record<string, { amount: string; reference: string; paymentMethod: string }>>({});
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [refundSettlement, setRefundSettlement] = useState<Record<string, { paymentMethod: string; reference: string }>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [discountApproval, setDiscountApproval] = useState({ managerName: '', reason: '' });
  const [returnForm, setReturnForm] = useState({ saleId: '', productId: '', quantity: '1', condition: 'RESTOCK', refundMethod: 'CASH', reason: '' });
  const [posCart, setPosCart] = useState<any[]>([]);
  const [posSearch, setPosSearch] = useState('');
  const [posForm, setPosForm] = useState({ branchId: '', warehouseId: '', customerName: '', customerPhone: '', cashAmount: '', mpesaAmount: '', mpesaReference: '' });
  const [shift, setShift] = useState<any>(null);
  const [shiftFloat, setShiftFloat] = useState('0');
  const [shiftClosingCash, setShiftClosingCash] = useState('0');
  const [receiptSale, setReceiptSale] = useState<any>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState('All categories');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productForm, setProductForm] = useState({
    name: '', category: 'General supplies', brand: '', variant: '', unit: 'Piece',
    purchaseUnit: 'Piece', conversionFactor: '1', sku: '', barcode: '',
    buyingPrice: '0', sellingPrice: '0', reorderLevel: '0', taxCategory: 'Unconfigured',
  });
  const [stockForm, setStockForm] = useState({
    branchId: '', warehouseId: '', quantity: '', unitCost: '', reference: '', note: '',
  });
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [desktopPairing, setDesktopPairing] = useState<{ code: string; expiresAt: string; ownerDevice: boolean } | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [businessForm, setBusinessForm] = useState({
    name: '',
    tradingName: '',
    kraPin: '',
    phone: '',
    email: '',
    address: '',
    county: '',
    town: '',
    currency: 'KES',
    timezone: 'Africa/Nairobi',
    taxStatus: 'Not yet configured',
    financialYearStart: '01-01',
  });
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    phone: '',
    address: '',
    isDefault: false,
  });
  const [warehouseForm, setWarehouseForm] = useState({    name: '',
    code: '',
    branchId: '',
    isDefault: false,
  });
  const [staffForm, setStaffForm] = useState({
    name: '',
    email: '',
    role: 'Cashier',
    branchId: '',
  });

  useEffect(() => {
    auth
      .getUser()
      .then(setUser)
      .catch(e => setError(e.message || 'Unable to restore sign-in session.'))
      .finally(() => setAuthLoading(false));
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function loadWorkspace() {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [b, br, wh, tm, pd, st] = await Promise.all([
        api.get('/api/business'),
        api.get('/api/branches'),
        api.get('/api/warehouses'),
        api.get('/api/team'),
        api.get('/api/products'),
        api.get('/api/stock'),
        api.get('/api/pos/stock'),
        api.get('/api/sales'),
        api.get('/api/pos/shifts'),
      ]);
      setBusiness(b.data.business || null);
      setBranches(br.data.items || []);
      setWarehouses(wh.data.items || []);
      setStaff(tm.data.items || []);
      setProducts(pd.data.items || []);
      setStockMovements(st.data.items || []);
      setPosStock(st.data.items || []);
      setSales((await api.get('/api/sales')).data.items || []);
      setReturns((await api.get('/api/returns')).data.items || []);
      const [supplierData, purchaseData, customerData] = await Promise.all([api.get('/api/suppliers'), api.get('/api/purchases'), api.get('/api/customers')]);
      setSuppliers(supplierData.data.items || []);
      setPurchases(purchaseData.data.items || []);
      setCustomers(customerData.data.items || []);
      setAccounting((await api.get('/api/accounting')).data || accounting);
      setShift(((await api.get('/api/pos/shifts')).data.items || []).find((x: any) => x.status === 'OPEN') || null);
      if (b.data.business) {
        setBusinessForm({
          name: b.data.business.name || '',
          tradingName: b.data.business.tradingName || '',
          kraPin: b.data.business.kraPin || '',
          phone: b.data.business.phone || '',
          email: b.data.business.email || '',
          address: b.data.business.address || '',
          county: b.data.business.county || '',
          town: b.data.business.town || '',
          currency: b.data.business.currency || 'KES',
          timezone: b.data.business.timezone || 'Africa/Nairobi',
          taxStatus: b.data.business.taxStatus || 'Not yet configured',
          financialYearStart: b.data.business.financialYearStart || '01-01',
        });
      }
      setLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e.message ||
          'Could not load workspace data.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) loadWorkspace();
  }, [user]);

  const nav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'business', label: 'Business profile', icon: Building2 },
    { id: 'branches', label: 'Branches', icon: MapPin },
    { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
    { id: 'team', label: 'Team & access', icon: Users },
    { id: 'products', label: 'Products & stock', icon: Boxes },
    { id: 'pos', label: 'Point of Sale', icon: ShoppingCart },
    { id: 'suppliers', label: 'Suppliers', icon: Users },
    { id: 'purchasing', label: 'Purchasing', icon: Boxes },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'accounting', label: 'Accounting', icon: Calculator },
    { id: 'sync', label: 'Connectivity', icon: ArrowDownUp },
  ] as const;


  async function generateDesktopPairing() {
    setError('');
    setNotice('');
    setPairingLoading(true);
    try {
      const result = await api.post('/api/desktop/pairings', {});
      setDesktopPairing(result.data);
      setNotice('A one-time Windows pairing code has been generated. It expires in 10 minutes.');
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Could not generate a Windows pairing code.');
    } finally {
      setPairingLoading(false);
    }
  }

  async function saveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      const result = await api.post('/api/business', businessForm);
      setBusiness(result.data.business);
      setNotice('Business profile saved.');
      await loadWorkspace();
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          e.message ||
          'Could not save business profile.'
      );
    }
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/branches', branchForm);
      setBranchForm({
        name: '',
        code: '',
        phone: '',
        address: '',
        isDefault: false,
      });
      setNotice('Branch added successfully.');
      await loadWorkspace();
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e.message || 'Could not add branch.'
      );
    }
  }

  async function addWarehouse(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/warehouses', warehouseForm);
      setWarehouseForm({ name: '', code: '', branchId: '', isDefault: false });
      setNotice('Warehouse added successfully.');
      await loadWorkspace();
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e.message || 'Could not add warehouse.'
      );
    }
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.post('/api/team', staffForm);
      setStaffForm({ name: '', email: '', role: 'Cashier', branchId: '' });
      setNotice(
        'Team member profile added. Login invitation and credential provisioning are not enabled in this foundation phase.'
      );
      await loadWorkspace();
    } catch (e: any) {
      setError(
        e?.response?.data?.error || e.message || 'Could not add team member.'
      );
    }
  }

  const productCategories = ['Cement & masonry','Steel & metal','Roofing','Plumbing','Electrical','Timber & boards','Paint & finishes','Fasteners & fittings','Tools & equipment','Safety & protective wear','Doors & household','Agriculture & irrigation','General supplies'];
  const visibleProducts = products.filter(p =>
    (productCategory === 'All categories' || p.category === productCategory) &&
    [p.name, p.brand, p.variant, p.sku, p.barcode].join(' ').toLowerCase().includes(productSearch.toLowerCase())
  );
  function startNewProduct() {
    setEditingProduct(null);
    setProductForm({ name:'', category: productCategory === 'All categories' ? 'General supplies' : productCategory,
      brand:'', variant:'', unit:'Piece', purchaseUnit:'Piece', conversionFactor:'1',
      sku:'', barcode:'', buyingPrice:'0', sellingPrice:'0', reorderLevel:'0', taxCategory:'Unconfigured' });
  }
  function startEditProduct(product: Product) {
    setEditingProduct(product.id);
    setProductForm({
      name:product.name, category:product.category, brand:product.brand || '', variant:product.variant || '',
      unit:product.unit, purchaseUnit:product.purchaseUnit || product.unit,
      conversionFactor:String(product.conversionFactor || 1), sku:product.sku || '', barcode:product.barcode || '',
      buyingPrice:String(product.buyingPrice || 0), sellingPrice:String(product.sellingPrice || 0),
      reorderLevel:String(product.reorderLevel || 0), taxCategory:product.taxCategory || 'Unconfigured',
    });
  }
  async function saveProduct(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      const payload = { ...productForm, conversionFactor:Number(productForm.conversionFactor),
        buyingPrice:Number(productForm.buyingPrice), sellingPrice:Number(productForm.sellingPrice),
        reorderLevel:Number(productForm.reorderLevel) };
      if (editingProduct) await api.put('/api/products/' + editingProduct, payload);
      else await api.post('/api/products', payload);
      setNotice(editingProduct ? 'Product updated.' : 'Product added to your catalogue.');
      startNewProduct(); await loadWorkspace();
    } catch (e:any) {
      setError(e?.response?.data?.error || e.message || 'Could not save product.');
    }
  }
  async function receiveStock(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      await api.post('/api/stock/receive', {
        productId:selectedProductId, ...stockForm,
        quantity:Number(stockForm.quantity), unitCost:Number(stockForm.unitCost),
      });
      setNotice('Stock receipt recorded. Review the stock ledger for the saved movement.');
      setStockForm({ ...stockForm, quantity:'', unitCost:'', reference:'', note:'' });
      await loadWorkspace();
    } catch (e:any) {
      setError(e?.response?.data?.error || e.message || 'Could not record stock receipt.');
    }
  }


  const posProducts = products.filter(p => [p.name, p.brand, p.variant, p.sku, p.barcode].join(' ').toLowerCase().includes(posSearch.toLowerCase()));
  const posTotal = posCart.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - Number(item.discountPercent || 0) / 100), 0);
  const hasDiscount = posCart.some(item => Number(item.discountPercent || 0) > 0);
  const posPaid = Number(posForm.cashAmount || 0) + Number(posForm.mpesaAmount || 0);
  function addToCart(product: Product) {
    setPosCart(current => {
      const found = current.find(item => item.productId === product.id);
      if (found) return current.map(item => item.productId === product.id ? { ...item, quantity: Number(item.quantity) + 1 } : item);
      return [...current, { productId: product.id, name: product.name, unit: product.unit, quantity: 1, unitPrice: Number(product.sellingPrice || 0), discountPercent: 0 }];
    });
  }
  async function completeSale() {
    setError(''); setNotice('');
    if (!posForm.branchId || !posForm.warehouseId || !posCart.length) { setError('Select a branch, warehouse and at least one product.'); return; }
    if (!shift) { setError('Open a cashier shift before processing a sale.'); return; }
    if (Math.abs(posPaid - posTotal) > 0.01) { setError('Cash and M-Pesa payments must add up exactly to the sale total.'); return; }
    const payments = [
      ...(Number(posForm.cashAmount) > 0 ? [{ method: 'CASH', amount: Number(posForm.cashAmount) }] : []),
      ...(Number(posForm.mpesaAmount) > 0 ? [{ method: 'MPESA', amount: Number(posForm.mpesaAmount), reference: posForm.mpesaReference }] : []),
    ];
    try {              const result = await api.post('/api/sales', { branchId: posForm.branchId, warehouseId: posForm.warehouseId, customerId: (posForm as any).customerId || '', customerName: posForm.customerName, customerPhone: posForm.customerPhone, items: posCart.map(item => ({ productId: item.productId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), discountPercent: Number(item.discountPercent || 0) })), payments, shiftId: shift.id, discountApproval: hasDiscount ? discountApproval : null });
      setReceiptSale(result.data.sale);
      setPosCart([]);
      setDiscountApproval({ managerName: '', reason: '' });
      setPosForm({ ...posForm, customerName: '', customerPhone: '', cashAmount: '', mpesaAmount: '', mpesaReference: '' });
      setNotice('Sale completed. Stock has been deducted and the receipt is ready.');
      await loadWorkspace();
    } catch (e: any) { setError(e?.response?.data?.error || e.message || 'Could not complete sale.'); }
  }
  async function openShift() {
    try { const r = await api.post('/api/pos/shifts/open', { branchId: posForm.branchId, openingFloat: Number(shiftFloat || 0) }); setShift(r.data.shift); setNotice('Cashier shift opened.'); }
    catch (e: any) { setError(e?.response?.data?.error || e.message || 'Could not open shift.'); }
  }
  async function closeShift() {
    if (!shift) return;
    try { await api.post('/api/pos/shifts/' + shift.id + '/close', { closingCash: Number(shiftClosingCash || 0) }); setShift(null); setNotice('Cashier shift closed.'); await loadWorkspace(); }
    catch (e: any) { setError(e?.response?.data?.error || e.message || 'Could not close shift.'); }
  }
  async function saveSupplier(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      if (editingSupplier) await api.put('/api/suppliers/' + editingSupplier, supplierForm);
      else await api.post('/api/suppliers', supplierForm);
      setSupplierForm({ name: '', contactName: '', phone: '', email: '', kraPin: '', address: '' }); setEditingSupplier(null);
      setNotice(editingSupplier ? 'Supplier updated.' : 'Supplier added.'); await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not save supplier.'); }
  }
  async function saveOpeningBalances(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    const balances = Object.entries(openingAmounts)
      .filter(([, amount]) => amount.trim() !== '')
      .map(([accountCode, amount]) => ({ accountCode, amount: Number(amount) }));
    try {
      const result = await api.post('/api/accounting/opening-balances', {
        effectiveDate: openingDate,
        balances,
      });
      setNotice('Opening balances posted successfully. The opening journal is now locked against duplicate posting.');
      setOpeningAmounts({});
      setAccounting((await api.get('/api/accounting')).data || result.data);
      await loadWorkspace();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Could not post opening balances.');
    }
  }

  async function saveExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    try {
      await api.post('/api/accounting/expenses', { ...expenseForm, amount: Number(expenseForm.amount) });
      setExpenseForm({ ...expenseForm, description: '', amount: '', reference: '', notes: '' });
      setNotice('Expense saved and posted to the accounting ledger.');
      await loadWorkspace();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Could not save this expense.');
    }
  }

  async function saveCashbookEntry(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    try {
      await api.post('/api/accounting/cashbook', { ...cashbookForm, amount: Number(cashbookForm.amount) });
      setCashbookForm({ ...cashbookForm, description: '', amount: '', reference: '' });
      setNotice('Cashbook transaction saved and posted to the ledger.');
      await loadWorkspace();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Could not save this cashbook entry.');
    }
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      if (editingCustomer) await api.put('/api/customers/' + editingCustomer, customerForm);
      else await api.post('/api/customers', customerForm);
      setCustomerForm({ name: '', phone: '', email: '', address: '', kraPin: '', notes: '' }); setEditingCustomer(null);
      setNotice(editingCustomer ? 'Customer updated.' : 'Customer added.'); await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not save customer.'); }
  }
  async function createPurchase(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      const items = purchaseLines.filter(x => x.productId).map(x => ({ productId: x.productId, quantity: Number(x.quantity), unitCost: Number(x.unitCost) }));
      const result = await api.post('/api/purchases', { ...purchaseForm, items });
      setNotice('Purchase order ' + result.data.purchase.orderNumber + ' created. Stock will increase only when goods are received.');
      setPurchaseForm({ supplierId: '', branchId: '', warehouseId: '', invoiceNumber: '', expectedDate: '', notes: '' });
      setPurchaseLines([{ productId: '', quantity: '1', unitCost: '0' }]); await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not create purchase order.'); }
  }
  async function receivePurchase(purchaseId: string, productId: string, remaining: number) {
    const quantity = Number(receiveQuantities[purchaseId + ':' + productId] || remaining);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > remaining) { setError('Enter a positive quantity no greater than the outstanding amount.'); return; }
    setError(''); setNotice('');
    try {
      const result = await api.post('/api/purchases/' + purchaseId + '/receive', { items: [{ productId, quantity }] });
      setNotice('Goods received: ' + result.data.receivedQuantity + ' unit(s). Purchase order status: ' + result.data.status + '.');
      setReceiveQuantities({ ...receiveQuantities, [purchaseId + ':' + productId]: '' });
      await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not receive this purchase.'); }
  }
  async function paySupplier(purchaseId: string) {
    const payment = purchasePayment[purchaseId] || { amount: '', reference: '', paymentMethod: 'BANK' };
    setError(''); setNotice('');
    try {
      await api.post('/api/purchases/' + purchaseId + '/payments', { amount: Number(payment.amount), reference: payment.reference, paymentMethod: payment.paymentMethod });
      setPurchasePayment({ ...purchasePayment, [purchaseId]: { amount: '', reference: '', paymentMethod: 'BANK' } });
      setNotice('Supplier payment recorded and posted to the corresponding cash, M-Pesa or bank ledger.');
      await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not record supplier payment.'); }
  }
  async function settleRefund(returnId: string) {
    const settlement = refundSettlement[returnId] || { paymentMethod: 'CASH', reference: '' };
    setError(''); setNotice('');
    try {
      await api.post('/api/returns/' + returnId + '/refund', settlement);
      setNotice('Refund settled and posted to the selected cash/M-Pesa ledger.');
      await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not settle this refund.'); }
  }

  async function processReturn(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    try {      const result = await api.post('/api/returns', { ...returnForm, quantity: Number(returnForm.quantity) });
      setNotice('Return recorded. Refund due: KSh ' + Number(result.data.returnRecord.refundAmount).toLocaleString('en-KE') + (returnForm.condition === 'RESTOCK' ? '. Stock has been restored.' : '. Item recorded as damaged and not returned to saleable stock.') + ' Process the actual cash/M-Pesa refund separately.');
      setReturnForm({ ...returnForm, quantity: '1', reason: '' });
      await loadWorkspace();
    } catch (e:any) { setError(e?.response?.data?.error || e.message || 'Could not process this return.'); }
  }
  function printReceipt(sale: any) {
    setReceiptSale(sale);
    window.setTimeout(() => window.print(), 100);
  }

  function csvCell(value: unknown) {
    const text = String(value ?? '');
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function exportProducts() {
    const columns = ['name','category','brand','variant','unit','purchaseUnit','conversionFactor','sku','barcode','buyingPrice','sellingPrice','reorderLevel','taxCategory'];
    const rows = [columns.join(','), ...products.map(p=>columns.map(key=>csvCell((p as any)[key])).join(','))];
    const blob = new Blob([rows.join('\\r\\n')], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'hardware-product-catalogue.csv'; anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Product catalogue exported as CSV.');
  }
  async function importProducts(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(''); setNotice('');
    try {
      const raw = await file.text();
      const lines = raw.split(/\\r?\\n/).filter(line=>line.trim());
      if (lines.length < 2) throw new Error('The CSV must contain a header row and at least one product.');
      const parseLine = (line:string) => {
        const values:string[]=[]; let current=''; let quoted=false;
        for(let i=0;i<line.length;i++){ const ch=line[i];
          if(ch==='"' && quoted && line[i+1]==='"'){current+='"';i++;}
          else if(ch==='"') quoted=!quoted;
          else if(ch===',' && !quoted){values.push(current);current='';}
          else current+=ch;
        }
        values.push(current); return values;
      };
      const headers=parseLine(lines[0]).map(x=>x.trim());
      const rows=lines.slice(1).map(line=>{
        const values=parseLine(line); const row:Record<string,string>={};
        headers.forEach((header,index)=>row[header]=(values[index]||'').trim());
        return row;
      });
      const result=await api.post('/api/products/import',{items:rows});
      setNotice('CSV import complete: '+result.data.imported+' products added; '+result.data.skipped+' rows skipped (invalid or duplicate).');
      await loadWorkspace();
    } catch(e:any) {
      setError(e?.response?.data?.error || e.message || 'Could not import this CSV file.');
    } finally { event.target.value=''; }
  }

  async function signIn() {
    setError('');
    try {
      await auth.signInWithRedirect();
    } catch (e: any) {
      setError(e.message || 'Sign-in could not start. Please try again.');
    }
  }

  async function signOut() {
    await auth.signOut();
    setUser(null);
    setBusiness(null);
    setBranches([]);
    setWarehouses([]);
    setStaff([]);
  }

  const activeSection = nav.find(n => n.id === section)?.label || 'Overview';
  const readyCount = [
    !!business,
    branches.length > 0,
    warehouses.length > 0,
  ].filter(Boolean).length;
  const completion = Math.round((readyCount / 3) * 100);
  const initials = useMemo(
    () => (user?.name || user?.email || 'U').slice(0, 1).toUpperCase(),
    [user]
  );

  if (authLoading)
    return (
      <div className="loading-screen">
        <div className="loader" />
        <span>Restoring secure session…</span>
      </div>
    );

  if (!user)
    return (
      <div className="login-shell">
        <div className="login-art">
          <div className="brand">
            <div className="brand-mark">
              <Package size={23} />
            </div>
            <span>
              Hardware<span className="brand-light">Desk</span>
            </span>
          </div>
          <div className="login-message">
            <span className="eyebrow">RETAIL MANAGEMENT · KENYA</span>
            <h1>Run your hardware business with clarity.</h1>
            <p>
              A connected foundation for products, branches, people and the
              operations that keep your business moving.
            </p>
            <div className="login-points">
              <span>
                <CheckCircle2 size={16} /> Built for hardware retail
              </span>
              <span>
                <CheckCircle2 size={16} /> Designed for multi-branch growth
              </span>
              <span>
                <CheckCircle2 size={16} /> KES and Kenya-ready settings
              </span>
            </div>
          </div>
          <div className="login-foot">
            A practical foundation for growing Kenyan businesses.
          </div>
        </div>
        <div className="login-panel">
          <div className="login-card">
            <div className="mobile-brand">
              <div className="brand-mark">
                <Package size={21} />
              </div>
              <b>HardwareDesk</b>
            </div>
            <span className="eyebrow">WELCOME</span>
            <h2>Sign in to your workspace</h2>
            <p>Use your AppDeploy account to access your business workspace.</p>
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full" onClick={signIn}>
              Continue to secure sign in <span>→</span>
            </button>
            <div className="secure-note">
              <ShieldCheck size={15} /> Secure authentication
            </div>
            <div className="legal-note">
              By continuing, you agree to use this system in accordance with
              your organization's policies. Add your business Terms and Privacy
              links before commercial launch.
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand side-brand">
          <div className="brand-mark">
            <Package size={21} />
          </div>
          <span>
            Hardware<span className="brand-light">Desk</span>
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-avatar">
            {business?.name?.slice(0, 1).toUpperCase() || 'H'}
          </div>
          <div className="workspace-copy">
            <strong>{business?.name || 'New business'}</strong>
            <span>{business ? 'Business workspace' : 'Setup in progress'}</span>
          </div>
          <ChevronDown size={15} />
        </div>        <div className="nav-label">MANAGEMENT</div>
        <nav>
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={section === item.id ? 'nav-item active' : 'nav-item'}
                onClick={() => {
                  setSection(item.id);
                  setError('');
                  setNotice('');
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.id === 'sync' && (
                  <span className={online ? 'nav-dot online' : 'nav-dot'} />
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <div className="phase-icon">
              <ShieldCheck size={17} />
            </div>
            <div>
              <strong>Point of Sale phase</strong>
              <span>Sales & cashier operations</span>
            </div>
          </div>
          <button className="nav-item" onClick={() => setSection('sync')}>
            <Settings size={18} />
            <span>System status</span>
          </button>
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-copy">
              <strong>{user.name || 'Workspace user'}</strong>
              <span>{user.email || 'Signed in'}</span>
            </div>
            <button className="icon-button" title="Sign out" onClick={signOut}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              HardwareDesk <span>/</span> {activeSection}
            </div>
            <h1>{activeSection}</h1>
          </div>
          <div className="top-actions">
            <div
              className={
                online
                  ? 'connection-pill connected'
                  : 'connection-pill disconnected'
              }
            >
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}{' '}
              {online ? 'Online' : 'Offline'}
            </div>
            <button
              className="icon-button refresh-button"
              onClick={loadWorkspace}
              disabled={loading}
            >
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
            <div className="top-avatar">{initials}</div>
          </div>
        </header>
        <div className="content">
          {error && <div className="alert error">{error}</div>}
          {notice && (
            <div className="alert success">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}

          {section === 'overview' && (
            <>
              <div className="welcome-row">
                <div>
                  <h2>
                    {business
                      ? 'Your workspace is taking shape.'
                      : 'Let’s set up your business.'}
                  </h2>
                  <p>
                    Complete the foundation details before adding products and
                    processing transactions.
                  </p>
                </div>
                <span className="phase-tag">
                  <Activity size={14} /> PHASE 3 · POINT OF SALE
                </span>
              </div>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Business profile</span>
                    <Building2 size={18} />
                  </div>
                  <strong className="stat-value">
                    {business ? 'Configured' : 'Not set up'}
                  </strong>
                  <span className="stat-foot">
                    {business?.name || 'Add your business details'}
                  </span>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Branches</span>
                    <MapPin size={18} />
                  </div>
                  <strong className="stat-value">{branches.length}</strong>
                  <span className="stat-foot">Registered locations</span>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Warehouses</span>
                    <Warehouse size={18} />
                  </div>
                  <strong className="stat-value">{warehouses.length}</strong>
                  <span className="stat-foot">Stock locations</span>
                </div>
                <div className="stat-card">
                  <div className="stat-top">
                    <span>Team profiles</span>
                    <Users size={18} />
                  </div>
                  <strong className="stat-value">{staff.length + 1}</strong>
                  <span className="stat-foot">Including you</span>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="panel setup-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Foundation checklist</h3>
                      <p>Prepare your business workspace</p>
                    </div>
                    <span className="completion">{completion}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-value"
                      style={{ width: completion + '%' }}
                    />
                  </div>
                  {[
                    {
                      done: !!business,
                      title: 'Set up business profile',
                      desc: 'Business identity, KRA PIN and regional settings',
                      target: 'business',
                      icon: Building2,
                    },
                    {
                      done: branches.length > 0,
                      title: 'Register your first branch',
                      desc: 'Create the first operating location',
                      target: 'branches',
                      icon: MapPin,
                    },
                    {
                      done: warehouses.length > 0,
                      title: 'Create a warehouse',
                      desc: 'Define where your stock will be held',
                      target: 'warehouses',
                      icon: Warehouse,                    },
                  ].map(x => {
                    const Icon = x.icon;
                    return (
                      <button
                        className="check-row"
                        key={x.target}
                        onClick={() => setSection(x.target as Section)}
                      >
                        <span
                          className={x.done ? 'check-icon done' : 'check-icon'}
                        >
                          {x.done ? (
                            <CheckCircle2 size={17} />
                          ) : (
                            <Icon size={17} />
                          )}
                        </span>
                        <span className="check-copy">
                          <strong>{x.title}</strong>
                          <small>{x.desc}</small>
                        </span>
                        <span className="check-action">
                          {x.done ? 'Complete' : 'Set up'} →
                        </span>
                      </button>
                    );
                  })}
                </section>
                <section className="panel status-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>System status</h3>
                      <p>Current environment indicators</p>
                    </div>
                    <span className="status-live">
                      <i /> LIVE
                    </span>
                  </div>
                  <div className="status-row">
                    <span>
                      <Cloud size={17} /> Cloud connection
                    </span>
                    <b className={online ? 'text-green' : 'text-amber'}>
                      {online ? 'Available' : 'Offline'}
                    </b>
                  </div>
                  <div className="status-row">
                    <span>
                      <Database size={17} /> Cloud workspace data
                    </span>
                    <b>{business ? 'Initialized' : 'Not initialized'}</b>
                  </div>
                  <div className="status-row">
                    <span>
                      <HardDrive size={17} /> Native local database
                    </span>
                    <b className="text-amber">Not validated</b>
                  </div>
                  <div className="status-row">
                    <span>
                      <Smartphone size={17} /> Android package
                    </span>
                    <b className="text-amber">Not validated</b>
                  </div>
                  <div className="status-row">
                    <span>
                      <PrinterIcon /> ETR / printer devices
                    </span>
                    <b className="text-amber">Not configured</b>
                  </div>
                  <div className="status-note">
                    <ShieldCheck size={16} /> Native packaging and offline
                    database validation are separate technical gates; this
                    hosted workspace does not claim those capabilities yet.
                  </div>
                </section>
              </div>
              <section className="panel next-panel">
                <div className="next-icon">
                  <Package size={20} />
                </div>
                <div>
                  <h3>Next development milestone</h3>
                  <p>
                    Supplier management, purchase orders, goods received notes
                    and customer account workflows.
                  </p>
                </div>
                <span className="coming-soon">PHASE 4</span>
              </section>
            </>
          )}

          {section === 'business' && (
            <section className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <h3>Business information</h3>
                  <p>
                    These details identify your business across documents and
                    reports.
                  </p>
                </div>
                <span className="required-note">* Required fields</span>
              </div>
              <form onSubmit={saveBusiness}>
                <div className="form-section-title">Business identity</div>
                <div className="form-grid">
                  <Field
                    label="Registered business name *"
                    value={businessForm.name}
                    required
                    onChange={v =>
                      setBusinessForm({ ...businessForm, name: v })
                    }
                  />
                  <Field
                    label="Trading name"
                    value={businessForm.tradingName}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, tradingName: v })
                    }
                  />
                  <Field
                    label="KRA PIN"
                    value={businessForm.kraPin}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, kraPin: v })
                    }
                    placeholder="P000000000X"
                  />
                  <Field
                    label="Telephone"
                    value={businessForm.phone}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, phone: v })
                    }
                    placeholder="+254 7XX XXX XXX"
                  />
                  <Field
                    label="Business email"
                    value={businessForm.email}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, email: v })
                    }
                    type="email"
                  />
                  <Field
                    label="Physical address"
                    value={businessForm.address}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, address: v })
                    }
                  />
                  <Field
                    label="County"
                    value={businessForm.county}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, county: v })
                    }
                  />
                  <Field
                    label="Town"
                    value={businessForm.town}
                    onChange={v =>
                      setBusinessForm({ ...businessForm, town: v })
                    }
                  />
                </div>
                <div className="form-section-title separated">
                  Regional and financial defaults
                </div>
                <div className="form-grid">
                  <Field
                    label="Currency"
                    value={businessForm.currency}
                    required
                    onChange={v =>
                      setBusinessForm({ ...businessForm, currency: v })                    }
                  />
                  <Field
                    label="Time zone"
                    value={businessForm.timezone}
                    required
                    onChange={v =>
                      setBusinessForm({ ...businessForm, timezone: v })
                    }
                  />
                  <label className="field">
                    <span>Tax registration status</span>
                    <select
                      value={businessForm.taxStatus}
                      onChange={e =>
                        setBusinessForm({
                          ...businessForm,
                          taxStatus: e.target.value,
                        })
                      }
                    >
                      <option>Not yet configured</option>
                      <option>VAT registered</option>
                      <option>Not VAT registered</option>
                      <option>Exempt / special status – verify</option>
                    </select>
                  </label>
                  <Field
                    label="Financial year starts (DD-MM)"
                    value={businessForm.financialYearStart}
                    onChange={v =>
                      setBusinessForm({
                        ...businessForm,
                        financialYearStart: v,
                      })
                    }
                  />
                </div>
                <div className="form-footer">
                  <span>
                    Business data is stored in your authenticated cloud
                    workspace.
                  </span>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={loading}
                  >
                    Save business profile <span>→</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {section === 'branches' && (
            <div className="two-column">
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Add a branch</h3>
                    <p>Register each physical operating location.</p>
                  </div>
                </div>
                <form onSubmit={addBranch}>
                  <Field
                    label="Branch name *"
                    value={branchForm.name}
                    required
                    onChange={v => setBranchForm({ ...branchForm, name: v })}
                    placeholder="e.g. Eldoret Main Branch"
                  />
                  <Field
                    label="Branch code *"
                    value={branchForm.code}
                    required
                    onChange={v =>
                      setBranchForm({ ...branchForm, code: v.toUpperCase() })
                    }
                    placeholder="ELD-001"
                  />
                  <Field
                    label="Telephone"
                    value={branchForm.phone}
                    onChange={v => setBranchForm({ ...branchForm, phone: v })}
                  />
                  <Field
                    label="Physical address"
                    value={branchForm.address}
                    onChange={v => setBranchForm({ ...branchForm, address: v })}
                  />
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={branchForm.isDefault}
                      onChange={e =>
                        setBranchForm({
                          ...branchForm,
                          isDefault: e.target.checked,
                        })
                      }
                    />{' '}
                    Set as default branch
                  </label>
                  <button
                    className="primary-button full"
                    type="submit"
                    disabled={!business}
                  >
                    {' '}
                    <Plus size={17} /> Add branch
                  </button>
                  {!business && (
                    <small className="helper">
                      Save the business profile before adding branches.
                    </small>
                  )}
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Registered branches</h3>
                    <p>{branches.length} operating locations</p>
                  </div>
                  <span className="count-pill">{branches.length}</span>
                </div>
                {branches.length === 0 ? (
                  <EmptyState
                    icon={<MapPin size={22} />}
                    title="No branches yet"
                    text="Your first branch will appear here after registration."
                  />
                ) : (
                  <div className="record-list">
                    {branches.map(b => (
                      <div className="record-row" key={b.id}>
                        <div className="record-icon">
                          <Building2 size={18} />
                        </div>
                        <div className="record-copy">
                          <strong>{b.name}</strong>
                          <small>
                            {b.code} {b.address ? '· ' + b.address : ''}
                          </small>
                        </div>
                        {b.isDefault && (
                          <span className="default-tag">DEFAULT</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {section === 'warehouses' && (
            <div className="two-column">
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Add a warehouse</h3>
                    <p>Define a stock storage location within a branch.</p>
                  </div>
                </div>
                <form onSubmit={addWarehouse}>
                  <Field
                    label="Warehouse name *"
                    value={warehouseForm.name}
                    required
                    onChange={v =>
                      setWarehouseForm({ ...warehouseForm, name: v })
                    }
                    placeholder="e.g. Main Store"
                  />
                  <Field
                    label="Warehouse code *"
                    value={warehouseForm.code}
                    required                    onChange={v =>
                      setWarehouseForm({
                        ...warehouseForm,
                        code: v.toUpperCase(),
                      })
                    }
                    placeholder="WH-001"
                  />
                  <label className="field">
                    <span>Branch *</span>
                    <select
                      required
                      value={warehouseForm.branchId}
                      onChange={e =>
                        setWarehouseForm({
                          ...warehouseForm,
                          branchId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select branch</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={warehouseForm.isDefault}
                      onChange={e =>
                        setWarehouseForm({
                          ...warehouseForm,
                          isDefault: e.target.checked,
                        })
                      }
                    />{' '}
                    Set as default warehouse
                  </label>
                  <button
                    className="primary-button full"
                    type="submit"
                    disabled={branches.length === 0}
                  >
                    <Plus size={17} /> Add warehouse
                  </button>
                  {branches.length === 0 && (
                    <small className="helper">
                      Create a branch before adding a warehouse.
                    </small>
                  )}
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Warehouses</h3>
                    <p>{warehouses.length} registered stock locations</p>
                  </div>
                  <span className="count-pill">{warehouses.length}</span>
                </div>
                {warehouses.length === 0 ? (
                  <EmptyState
                    icon={<Warehouse size={22} />}
                    title="No warehouses yet"
                    text="Create a warehouse and link it to a branch."
                  />
                ) : (
                  <div className="record-list">
                    {warehouses.map(w => (
                      <div className="record-row" key={w.id}>
                        <div className="record-icon">
                          <Warehouse size={18} />
                        </div>
                        <div className="record-copy">
                          <strong>{w.name}</strong>
                          <small>
                            {w.code} ·{' '}
                            {branches.find(b => b.id === w.branchId)?.name ||
                              'Branch'}
                          </small>
                        </div>
                        {w.isDefault && (
                          <span className="default-tag">DEFAULT</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {section === 'team' && (
            <div className="two-column">
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Add team profile</h3>
                    <p>Record staff and their intended operational role.</p>
                  </div>
                </div>
                <form onSubmit={addStaff}>
                  <Field
                    label="Full name *"
                    value={staffForm.name}
                    required
                    onChange={v => setStaffForm({ ...staffForm, name: v })}
                  />
                  <Field
                    label="Email address *"
                    value={staffForm.email}
                    type="email"
                    required
                    onChange={v => setStaffForm({ ...staffForm, email: v })}
                  />
                  <label className="field">
                    <span>Role *</span>
                    <select
                      value={staffForm.role}
                      onChange={e =>
                        setStaffForm({ ...staffForm, role: e.target.value })
                      }
                    >
                      {roles
                        .filter(r => r !== 'Business Owner')
                        .map(r => (
                          <option key={r}>{r}</option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Assigned branch</span>
                    <select
                      value={staffForm.branchId}
                      onChange={e =>
                        setStaffForm({ ...staffForm, branchId: e.target.value })
                      }
                    >
                      <option value="">Not assigned</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-button full" type="submit">
                    <Plus size={17} /> Add team profile
                  </button>
                  <div className="status-note">
                    <ShieldCheck size={16} /> This phase records staff profiles
                    and intended roles only. Individual sign-in invitations and
                    enforced per-user permissions require the next
                    authentication provisioning step.
                  </div>
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Team directory</h3>
                    <p>People recorded in this workspace</p>
                  </div>
                  <span className="count-pill">{staff.length + 1}</span>
                </div>
                <div className="record-list">
                  <div className="record-row">
                    <div className="record-icon">
                      <Users size={18} />
                    </div>
                    <div className="record-copy">
                      <strong>
                        {user.name || user.email || 'Workspace owner'}
                      </strong>
                      <small>Business Owner · Account holder</small>
                    </div>
                    <span className="default-tag">OWNER</span>                  </div>
                  {staff.map(s => (
                    <div className="record-row" key={s.id}>
                      <div className="record-icon">
                        <Users size={18} />
                      </div>
                      <div className="record-copy">
                        <strong>{s.name}</strong>
                        <small>
                          {s.role} · {s.email}
                        </small>
                      </div>
                      <span className="pending-tag">PROFILE</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}


          {section === 'products' && (
            <div className="inventory-layout">
              <section className="panel catalogue-panel">
                <div className="panel-heading">
                  <div><h3>Hardware product catalogue</h3><p>Choose an existing item or create a product specific to your shop.</p></div>
                  <span className="count-pill">{products.length} items</span>
                </div>
                <div className="catalogue-toolbar">
                  <label className="search-box"><Search size={16}/><input value={productSearch} onChange={e=>setProductSearch(e.target.value)} placeholder="Search product, brand, SKU or barcode"/></label>
                  <select value={productCategory} onChange={e=>setProductCategory(e.target.value)}>
                    <option>All categories</option>
                    {productCategories.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <button className="secondary-button" onClick={exportProducts}>Export CSV</button>
                  <label className="secondary-button import-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={importProducts}/></label>
                  <button className="primary-button" onClick={startNewProduct}><Plus size={15}/> Add new item</button>
                </div>
                <div className="catalogue-grid">
                  {visibleProducts.map(product=>(
                    <article className={selectedProductId===product.id ? 'product-tile selected' : 'product-tile'} key={product.id}>
                      <button className="product-pick" onClick={()=>setSelectedProductId(product.id)}>
                        <span className="product-category">{product.category}</span>
                        <strong>{product.name}</strong>
                        <small>{[product.brand,product.variant].filter(Boolean).join(' · ') || product.sku || 'Standard item'}</small>
                        <span className="product-unit">Unit: {product.unit}</span>
                      </button>
                      <button className="product-edit" title="Edit product" onClick={()=>startEditProduct(product)}><Pencil size={14}/></button>
                    </article>
                  ))}
                  {visibleProducts.length===0 && <div className="empty-state"><Package size={25}/><strong>No matching products</strong><p>Try another search or add this item to your business catalogue.</p><button className="primary-button" onClick={startNewProduct}>Add this product</button></div>}
                </div>
              </section>
              <section className="panel product-form-panel">
                <div className="panel-heading"><div><h3>{editingProduct ? 'Edit product' : 'Add a custom product'}</h3><p>New products become available to your business users.</p></div></div>
                <form onSubmit={saveProduct} className="product-form">
                  <label className="field"><span>Product name *</span><input required value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="e.g. Heavy duty gate hinge"/></label>
                  <label className="field"><span>Category *</span><select value={productForm.category} onChange={e=>setProductForm({...productForm,category:e.target.value})}>{productCategories.map(c=><option key={c}>{c}</option>)}</select></label>
                  <div className="form-grid">
                    <label className="field"><span>Brand</span><input value={productForm.brand} onChange={e=>setProductForm({...productForm,brand:e.target.value})}/></label>
                    <label className="field"><span>Size / variation</span><input value={productForm.variant} onChange={e=>setProductForm({...productForm,variant:e.target.value})} placeholder="e.g. ¾ inch, 6m"/></label>
                    <label className="field"><span>Stock unit *</span><select value={productForm.unit} onChange={e=>setProductForm({...productForm,unit:e.target.value})}>{['Piece','Bag','Kg','Gram','Metre','Foot','Roll','Box','Sheet','Tin','Litre','Bottle','Pair','Set','Pack','Ton','Bucket','Kit'].map(x=><option key={x}>{x}</option>)}</select></label>
                    <label className="field"><span>Purchase unit</span><select value={productForm.purchaseUnit} onChange={e=>setProductForm({...productForm,purchaseUnit:e.target.value})}>{['Piece','Bag','Kg','Gram','Metre','Roll','Box','Sheet','Tin','Litre','Bottle','Pair','Set','Pack','Ton','Bucket','Kit'].map(x=><option key={x}>{x}</option>)}</select></label>
                    <label className="field"><span>Units per purchase unit</span><input type="number" min="0.000001" step="any" value={productForm.conversionFactor} onChange={e=>setProductForm({...productForm,conversionFactor:e.target.value})}/></label>
                    <label className="field"><span>SKU / item code</span><input value={productForm.sku} onChange={e=>setProductForm({...productForm,sku:e.target.value})}/></label>
                    <label className="field"><span>Barcode</span><input value={productForm.barcode} onChange={e=>setProductForm({...productForm,barcode:e.target.value})}/></label>
                    <label className="field"><span>Buying price (KSh)</span><input type="number" min="0" step="0.01" value={productForm.buyingPrice} onChange={e=>setProductForm({...productForm,buyingPrice:e.target.value})}/></label>
                    <label className="field"><span>Selling price (KSh)</span><input type="number" min="0" step="0.01" value={productForm.sellingPrice} onChange={e=>setProductForm({...productForm,sellingPrice:e.target.value})}/></label>
                    <label className="field"><span>Reorder level</span><input type="number" min="0" step="any" value={productForm.reorderLevel} onChange={e=>setProductForm({...productForm,reorderLevel:e.target.value})}/></label>
                    <label className="field"><span>Tax category</span><select value={productForm.taxCategory} onChange={e=>setProductForm({...productForm,taxCategory:e.target.value})}>{['Unconfigured','VAT standard','VAT zero-rated','Exempt','Out of scope'].map(x=><option key={x}>{x}</option>)}</select></label>
                  </div>
                  <div className="form-footer"><span>Product and stock are stored separately. Prices are business defaults for now.</span><button className="primary-button" type="submit"><CheckCircle2 size={15}/> Save product</button></div>
                </form>
              </section>
              <section className="panel receive-panel">
                <div className="panel-heading"><div><h3>Receive opening / new stock</h3><p>Select a catalogue item, then record the stock received at a branch warehouse.</p></div></div>
                {selectedProductId ? <div className="selected-product"><Package size={17}/><strong>{products.find(p=>p.id===selectedProductId)?.name}</strong><button className="text-button" onClick={()=>setSelectedProductId('')}>Change</button></div> : <div className="helper">Select a product from the catalogue above to continue.</div>}
                <form onSubmit={receiveStock} className="product-form">
                  <div className="form-grid">
                    <label className="field"><span>Branch *</span><select required value={stockForm.branchId} onChange={e=>setStockForm({...stockForm,branchId:e.target.value,warehouseId:''})}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                    <label className="field"><span>Warehouse *</span><select required value={stockForm.warehouseId} onChange={e=>setStockForm({...stockForm,warehouseId:e.target.value})}><option value="">Select warehouse</option>{warehouses.filter(w=>w.branchId===stockForm.branchId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                    <label className="field"><span>Quantity received *</span><input required type="number" min="0.0001" step="any" value={stockForm.quantity} onChange={e=>setStockForm({...stockForm,quantity:e.target.value})}/></label>
                    <label className="field"><span>Unit cost (KSh) *</span><input required type="number" min="0" step="0.01" value={stockForm.unitCost} onChange={e=>setStockForm({...stockForm,unitCost:e.target.value})}/></label>
                    <label className="field"><span>Supplier invoice / reference</span><input value={stockForm.reference} onChange={e=>setStockForm({...stockForm,reference:e.target.value})}/></label>
                    <label className="field"><span>Note</span><input value={stockForm.note} onChange={e=>setStockForm({...stockForm,note:e.target.value})}/></label>
                  </div>
                  <div className="form-footer"><span>Receipt total: KSh {(Number(stockForm.quantity||0)*Number(stockForm.unitCost||0)).toLocaleString('en-KE',{maximumFractionDigits:2})}</span><button className="primary-button" type="submit" disabled={!selectedProductId || !stockForm.branchId || !stockForm.warehouseId}><Boxes size={15}/> Record stock receipt</button></div>
                </form>
                <div className="ledger-heading"><strong>Recent stock receipts</strong><span>{stockMovements.length} movements</span></div>
                {stockMovements.slice(-8).reverse().map(m=><div className="ledger-row" key={m.id}><span>{products.find(p=>p.id===m.productId)?.name || 'Product'} · {branches.find(b=>b.id===m.branchId)?.name || 'Branch'}</span><strong>+{m.quantity}</strong><small>KSh {Number(m.totalCost||0).toLocaleString('en-KE')}</small></div>)}
              </section>
            </div>
          )}

          {section === 'pos' && (
            <div className="pos-layout">
              <section className="panel pos-catalogue">
                <div className="panel-heading"><div><h3>Sales counter</h3><p>Search or select products to add them to the current sale.</p></div><span className="count-pill">{products.length} products</span></div>
                <label className="search-box pos-search"><Search size={16}/><input value={posSearch} onChange={e=>setPosSearch(e.target.value)} placeholder="Search product, SKU or scan barcode"/></label>
                <div className="pos-product-grid">{posProducts.slice(0,80).map(product=>{
                  const available = posStock.filter(m=>m.productId===product.id && (!posForm.branchId || m.branchId===posForm.branchId) && (!posForm.warehouseId || m.warehouseId===posForm.warehouseId)).reduce((sum,m)=>sum + (m.type==='RECEIPT' || m.type==='RETURN' ? Number(m.quantity) : m.type==='SALE' ? -Number(m.quantity) : 0),0);
                  return <button key={product.id} className="pos-product" onClick={()=>addToCart(product)}><strong>{product.name}</strong><small>{product.variant || product.sku || product.category}</small><span>{product.unit} · KSh {Number(product.sellingPrice||0).toLocaleString('en-KE')} · Stock {available}</span></button>;
                })}</div>
              </section>
              <section className="panel pos-checkout">
                <div className="panel-heading"><div><h3>Current sale</h3><p>Branch stock is deducted after successful checkout.</p></div><span className="count-pill">{posCart.length} lines</span></div>
                <div className="form-grid">
                  <label className="field"><span>Branch *</span><select value={posForm.branchId} onChange={e=>setPosForm({...posForm,branchId:e.target.value,warehouseId:''})}><option value="">Select branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                  <label className="field"><span>Warehouse *</span><select value={posForm.warehouseId} onChange={e=>setPosForm({...posForm,warehouseId:e.target.value})}><option value="">Select warehouse</option>{warehouses.filter(w=>w.branchId===posForm.branchId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                </div>
                <div className="pos-cart">{posCart.map(item=><div className="pos-cart-row" key={item.productId}><div><strong>{item.name}</strong><small>KSh {Number(item.unitPrice).toLocaleString('en-KE')} / {item.unit}</small><label className="discount-inline">Discount % <input aria-label={'Discount percentage for '+item.name} type="number" min="0" max="100" step="0.5" value={item.discountPercent || 0} onChange={e=>setPosCart(posCart.map(x=>x.productId===item.productId?{...x,discountPercent:e.target.value}:x))}/></label></div><input aria-label={'Quantity for '+item.name} type="number" min="0.001" step="any" value={item.quantity} onChange={e=>setPosCart(posCart.map(x=>x.productId===item.productId?{...x,quantity:e.target.value}:x))}/><b>KSh {(Number(item.quantity)*Number(item.unitPrice)*(1-Number(item.discountPercent||0)/100)).toLocaleString('en-KE')}</b><button className="text-button" onClick={()=>setPosCart(posCart.filter(x=>x.productId!==item.productId))}>Remove</button></div>)}{!posCart.length && <div className="empty-state"><Package size={25}/><strong>Your basket is empty</strong><p>Select products from the catalogue to begin a sale.</p></div>}</div>
                <div className="form-grid">
                  <label className="field"><span>Saved customer (optional)</span><select value="" onChange={e => { const customer = customers.find(c => c.id === e.target.value); if (customer) setPosForm({ ...posForm, customerName: customer.name, customerPhone: customer.phone }); }}><option value="">Choose customer to fill details</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>
                  <label className="field"><span>Customer name (optional)</span><input value={posForm.customerName} onChange={e => setPosForm({ ...posForm, customerName: e.target.value })} /></label>
                  <label className="field"><span>Customer phone (optional)</span><input value={posForm.customerPhone} onChange={e => setPosForm({ ...posForm, customerPhone: e.target.value })} /></label>
                </div>
                {hasDiscount && <div className="discount-approval"><div className="form-section-title">Manager discount approval required</div><div className="form-grid"><label className="field"><span>Approving manager name *</span><input value={discountApproval.managerName} onChange={e=>setDiscountApproval({...discountApproval,managerName:e.target.value})} placeholder="Manager's name"/></label><label className="field"><span>Reason for discount *</span><input value={discountApproval.reason} onChange={e=>setDiscountApproval({...discountApproval,reason:e.target.value})} placeholder="e.g. bulk purchase"/></label></div><small>Approval details are saved with the sale for audit review.</small></div>}
                <div className="pos-total"><span>Sale total after discounts</span><strong>KSh {posTotal.toLocaleString('en-KE',{maximumFractionDigits:2})}</strong></div>
                <div className="form-section-title">Payment split</div>
                <div className="form-grid"><label className="field"><span>Cash received (KSh)</span><input type="number" min="0" step="0.01" value={posForm.cashAmount} onChange={e=>setPosForm({...posForm,cashAmount:e.target.value})}/></label><label className="field"><span>M-Pesa received (KSh)</span><input type="number" min="0" step="0.01" value={posForm.mpesaAmount} onChange={e=>setPosForm({...posForm,mpesaAmount:e.target.value})}/></label><label className="field"><span>M-Pesa transaction code</span><input value={posForm.mpesaReference} onChange={e=>setPosForm({...posForm,mpesaReference:e.target.value})}/></label></div>
                <div className="pos-payment-status">Paid: KSh {posPaid.toLocaleString('en-KE')} · Balance: KSh {(posTotal-posPaid).toLocaleString('en-KE',{maximumFractionDigits:2})}</div>
                <button className="primary-button full" onClick={completeSale} disabled={!posCart.length || !shift || (hasDiscount && (!discountApproval.managerName.trim() || !discountApproval.reason.trim())) || posCart.some(item=>Number(item.discountPercent)<0 || Number(item.discountPercent)>100) || Math.abs(posPaid-posTotal)>0.01}>Complete sale & issue receipt</button>
                <div className="pos-shift"><div><strong>Cashier shift</strong><small>{shift ? 'Open since '+new Date(shift.openedAt).toLocaleString() : 'No active shift'}</small></div>{shift ? <><label className="field"><span>Closing cash counted (KSh)</span><input type="number" min="0" value={shiftClosingCash} onChange={e=>setShiftClosingCash(e.target.value)}/></label><button className="secondary-button" onClick={closeShift}>Close shift</button></> : <><label className="field"><span>Opening float (KSh)</span><input type="number" min="0" value={shiftFloat} onChange={e=>setShiftFloat(e.target.value)}/></label><button className="secondary-button" onClick={openShift} disabled={!posForm.branchId}>Open shift</button></>}</div>
              </section>
              <section className="panel pos-history"><div className="panel-heading"><div><h3>Recent sales</h3><p>Completed transactions in this business.</p></div></div>{sales.slice(-10).reverse().map(s=><div className="ledger-row" key={s.id}><span>{s.receiptNumber} · {s.customerName || 'Walk-in customer'} · {new Date(s.createdAt).toLocaleString()}</span><strong>KSh {Number(s.total).toLocaleString('en-KE')}</strong><button className="text-button" onClick={()=>printReceipt(s)}>Print receipt</button></div>)}</section>
              <section className="panel pos-history"><div className="panel-heading"><div><h3>Returns & refunds</h3><p>Find the original sale, select the returned item and record its condition.</p></div><span className="count-pill">{returns.length} returns</span></div>
                <form className="return-form" onSubmit={processReturn}>
                  <label className="field"><span>Original sale / receipt *</span><select required value={returnForm.saleId} onChange={e=>{const sale=sales.find(x=>x.id===e.target.value);setReturnForm({...returnForm,saleId:e.target.value,productId:sale?.items?.[0]?.productId || ''});}}><option value="">Select a completed sale</option>{sales.filter(s=>s.status==='COMPLETED').slice().reverse().map(s=><option key={s.id} value={s.id}>{s.receiptNumber} · {s.customerName || 'Walk-in'} · KSh {Number(s.total).toLocaleString('en-KE')}</option>)}</select></label>
                  {(() => { const selectedSale=sales.find(s=>s.id===returnForm.saleId); const eligible=(selectedSale?.items||[]).filter((item:any)=>Number(item.quantity)>(returns.filter(r=>r.saleId===selectedSale.id && r.productId===item.productId).reduce((sum:number,r:any)=>sum+Number(r.quantity),0))); return <><label className="field"><span>Item being returned *</span><select required value={returnForm.productId} onChange={e=>setReturnForm({...returnForm,productId:e.target.value})}><option value="">Select item</option>{eligible.map((item:any)=><option key={item.productId} value={item.productId}>{item.name} · Sold {item.quantity}</option>)}</select></label><div className="form-grid"><label className="field"><span>Quantity returned *</span><input type="number" min="0.001" step="any" value={returnForm.quantity} onChange={e=>setReturnForm({...returnForm,quantity:e.target.value})}/></label><label className="field"><span>Item condition *</span><select value={returnForm.condition} onChange={e=>setReturnForm({...returnForm,condition:e.target.value})}><option value="RESTOCK">Resalable — return to stock</option><option value="DAMAGED">Damaged — do not restock</option></select></label><label className="field"><span>Refund method *</span><select value={returnForm.refundMethod} onChange={e=>setReturnForm({...returnForm,refundMethod:e.target.value})}><option value="CASH">Cash refund</option><option value="MPESA">M-Pesa refund</option></select></label><label className="field"><span>Reason for return *</span><input required value={returnForm.reason} onChange={e=>setReturnForm({...returnForm,reason:e.target.value})}/></label></div></>; })()}
                  <button className="primary-button" type="submit" disabled={!returnForm.saleId || !returnForm.productId}>Record return & refund due</button>
                </form>
                <div className="ledger-heading"><strong>Recent returns</strong><span>Return value and settlement status</span></div>{returns.slice(-8).reverse().map(r=><div className="ledger-row" key={r.id}><span>{r.returnNumber} · {r.productName} · {r.condition} · {new Date(r.createdAt).toLocaleString()}</span><strong>KSh {Number(r.refundAmount).toLocaleString('en-KE')}</strong><small>{r.status === 'REFUNDED' ? 'Refund paid · ' + (r.refundMethod || '') + (r.refundReference ? ' · ' + r.refundReference : '') : 'Refund due'}</small>{r.status === 'REFUND_DUE' && <div className="form-grid"><label className="field"><span>Refund method</span><select value={refundSettlement[r.id]?.paymentMethod || r.refundMethod || 'CASH'} onChange={e=>setRefundSettlement({...refundSettlement,[r.id]:{paymentMethod:e.target.value,reference:refundSettlement[r.id]?.reference || ''}})}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option></select></label><label className="field"><span>M-Pesa refund code / reference</span><input value={refundSettlement[r.id]?.reference || ''} onChange={e=>setRefundSettlement({...refundSettlement,[r.id]:{paymentMethod:refundSettlement[r.id]?.paymentMethod || r.refundMethod || 'CASH',reference:e.target.value}})} /></label><button className="primary-button" onClick={()=>settleRefund(r.id)}>Confirm refund paid</button></div>}</div>)}
              </section>
            </div>
          )}
          {receiptSale && <div className="receipt-overlay"><section className="receipt-paper"><div className="receipt-title"><h2>{business?.tradingName || business?.name || 'HardwareDesk'}</h2><small>{branches.find(b=>b.id===receiptSale.branchId)?.name || ''}</small><h3>SALES RECEIPT</h3></div><div className="receipt-meta"><span>Receipt: {receiptSale.receiptNumber}</span><span>Date: {new Date(receiptSale.createdAt).toLocaleString()}</span><span>Customer: {receiptSale.customerName || 'Walk-in'}</span></div>{(receiptSale.items||[]).map((item:any)=><div className="receipt-line" key={item.productId}><span>{item.name} × {item.quantity}{Number(item.discountPercent||0)>0?' ('+item.discountPercent+'% off)':''}</span><b>KSh {Number(item.lineTotal).toLocaleString('en-KE')}</b></div>)}<div className="receipt-total"><strong>TOTAL</strong><strong>KSh {Number(receiptSale.total).toLocaleString('en-KE')}</strong></div>{(receiptSale.payments||[]).map((p:any)=><div className="receipt-line"><span>{p.method} {p.reference||''}</span><b>KSh {Number(p.amount).toLocaleString('en-KE')}</b></div>)}<p className="receipt-thanks">Thank you for shopping with us.</p><div className="receipt-actions"><button className="primary-button" onClick={()=>window.print()}>Print</button><button className="secondary-button" onClick={()=>setReceiptSale(null)}>Close</button></div></section></div>}

          {section === 'suppliers' && (
            <div className="two-column">
              <section className="panel form-panel">
                <div className="panel-heading"><div><h3>{editingSupplier ? 'Edit supplier' : 'Add supplier'}</h3><p>Maintain supplier contact and tax details for purchasing.</p></div></div>
                <form onSubmit={saveSupplier}>
                  <Field label="Supplier / company name *" value={supplierForm.name} required onChange={v => setSupplierForm({ ...supplierForm, name: v })} />
                  <Field label="Contact person" value={supplierForm.contactName} onChange={v => setSupplierForm({ ...supplierForm, contactName: v })} />
                  <div className="form-grid">
                    <Field label="Phone" value={supplierForm.phone} onChange={v => setSupplierForm({ ...supplierForm, phone: v })} />
                    <Field label="Email" type="email" value={supplierForm.email} onChange={v => setSupplierForm({ ...supplierForm, email: v })} />
                    <Field label="KRA PIN" value={supplierForm.kraPin} onChange={v => setSupplierForm({ ...supplierForm, kraPin: v })} />
                    <Field label="Address" value={supplierForm.address} onChange={v => setSupplierForm({ ...supplierForm, address: v })} />
                  </div>
                  <div className="form-footer"><button type="button" className="secondary-button" onClick={() => { setEditingSupplier(null); setSupplierForm({ name: '', contactName: '', phone: '', email: '', kraPin: '', address: '' }); }}>Clear</button><button className="primary-button" type="submit"><Plus size={16} /> {editingSupplier ? 'Save changes' : 'Add supplier'}</button></div>
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading"><div><h3>Supplier directory</h3><p>{suppliers.length} suppliers registered</p></div><span className="count-pill">{suppliers.length}</span></div>
                {suppliers.length === 0 ? <EmptyState icon={<Users size={22} />} title="No suppliers yet" text="Add your first supplier to start creating purchase orders." /> : <div className="record-list">{suppliers.map(s => <div className="record-row" key={s.id}><div className="record-icon"><Building2 size={18} /></div><div className="record-copy"><strong>{s.name}</strong><small>{[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact details'}</small></div><button className="text-button" onClick={() => { setEditingSupplier(s.id); setSupplierForm({ name: s.name || '', contactName: s.contactName || '', phone: s.phone || '', email: s.email || '', kraPin: s.kraPin || '', address: s.address || '' }); }}>Edit</button></div>)}</div>}
              </section>
            </div>
          )}

          {section === 'purchasing' && (
            <div className="inventory-layout">
              <section className="panel form-panel">
                <div className="panel-heading"><div><h3>Create purchase order</h3><p>Record what you are ordering. Stock changes only after goods are received.</p></div></div>
                <form onSubmit={createPurchase}>
                  <div className="form-grid">
                    <label className="field"><span>Supplier *</span><select required value={purchaseForm.supplierId} onChange={e => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}><option value="">Select supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                    <label className="field"><span>Receiving branch *</span><select required value={purchaseForm.branchId} onChange={e => setPurchaseForm({ ...purchaseForm, branchId: e.target.value, warehouseId: '' })}><option value="">Select branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
                    <label className="field"><span>Warehouse *</span><select required value={purchaseForm.warehouseId} onChange={e => setPurchaseForm({ ...purchaseForm, warehouseId: e.target.value })}><option value="">Select warehouse</option>{warehouses.filter(w => w.branchId === purchaseForm.branchId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                    <Field label="Supplier invoice / reference" value={purchaseForm.invoiceNumber} onChange={v => setPurchaseForm({ ...purchaseForm, invoiceNumber: v })} />
                    <Field label="Expected delivery date" type="date" value={purchaseForm.expectedDate} onChange={v => setPurchaseForm({ ...purchaseForm, expectedDate: v })} />
                    <Field label="Order notes" value={purchaseForm.notes} onChange={v => setPurchaseForm({ ...purchaseForm, notes: v })} />
                  </div>
                  <div className="form-section-title separated">Purchase items</div>
                  {purchaseLines.map((line, index) => <div className="purchase-line" key={index}>
                    <label className="field"><span>Product *</span><select required value={line.productId} onChange={e => setPurchaseLines(purchaseLines.map((x, i) => i === index ? { ...x, productId: e.target.value } : x))}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}{p.variant ? ' · ' + p.variant : ''}</option>)}</select></label>
                    <label className="field"><span>Quantity *</span><input type="number" min="0.001" step="any" required value={line.quantity} onChange={e => setPurchaseLines(purchaseLines.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x))} /></label>
                    <label className="field"><span>Unit cost (KSh) *</span><input type="number" min="0" step="0.01" required value={line.unitCost} onChange={e => setPurchaseLines(purchaseLines.map((x, i) => i === index ? { ...x, unitCost: e.target.value } : x))} /></label>
                    <button type="button" className="text-button" onClick={() => setPurchaseLines(purchaseLines.filter((_, i) => i !== index))} disabled={purchaseLines.length === 1}>Remove line</button>
                  </div>)}                  <div className="form-footer"><button type="button" className="secondary-button" onClick={() => setPurchaseLines([...purchaseLines, { productId: '', quantity: '1', unitCost: '0' }])}><Plus size={15} /> Add item</button><strong>Order total: KSh {purchaseLines.reduce((sum, x) => sum + Number(x.quantity || 0) * Number(x.unitCost || 0), 0).toLocaleString('en-KE', { maximumFractionDigits: 2 })}</strong><button className="primary-button" type="submit" disabled={!suppliers.length || !branches.length || !warehouses.length}><CheckCircle2 size={16} /> Create purchase order</button></div>
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading"><div><h3>Purchase orders & supplier balances</h3><p>Receive goods and record payments against supplier invoices.</p></div><span className="count-pill">{purchases.length} orders</span></div>
                {purchases.length === 0 ? <EmptyState icon={<Boxes size={22} />} title="No purchase orders" text="Create a purchase order after adding a supplier." /> : purchases.slice().reverse().map(p => {
                  const outstanding = Math.max(0, Number(p.total || 0) - Number(p.paidAmount || 0));
                  const remaining = (p.items || []).reduce((sum: number, x: any) => sum + Math.max(0, Number(x.quantity) - Number(x.receivedQuantity || 0)), 0);
                  return <article className="purchase-card" key={p.id}>
                    <div className="panel-heading"><div><h3>{p.orderNumber} · {p.supplierName}</h3><p>{branches.find(b => b.id === p.branchId)?.name || 'Branch'} · {p.invoiceNumber || 'No supplier invoice reference'} · {new Date(p.createdAt).toLocaleDateString()}</p></div><span className="count-pill">{p.status}</span></div>
                    {(p.items || []).map((x: any) => { const remainingLine = Math.max(0, Number(x.quantity) - Number(x.receivedQuantity || 0)); return <div className="ledger-row" key={x.productId}><span>{x.productName} · Ordered {x.quantity} · Received {x.receivedQuantity || 0} · Outstanding {remainingLine}</span><strong>KSh {Number(x.lineTotal).toLocaleString('en-KE')}</strong>{remainingLine > 0 && <><input aria-label={'Quantity to receive for ' + x.productName} type="number" min="0.001" max={remainingLine} step="any" placeholder={'Up to ' + remainingLine} value={receiveQuantities[p.id + ':' + x.productId] || ''} onChange={e => setReceiveQuantities({ ...receiveQuantities, [p.id + ':' + x.productId]: e.target.value })} /><button className="secondary-button" onClick={() => receivePurchase(p.id, x.productId, remainingLine)}>Receive quantity</button></>}</div>; })}
                    <div className="ledger-row"><span>Order total · Paid KSh {Number(p.paidAmount || 0).toLocaleString('en-KE')} · Outstanding</span><strong>KSh {outstanding.toLocaleString('en-KE')}</strong></div>
                    {remaining > 0 && <small className="helper">Enter the quantity received beside each product. You can receive the balance in later deliveries.</small>}
                    {outstanding > 0 && <div className="form-grid purchase-payment">
                      <label className="field"><span>Payment amount (KSh)</span><input type="number" min="0.01" max={outstanding} step="0.01" value={purchasePayment[p.id]?.amount || ''} onChange={e => setPurchasePayment({ ...purchasePayment, [p.id]: { amount: e.target.value, reference: purchasePayment[p.id]?.reference || '' } })} /></label>
                      <label className="field"><span>Payment method</span><select value={purchasePayment[p.id]?.paymentMethod || 'BANK'} onChange={e => setPurchasePayment({ ...purchasePayment, [p.id]: { amount: purchasePayment[p.id]?.amount || '', reference: purchasePayment[p.id]?.reference || '', paymentMethod: e.target.value } })}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label>
                      <label className="field"><span>Payment reference {purchasePayment[p.id]?.paymentMethod === 'MPESA' ? '*' : '(optional)'}</span><input value={purchasePayment[p.id]?.reference || ''} onChange={e => setPurchasePayment({ ...purchasePayment, [p.id]: { amount: purchasePayment[p.id]?.amount || '', reference: e.target.value, paymentMethod: purchasePayment[p.id]?.paymentMethod || 'BANK' } })} /></label>
                      <button className="primary-button" onClick={() => paySupplier(p.id)}>Record supplier payment</button>
                    </div>}
                    <small className="helper">Goods received: {remaining === 0 ? 'Complete' : 'Pending'} · Payment: {p.paymentStatus || 'UNPAID'}</small>
                  </article>;
                })}
              </section>
            </div>
          )}

          {section === 'customers' && (
            <div className="two-column">
              <section className="panel form-panel">
                <div className="panel-heading"><div><h3>{editingCustomer ? 'Edit customer' : 'Add customer'}</h3><p>Save customer details for faster checkout and purchase history.</p></div></div>
                <form onSubmit={saveCustomer}>
                  <Field label="Customer name *" value={customerForm.name} required onChange={v => setCustomerForm({ ...customerForm, name: v })} />
                  <div className="form-grid">
                    <Field label="Phone number *" value={customerForm.phone} required onChange={v => setCustomerForm({ ...customerForm, phone: v })} />
                    <Field label="Email" type="email" value={customerForm.email} onChange={v => setCustomerForm({ ...customerForm, email: v })} />
                    <Field label="KRA PIN" value={customerForm.kraPin} onChange={v => setCustomerForm({ ...customerForm, kraPin: v })} />
                    <Field label="Address / location" value={customerForm.address} onChange={v => setCustomerForm({ ...customerForm, address: v })} />
                  </div>
                  <Field label="Notes" value={customerForm.notes} onChange={v => setCustomerForm({ ...customerForm, notes: v })} />
                  <div className="form-footer"><button type="button" className="secondary-button" onClick={() => { setEditingCustomer(null); setCustomerForm({ name: '', phone: '', email: '', address: '', kraPin: '', notes: '' }); }}>Clear</button><button className="primary-button" type="submit"><Plus size={16} /> {editingCustomer ? 'Save changes' : 'Add customer'}</button></div>
                </form>
              </section>
              <section className="panel list-panel">
                <div className="panel-heading"><div><h3>Customer directory</h3><p>Customer profiles and sales history · {customers.length} records</p></div><span className="count-pill">{customers.length}</span></div>
                <label className="search-box"><Search size={16} /><input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customer name or phone" /></label>
                {customers.filter(c => (c.name + ' ' + c.phone).toLowerCase().includes(customerSearch.toLowerCase())).map(c => {
                  const history = sales.filter(s => s.customerPhone && s.customerPhone === c.phone);
                  const spend = history.reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);
                  return <article className="purchase-card" key={c.id}>
                    <div className="record-row"><div className="record-icon"><Users size={18} /></div><div className="record-copy"><strong>{c.name}</strong><small>{c.phone} · {c.email || 'No email'} · {c.address || 'No address'}</small></div><button className="text-button" onClick={() => { setEditingCustomer(c.id); setCustomerForm({ name: c.name || '', phone: c.phone || '', email: c.email || '', address: c.address || '', kraPin: c.kraPin || '', notes: c.notes || '' }); }}>Edit</button></div>
                    <div className="ledger-row"><span>{history.length} linked sales · Total spend</span><strong>KSh {spend.toLocaleString('en-KE')}</strong></div>
                    {history.slice(-5).reverse().map(s => <div className="ledger-row" key={s.id}><span>{s.receiptNumber} · {new Date(s.createdAt).toLocaleDateString()}</span><strong>KSh {Number(s.total).toLocaleString('en-KE')}</strong></div>)}
                  </article>;
                })}
              </section>
            </div>
          )}

          {section === 'accounting' && (
            <div className="accounting-page">
              <div className="welcome-row">
                <div><h2>Financial position</h2><p>Double-entry accounting · KES · Figures reflect transactions posted since Phase 5 activation.</p></div>
                <span className="phase-tag"><Calculator size={14} /> PHASE 5 · ACCOUNTING</span>
              </div>
              <div className="stat-grid">
                <div className="stat-card"><div className="stat-top"><span>Income</span><Activity size={18} /></div><strong className="stat-value">KSh {Number(accounting.profitAndLoss?.income || 0).toLocaleString('en-KE')}</strong><span className="stat-foot">Posted income accounts</span></div>
                <div className="stat-card"><div className="stat-top"><span>Expenses</span><ArrowDownUp size={18} /></div><strong className="stat-value">KSh {Number(accounting.profitAndLoss?.expenses || 0).toLocaleString('en-KE')}</strong><span className="stat-foot">Includes cost of goods sold</span></div>
                <div className="stat-card"><div className="stat-top"><span>Net profit</span><CheckCircle2 size={18} /></div><strong className="stat-value">KSh {Number(accounting.profitAndLoss?.netProfit || 0).toLocaleString('en-KE')}</strong><span className="stat-foot">Income less expenses</span></div>
                <div className="stat-card"><div className="stat-top"><span>Cash & bank</span><Database size={18} /></div><strong className="stat-value">KSh {Number(accounting.cashbook?.cashBalance || 0).toLocaleString('en-KE')}</strong><span className="stat-foot">Cash, M-Pesa and bank ledger balances</span></div>
              </div>
              <section className="panel opening-balance-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Opening balances</h3>
                    <p>Enter the balances from your books on the date you start using this system. Amounts are in KSh.</p>
                  </div>
                  {accounting.openingBalance && <span className="count-pill">POSTED · LOCKED</span>}
                </div>
                {accounting.openingBalance ? (
                  <div className="opening-posted">
                    <div className="ledger-row"><span>Effective date</span><strong>{new Date(accounting.openingBalance.date).toLocaleDateString('en-KE')}</strong></div>
                    <div className="ledger-row"><span>Journal reference</span><strong>{accounting.openingBalance.reference}</strong></div>
                    <div className="ledger-row"><span>Opening journal total</span><strong>KSh {Number(accounting.openingBalance.totalDebit || 0).toLocaleString('en-KE')}</strong></div>
                    <p className="form-hint">This opening journal is already posted. It cannot be submitted again. Corrections should be made through a separately authorised adjustment journal.</p>
                  </div>
                ) : (
                  <form onSubmit={saveOpeningBalances}>
                    <div className="opening-intro">
                      <strong>Enter existing balances as at one date.</strong>
                      <span>Enter only accounts with a balance. Leave other accounts blank or at zero. Owner's capital is calculated automatically.</span>
                    </div>
                    <div className="form-grid opening-date-row">
                      <Field label="Opening balance date *" type="date" value={openingDate} required onChange={setOpeningDate} />
                    </div>
                    <div className="opening-account-list">
                      {accounting.accounts.filter((account: any) => account.type === 'ASSET' || account.type === 'LIABILITY').map((account: any) => (
                        <label className="opening-account-row" key={account.code}>
                          <span><b>{account.code} · {account.name}</b><small>{account.type === 'ASSET' ? 'Asset · Debit balance' : 'Liability · Credit balance'}</small></span>
                          <span className="opening-amount"><small>KSh</small><input type="number" min="0" step="0.01" placeholder="0.00" value={openingAmounts[account.code] || ''} onChange={e => setOpeningAmounts({ ...openingAmounts, [account.code]: e.target.value })} /></span>
                        </label>
                      ))}
                    </div>
                    <div className="opening-equity-preview">
                      <span>Calculated owner's capital / opening equity</span>
                      <strong>KSh {(accounting.accounts.filter((a: any) => a.type === 'ASSET').reduce((sum: number, a: any) => sum + Math.max(0, Number(openingAmounts[a.code] || 0)), 0) - accounting.accounts.filter((a: any) => a.type === 'LIABILITY').reduce((sum: number, a: any) => sum + Math.max(0, Number(openingAmounts[a.code] || 0)), 0)).toLocaleString('en-KE', { maximumFractionDigits: 2 })}</strong>
                    </div>
                    <p className="form-hint">Inventory value here sets the accounting opening value only. Enter opening stock quantities separately through stock setup/receipts; do not enter the same value twice.</p>
                    <div className="form-footer"><span>Posting creates one balanced, dated journal entry.</span><button className="primary-button" type="submit" disabled={!Object.values(openingAmounts).some(value => Number(value) > 0)}>Post opening balances</button></div>
                  </form>
                )}
              </section>
              <div className="two-column accounting-columns">
                <section className="panel form-panel">
                  <div className="panel-heading"><div><h3>Record an expense</h3><p>Posts the expense debit and cash/bank credit automatically.</p></div></div>
                  <form onSubmit={saveExpense}>
                    <Field label="Expense description *" value={expenseForm.description} required onChange={v => setExpenseForm({ ...expenseForm, description: v })} />
                    <div className="form-grid">
                      <Field label="Amount (KSh) *" type="number" value={expenseForm.amount} required onChange={v => setExpenseForm({ ...expenseForm, amount: v })} />
                      <label className="field"><span>Expense category</span><select value={expenseForm.accountCode} onChange={e => setExpenseForm({ ...expenseForm, accountCode: e.target.value })}>{accounting.accounts.filter((a: any) => a.type === 'EXPENSE' && a.code !== '4010' && a.code !== '5000').map((a: any) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></label>
                      <label className="field"><span>Paid from</span><select value={expenseForm.paymentMethod} onChange={e => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label>
                      <Field label="Date" type="date" value={expenseForm.date} onChange={v => setExpenseForm({ ...expenseForm, date: v })} />
                    </div>
                    <div className="form-grid"><Field label="Receipt / reference" value={expenseForm.reference} onChange={v => setExpenseForm({ ...expenseForm, reference: v })} /><Field label="Notes" value={expenseForm.notes} onChange={v => setExpenseForm({ ...expenseForm, notes: v })} /></div>
                    <div className="form-footer"><span>Every saved expense creates a balanced journal entry.</span><button className="primary-button" type="submit"><Plus size={16} /> Save expense</button></div>
                  </form>
                </section>
                <section className="panel form-panel">
                  <div className="panel-heading"><div><h3>Cashbook entry</h3><p>Record other receipts or payments not already entered through POS or expenses.</p></div></div>
                  <form onSubmit={saveCashbookEntry}>
                    <div className="form-grid">
                      <label className="field"><span>Direction</span><select value={cashbookForm.direction} onChange={e => setCashbookForm({ ...cashbookForm, direction: e.target.value, accountCode: e.target.value === 'RECEIPT' ? '4200' : '5190' })}><option value="RECEIPT">Money received</option><option value="PAYMENT">Money paid</option></select></label>
                      <Field label="Description *" value={cashbookForm.description} required onChange={v => setCashbookForm({ ...cashbookForm, description: v })} />
                      <Field label="Amount (KSh) *" type="number" value={cashbookForm.amount} required onChange={v => setCashbookForm({ ...cashbookForm, amount: v })} />
                      <label className="field"><span>Cash / bank account</span><select value={cashbookForm.paymentMethod} onChange={e => setCashbookForm({ ...cashbookForm, paymentMethod: e.target.value })}><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="BANK">Bank</option></select></label>
                      <label className="field"><span>Offset account</span><select value={cashbookForm.accountCode} onChange={e => setCashbookForm({ ...cashbookForm, accountCode: e.target.value })}>{accounting.accounts.filter((a: any) => a.code !== '1000' && a.code !== '1010' && a.code !== '1020' && a.active !== false).map((a: any) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></label>
                      <Field label="Date" type="date" value={cashbookForm.date} onChange={v => setCashbookForm({ ...cashbookForm, date: v })} />
                    </div>
                    <Field label="Reference" value={cashbookForm.reference} onChange={v => setCashbookForm({ ...cashbookForm, reference: v })} />
                    <div className="form-footer"><span>Do not re-enter POS sales or supplier payments here.</span><button className="primary-button" type="submit"><Plus size={16} /> Save cashbook entry</button></div>
                  </form>
                </section>
              </div>
              <div className="two-column accounting-columns">
                <section className="panel">
                  <div className="panel-heading"><div><h3>Profit & loss</h3><p>Posted income and expense account balances · inception to date</p></div></div>
                  {accounting.trialBalance.filter((a: any) => a.type === 'INCOME' || a.type === 'EXPENSE').map((a: any) => <div className="ledger-row" key={a.code}><span>{a.code} · {a.name}</span><strong>KSh {Number(a.type === 'INCOME' ? a.creditBalance - a.debitBalance : a.debitBalance - a.creditBalance).toLocaleString('en-KE')}</strong></div>)}
                  <div className="ledger-heading"><b>Net profit</b><strong>KSh {Number(accounting.profitAndLoss?.netProfit || 0).toLocaleString('en-KE')}</strong></div>
                </section>
                <section className="panel">
                  <div className="panel-heading"><div><h3>Balance sheet</h3><p>Current balances · includes current-period retained profit</p></div></div>
                  <div className="ledger-row"><span>Total assets</span><strong>KSh {Number(accounting.balanceSheet?.assets || 0).toLocaleString('en-KE')}</strong></div>
                  <div className="ledger-row"><span>Total liabilities</span><strong>KSh {Number(accounting.balanceSheet?.liabilities || 0).toLocaleString('en-KE')}</strong></div>
                  <div className="ledger-row"><span>Equity including current profit</span><strong>KSh {Number(accounting.balanceSheet?.equity || 0).toLocaleString('en-KE')}</strong></div>
                  <div className="ledger-heading"><b>Assets should equal liabilities + equity</b><strong>KSh {Number((accounting.balanceSheet?.liabilities || 0) + (accounting.balanceSheet?.equity || 0)).toLocaleString('en-KE')}</strong></div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading"><div><h3>Trial balance & chart of accounts</h3><p>{accounting.accounts.length} configured accounts · {accounting.postedJournalCount || 0} posted journal entries</p></div></div>
                <div className="accounting-table"><div className="accounting-table-head"><span>Code / account</span><span>Type</span><span>Debit</span><span>Credit</span></div>
                  {accounting.trialBalance.map((a: any) => <div className="accounting-table-row" key={a.code}><span><b>{a.code}</b> · {a.name}</span><span>{a.type}</span><span>KSh {Number(a.debitBalance).toLocaleString('en-KE')}</span><span>KSh {Number(a.creditBalance).toLocaleString('en-KE')}</span></div>)}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><h3>Recent general ledger journals</h3><p>Source-linked and protected against duplicate posting</p></div></div>
                {accounting.journals.slice(0, 20).map((journal: any) => <article className="purchase-card" key={journal.id}><div className="record-row"><div className="record-copy"><strong>{journal.description}</strong><small>{journal.reference} · {journal.sourceType} · {new Date(journal.date).toLocaleString()}</small></div><b>KSh {Number(journal.totalDebit).toLocaleString('en-KE')}</b></div>{journal.lines.map((line: any, index: number) => <div className="ledger-row" key={index}><span>{line.accountCode} · {line.accountName}</span><span>Dr {Number(line.debit).toLocaleString('en-KE')} / Cr {Number(line.credit).toLocaleString('en-KE')}</span></div>)}</article>)}
                {!accounting.journals.length && <EmptyState icon={<Calculator size={20} />} title="No posted journals yet" text="New sales, receipts, returns, supplier payments and expenses will appear here." />}
              </section>
            </div>
          )}

          {section === 'sync' && (
            <div className="sync-grid">
              <section className="panel sync-main">
                <div className="sync-hero">
                  <div
                    className={online ? 'sync-symbol' : 'sync-symbol offline'}
                  >
                    {online ? <Cloud size={27} /> : <WifiOff size={27} />}
                  </div>
                  <div>
                    <h2>                      {online
                        ? 'Cloud connection available'
                        : 'You are offline'}
                    </h2>
                    <p>
                      {online
                        ? 'The hosted workspace can communicate with the AppDeploy backend.'
                        : 'Cloud operations are unavailable until connectivity returns.'}
                    </p>
                  </div>
                </div>
                <div className="sync-detail">
                  <span>Connection</span>
                  <b className={online ? 'text-green' : 'text-amber'}>
                    {online ? 'Online' : 'Offline'}
                  </b>
                </div>
                <div className="sync-detail">
                  <span>Last successful workspace refresh</span>
                  <b>
                    {lastSync
                      ? new Date(lastSync).toLocaleString()
                      : 'Not yet recorded'}
                  </b>
                </div>
                <div className="sync-detail">
                  <span>Signed-in identity</span>
                  <b>{user.email || user.userId}</b>
                </div>
                <button
                  className="primary-button"
                  onClick={loadWorkspace}
                  disabled={!online || loading}
                >
                  <RefreshCw size={16} /> Refresh cloud workspace
                </button>
              </section>
              <section className="panel desktop-pairing-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Connect a Windows computer</h3>
                    <p>Generate a one-time code here, then enter it in the Hardware Retail Windows application. Keep both devices online until the first sync finishes.</p>
                  </div>
                  <Smartphone size={22} />
                </div>
                {desktopPairing ? (
                  <div className="pairing-code-result">
                    <span className="pairing-code-label">ONE-TIME PAIRING CODE</span>
                    <strong>{desktopPairing.code}</strong>
                    <p>{desktopPairing.ownerDevice ? 'This will register the first computer as the primary owner computer.' : 'This computer will be registered as an additional branch computer.'}</p>
                    <small>Expires: {new Date(desktopPairing.expiresAt).toLocaleString()}</small>
                    <button className="secondary-button" onClick={() => navigator.clipboard.writeText(desktopPairing.code)}>Copy code</button>
                  </div>
                ) : (
                  <p className="muted">No active code has been generated in this session.</p>
                )}
                <button className="primary-button" onClick={generateDesktopPairing} disabled={!online || pairingLoading}>
                  <Plus size={16} /> {pairingLoading ? 'Generating…' : desktopPairing ? 'Generate a new code' : 'Generate pairing code'}
                </button>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h3>Technical validation</h3>
                    <p>
                      Capabilities that still require native implementation and
                      testing.
                    </p>
                  </div>
                </div>
                {[
                  {
                    label: 'Hosted cloud backend',
                    state: 'Available',
                    ok: true,
                  },
                  {
                    label: 'Authenticated workspace access',
                    state: 'Available',
                    ok: true,
                  },
                  {
                    label: 'Windows installer',
                    state: 'Not validated',
                    ok: false,
                  },
                  {
                    label: 'Native SQLite database',
                    state: 'Not validated',
                    ok: false,
                  },
                  {
                    label: 'Offline transaction queue',
                    state: 'Not implemented',
                    ok: false,
                  },
                  { label: 'Android APK', state: 'Not validated', ok: false },
                  {
                    label: 'Physical ETR / receipt printer',
                    state: 'Not validated',
                    ok: false,
                  },
                ].map(x => (
                  <div className="validation-row" key={x.label}>
                    <span>{x.label}</span>
                    <b className={x.ok ? 'text-green' : 'text-amber'}>
                      {x.state}
                    </b>
                  </div>
                ))}
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>HardwareDesk · Foundation build</span>
            <span>Kenya defaults · KES · Africa/Nairobi</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function PrinterIcon() {
  return <Package size={17} />;
}
function Field({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  );
}
function EmptyState({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export default App;
