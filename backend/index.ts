import { router, json, error, requireAuth, requireAdminEmailAllowlist, db } from '@appdeploy/sdk';

function userKey(userId: string) {
  return userId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
function table(userId: string, name: string) {
  return name + '_' + userKey(userId);
}
function textField(value: unknown, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
async function listOwned(userId: string, name: string) {
  const result = await db.list(table(userId, name), { limit: 100 });
  return result.items;
}


const desktopPairingTable = 'desktop_pairings_global';
const desktopTokenTable = 'desktop_device_tokens_global';

const softwareOwnerEmail = 'collkip@gmail.com';
const desktopLicenceTable = 'desktop_licences_global';
function isSoftwareOwner(ctx: any) {
  return String(ctx.user?.email || '').trim().toLowerCase() === softwareOwnerEmail;
}
function licenceIsUsable(licence: any) {
  return Boolean(licence && licence.status === 'active' &&
    (!licence.startsAt || Date.parse(licence.startsAt) <= Date.now()) &&
    (!licence.expiresAt || Date.parse(licence.expiresAt) > Date.now()));
}
async function getLicenceForBusiness(userId: string) {
  const licences = await db.list(desktopLicenceTable, { limit: 500 });
  return licences.items.find((item: any) => item.businessUserId === userId) || null;
}


function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function hexBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
async function discountPinHash(pin: string, saltHex: string, iterations = 310000) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexBytes(saltHex), iterations, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), value => value.toString(16).padStart(2, '0')).join('');
}
function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
async function getSyncedStaff(userId: string) {
  const saved = await db.list(table(userId, 'desktop_sync_state'), { limit: 1 });
  const snapshot = saved.items[0]?.snapshot;
  return Array.isArray(snapshot?.staff) ? snapshot.staff : [];
}
function bearerToken(ctx: any) {
  const headers = ctx.event?.headers || {};
  const value = headers.authorization || headers.Authorization || '';
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
type DesktopDeviceToken = {
  userId: string;
  deviceId: string;
  ownerDevice: boolean;
  status: string;
  createdAt: string;
  tokenHash: string;
};

async function authenticatedDesktop(ctx: any) {
  const token = bearerToken(ctx);
  if (!token || token.length < 40) return null;
  const tokenHash = await sha256(token);
  const tokens = await db.list<DesktopDeviceToken>(desktopTokenTable, { limit: 500 });
  const record = tokens.items.find(item => item.tokenHash === tokenHash);
  if (!record || record.status !== 'active') return null;
  return { ...record, tokenHash };
}

async function verifiedDesktopActor(ctx: any, device: DesktopDeviceToken) {
  const headers = ctx.event?.headers || {};
  const staffId = textField(headers['x-hrms-staff-id'] || headers['X-Hrms-Staff-Id'], 100);
  const passwordHash = textField(headers['x-hrms-password-hash'] || headers['X-Hrms-Password-Hash'], 300);
  if (!staffId || !passwordHash.startsWith('$argon2')) return null;
  const saved = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
  const staffRows = Array.isArray(saved.items[0]?.snapshot?.staff) ? saved.items[0].snapshot.staff : [];
  return staffRows.find((item: any) =>
    item.profile?.id === staffId && item.profile?.status === 'active' &&
    item.account?.status === 'active' && item.account?.mustChangePassword !== true &&
    item.account?.passwordHash === passwordHash
  ) || null;
}

const starterCatalogue: Array<{ category: string; name: string; unit: string }> = [{"category":"Cement & masonry","name":"Bamburi Cement","unit":"Bag"},{"category":"Cement & masonry","name":"Savannah Cement","unit":"Bag"},{"category":"Cement & masonry","name":"Mombasa Cement","unit":"Bag"},{"category":"Cement & masonry","name":"Simba Cement","unit":"Bag"},{"category":"Cement & masonry","name":"East African Portland Cement","unit":"Bag"},{"category":"Cement & masonry","name":"White Cement","unit":"Bag"},{"category":"Cement & masonry","name":"Tile Adhesive","unit":"Bag"},{"category":"Cement & masonry","name":"Tile Grout","unit":"Bag"},{"category":"Cement & masonry","name":"Wall Putty","unit":"Bag"},{"category":"Cement & masonry","name":"Waterproofing Compound","unit":"Bucket"},{"category":"Cement & masonry","name":"Building Sand","unit":"Ton"},{"category":"Cement & masonry","name":"Plaster Sand","unit":"Ton"},{"category":"Cement & masonry","name":"River Sand","unit":"Ton"},{"category":"Cement & masonry","name":"Ballast","unit":"Ton"},{"category":"Cement & masonry","name":"Quarry Dust","unit":"Ton"},{"category":"Cement & masonry","name":"Hardcore","unit":"Ton"},{"category":"Cement & masonry","name":"Murram","unit":"Ton"},{"category":"Cement & masonry","name":"Building Blocks","unit":"Piece"},{"category":"Cement & masonry","name":"Cabro Blocks","unit":"Piece"},{"category":"Cement & masonry","name":"Clay Bricks","unit":"Piece"},{"category":"Steel & metal","name":"Y8 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y10 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y12 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y16 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y20 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y25 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Y32 Reinforcement Bar","unit":"Piece"},{"category":"Steel & metal","name":"Binding Wire","unit":"Kg"},{"category":"Steel & metal","name":"Hoop Iron","unit":"Roll"},{"category":"Steel & metal","name":"Welded Mesh","unit":"Sheet"},{"category":"Steel & metal","name":"Chain Link","unit":"Metre"},{"category":"Steel & metal","name":"Flat Bar","unit":"Piece"},{"category":"Steel & metal","name":"Angle Bar","unit":"Piece"},{"category":"Steel & metal","name":"Square Bar","unit":"Piece"},{"category":"Steel & metal","name":"Round Bar","unit":"Piece"},{"category":"Steel & metal","name":"Steel Plate","unit":"Sheet"},{"category":"Steel & metal","name":"Square Hollow Section","unit":"Piece"},{"category":"Steel & metal","name":"Rectangular Hollow Section","unit":"Piece"},{"category":"Steel & metal","name":"C Channel","unit":"Piece"},{"category":"Steel & metal","name":"I Beam","unit":"Piece"},{"category":"Roofing","name":"Corrugated Mabati","unit":"Sheet"},{"category":"Roofing","name":"Box Profile Mabati","unit":"Sheet"},{"category":"Roofing","name":"Versatile Roofing Sheet","unit":"Sheet"},{"category":"Roofing","name":"Roofing Tile","unit":"Piece"},{"category":"Roofing","name":"Ridge Cap","unit":"Piece"},{"category":"Roofing","name":"Valley Gutter","unit":"Piece"},{"category":"Roofing","name":"Rain Gutter","unit":"Piece"},{"category":"Roofing","name":"Downpipe","unit":"Piece"},{"category":"Roofing","name":"Roofing Nails","unit":"Kg"},{"category":"Roofing","name":"Roofing Screws","unit":"Piece"},{"category":"Roofing","name":"Transparent Roofing Sheet","unit":"Sheet"},{"category":"Plumbing","name":"PVC Pipe","unit":"Piece"},{"category":"Plumbing","name":"PPR Pipe","unit":"Piece"},{"category":"Plumbing","name":"HDPE Pipe","unit":"Metre"},{"category":"Plumbing","name":"uPVC Drainage Pipe","unit":"Piece"},{"category":"Plumbing","name":"PVC Elbow","unit":"Piece"},{"category":"Plumbing","name":"PVC Tee","unit":"Piece"},{"category":"Plumbing","name":"PVC Reducer","unit":"Piece"},{"category":"Plumbing","name":"PVC Socket","unit":"Piece"},{"category":"Plumbing","name":"PVC Union","unit":"Piece"},{"category":"Plumbing","name":"PVC Pipe Glue","unit":"Bottle"},{"category":"Plumbing","name":"Ball Valve","unit":"Piece"},{"category":"Plumbing","name":"Gate Valve","unit":"Piece"},{"category":"Plumbing","name":"Check Valve","unit":"Piece"},{"category":"Plumbing","name":"Bib Tap","unit":"Piece"},{"category":"Plumbing","name":"Pillar Tap","unit":"Piece"},{"category":"Plumbing","name":"Shower Mixer","unit":"Piece"},{"category":"Plumbing","name":"Float Valve","unit":"Piece"},{"category":"Plumbing","name":"Water Tank Connector","unit":"Piece"},{"category":"Plumbing","name":"Water Tank","unit":"Piece"},{"category":"Plumbing","name":"Toilet Suite","unit":"Set"},{"category":"Plumbing","name":"Wash Basin","unit":"Piece"},{"category":"Plumbing","name":"Kitchen Sink","unit":"Piece"},{"category":"Plumbing","name":"Shower Head","unit":"Piece"},{"category":"Plumbing","name":"Floor Drain","unit":"Piece"},{"category":"Plumbing","name":"Submersible Water Pump","unit":"Piece"},{"category":"Plumbing","name":"Booster Pump","unit":"Piece"},{"category":"Electrical","name":"1.5mm Single Core Cable","unit":"Metre"},{"category":"Electrical","name":"2.5mm Single Core Cable","unit":"Metre"},{"category":"Electrical","name":"4mm Single Core Cable","unit":"Metre"},{"category":"Electrical","name":"6mm Single Core Cable","unit":"Metre"},{"category":"Electrical","name":"Twin & Earth Cable","unit":"Metre"},{"category":"Electrical","name":"Flexible Cable","unit":"Metre"},{"category":"Electrical","name":"Electrical Conduit","unit":"Piece"},{"category":"Electrical","name":"Cable Clips","unit":"Pack"},{"category":"Electrical","name":"Junction Box","unit":"Piece"},{"category":"Electrical","name":"PVC Trunking","unit":"Piece"},{"category":"Electrical","name":"One Gang Switch","unit":"Piece"},{"category":"Electrical","name":"Two Gang Switch","unit":"Piece"},{"category":"Electrical","name":"13A Socket","unit":"Piece"},{"category":"Electrical","name":"Plug Top","unit":"Piece"},{"category":"Electrical","name":"LED Bulb 9W","unit":"Piece"},{"category":"Electrical","name":"LED Bulb 12W","unit":"Piece"},{"category":"Electrical","name":"LED Tube Light","unit":"Piece"},{"category":"Electrical","name":"LED Floodlight","unit":"Piece"},{"category":"Electrical","name":"Downlight","unit":"Piece"},{"category":"Electrical","name":"MCB","unit":"Piece"},{"category":"Electrical","name":"RCCB","unit":"Piece"},{"category":"Electrical","name":"Distribution Board","unit":"Piece"},{"category":"Electrical","name":"Insulation Tape","unit":"Roll"},{"category":"Electrical","name":"Cable Tie","unit":"Pack"},{"category":"Electrical","name":"Extension Socket","unit":"Piece"},{"category":"Electrical","name":"Solar Panel","unit":"Piece"},{"category":"Electrical","name":"Solar Charge Controller","unit":"Piece"},{"category":"Electrical","name":"Inverter","unit":"Piece"},{"category":"Electrical","name":"Deep Cycle Battery","unit":"Piece"},{"category":"Timber & boards","name":"Cypress Timber","unit":"Piece"},{"category":"Timber & boards","name":"Pine Timber","unit":"Piece"},{"category":"Timber & boards","name":"Hardwood Timber","unit":"Piece"},{"category":"Timber & boards","name":"Plywood Board","unit":"Sheet"},{"category":"Timber & boards","name":"Marine Plywood","unit":"Sheet"},{"category":"Timber & boards","name":"MDF Board","unit":"Sheet"},{"category":"Timber & boards","name":"Chipboard","unit":"Sheet"},{"category":"Timber & boards","name":"Wooden Batten","unit":"Piece"},{"category":"Timber & boards","name":"Door Frame","unit":"Set"},{"category":"Timber & boards","name":"Gypsum Board","unit":"Sheet"},{"category":"Timber & boards","name":"Gypsum Powder","unit":"Bag"},{"category":"Timber & boards","name":"Metal Stud","unit":"Piece"},{"category":"Timber & boards","name":"Ceiling Channel","unit":"Piece"},{"category":"Timber & boards","name":"PVC Ceiling Panel","unit":"Piece"},{"category":"Timber & boards","name":"Cornice","unit":"Piece"},{"category":"Paint & finishes","name":"Emulsion Paint","unit":"Tin"},{"category":"Paint & finishes","name":"Gloss Paint","unit":"Tin"},{"category":"Paint & finishes","name":"Undercoat","unit":"Tin"},{"category":"Paint & finishes","name":"Primer","unit":"Tin"},{"category":"Paint & finishes","name":"Roof Paint","unit":"Tin"},{"category":"Paint & finishes","name":"Wood Varnish","unit":"Tin"},{"category":"Paint & finishes","name":"Wood Stain","unit":"Tin"},{"category":"Paint & finishes","name":"Metallic Paint","unit":"Tin"},{"category":"Paint & finishes","name":"Waterproof Paint","unit":"Tin"},{"category":"Paint & finishes","name":"Paint Brush","unit":"Piece"},{"category":"Paint & finishes","name":"Paint Roller","unit":"Piece"},{"category":"Paint & finishes","name":"Roller Tray","unit":"Piece"},{"category":"Paint & finishes","name":"Masking Tape","unit":"Roll"},{"category":"Paint & finishes","name":"Sandpaper","unit":"Sheet"},{"category":"Paint & finishes","name":"Paint Thinner","unit":"Litre"},{"category":"Paint & finishes","name":"Turpentine","unit":"Litre"},{"category":"Paint & finishes","name":"Silicone Sealant","unit":"Tube"},{"category":"Paint & finishes","name":"Acrylic Sealant","unit":"Tube"},{"category":"Paint & finishes","name":"Ceramic Floor Tile","unit":"Box"},{"category":"Paint & finishes","name":"Porcelain Tile","unit":"Box"},{"category":"Paint & finishes","name":"Tile Spacer","unit":"Pack"},{"category":"Paint & finishes","name":"Tile Trim","unit":"Piece"},{"category":"Fasteners & fittings","name":"Common Nails","unit":"Kg"},{"category":"Fasteners & fittings","name":"Concrete Nails","unit":"Kg"},{"category":"Fasteners & fittings","name":"Roofing Nails","unit":"Kg"},{"category":"Fasteners & fittings","name":"Panel Pins","unit":"Kg"},{"category":"Fasteners & fittings","name":"Wood Screws","unit":"Pack"},{"category":"Fasteners & fittings","name":"Self Tapping Screws","unit":"Pack"},{"category":"Fasteners & fittings","name":"Bolts","unit":"Piece"},{"category":"Fasteners & fittings","name":"Nuts","unit":"Piece"},{"category":"Fasteners & fittings","name":"Washers","unit":"Piece"},{"category":"Fasteners & fittings","name":"Wall Plugs","unit":"Pack"},{"category":"Fasteners & fittings","name":"Hinges","unit":"Pair"},{"category":"Fasteners & fittings","name":"Padlock","unit":"Piece"},{"category":"Fasteners & fittings","name":"Door Lockset","unit":"Set"},{"category":"Fasteners & fittings","name":"Door Handle","unit":"Pair"},{"category":"Fasteners & fittings","name":"Tower Bolt","unit":"Piece"},{"category":"Fasteners & fittings","name":"Door Closer","unit":"Piece"},{"category":"Fasteners & fittings","name":"Window Stay","unit":"Piece"},{"category":"Tools & equipment","name":"Claw Hammer","unit":"Piece"},{"category":"Tools & equipment","name":"Ball Pein Hammer","unit":"Piece"},{"category":"Tools & equipment","name":"Adjustable Spanner","unit":"Piece"},{"category":"Tools & equipment","name":"Combination Spanner Set","unit":"Set"},{"category":"Tools & equipment","name":"Pliers","unit":"Piece"},{"category":"Tools & equipment","name":"Screwdriver Set","unit":"Set"},{"category":"Tools & equipment","name":"Tape Measure","unit":"Piece"},{"category":"Tools & equipment","name":"Spirit Level","unit":"Piece"},{"category":"Tools & equipment","name":"Hacksaw","unit":"Piece"},{"category":"Tools & equipment","name":"Hand Saw","unit":"Piece"},{"category":"Tools & equipment","name":"Cold Chisel","unit":"Piece"},{"category":"Tools & equipment","name":"Trowel","unit":"Piece"},{"category":"Tools & equipment","name":"Shovel","unit":"Piece"},{"category":"Tools & equipment","name":"Pick Axe","unit":"Piece"},{"category":"Tools & equipment","name":"Electric Drill","unit":"Piece"},{"category":"Tools & equipment","name":"Angle Grinder","unit":"Piece"},{"category":"Tools & equipment","name":"Circular Saw","unit":"Piece"},{"category":"Tools & equipment","name":"Welding Machine","unit":"Piece"},{"category":"Tools & equipment","name":"Drill Bit Set","unit":"Set"},{"category":"Tools & equipment","name":"Cutting Disc","unit":"Piece"},{"category":"Tools & equipment","name":"Grinding Disc","unit":"Piece"},{"category":"Safety & protective wear","name":"Safety Boots","unit":"Pair"},{"category":"Safety & protective wear","name":"Safety Helmet","unit":"Piece"},{"category":"Safety & protective wear","name":"Reflective Jacket","unit":"Piece"},{"category":"Safety & protective wear","name":"Work Gloves","unit":"Pair"},{"category":"Safety & protective wear","name":"Dust Mask","unit":"Piece"},{"category":"Safety & protective wear","name":"Safety Goggles","unit":"Piece"},{"category":"Safety & protective wear","name":"Ear Protection","unit":"Pair"},{"category":"Safety & protective wear","name":"Safety Harness","unit":"Piece"},{"category":"Safety & protective wear","name":"Overalls","unit":"Piece"},{"category":"Safety & protective wear","name":"Fire Extinguisher","unit":"Piece"},{"category":"Safety & protective wear","name":"First Aid Kit","unit":"Kit"},{"category":"Doors & household","name":"Steel Door","unit":"Piece"},{"category":"Doors & household","name":"Flush Door","unit":"Piece"},{"category":"Doors & household","name":"Wooden Door","unit":"Piece"},{"category":"Doors & household","name":"Aluminium Window","unit":"Piece"},{"category":"Doors & household","name":"Glass Pane","unit":"Sheet"},{"category":"Doors & household","name":"Cabinet Handle","unit":"Piece"},{"category":"Doors & household","name":"Drawer Runner","unit":"Pair"},{"category":"Doors & household","name":"Curtain Rail","unit":"Piece"},{"category":"Doors & household","name":"Kitchen Tap","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Drip Irrigation Pipe","unit":"Metre"},{"category":"Agriculture & irrigation","name":"Sprinkler","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Garden Hose Pipe","unit":"Metre"},{"category":"Agriculture & irrigation","name":"Hose Connector","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Knapsack Sprayer","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Spray Nozzle","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Irrigation Filter","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Greenhouse Polythene","unit":"Metre"},{"category":"Agriculture & irrigation","name":"Shade Net","unit":"Metre"},{"category":"Agriculture & irrigation","name":"Poultry Feeder","unit":"Piece"},{"category":"Agriculture & irrigation","name":"Poultry Drinker","unit":"Piece"},{"category":"General supplies","name":"Wheelbarrow","unit":"Piece"},{"category":"General supplies","name":"Ladder","unit":"Piece"},{"category":"General supplies","name":"Plastic Bucket","unit":"Piece"},{"category":"General supplies","name":"Tarpaulin","unit":"Piece"},{"category":"General supplies","name":"Rope","unit":"Metre"},{"category":"General supplies","name":"Plastic Sheet","unit":"Metre"},{"category":"General supplies","name":"Watering Can","unit":"Piece"},{"category":"General supplies","name":"Scaffolding Coupler","unit":"Piece"},{"category":"General supplies","name":"Concrete Mixer","unit":"Piece"}];

function normalise(value: unknown, max = 160) {
  return textField(value, max).toLowerCase().replace(/\\s+/g, ' ');
}
function productTable(userId: string) {
  return table(userId, 'products');
}
async function ensureStarterCatalogue(userId: string) {
  const existing = await db.list(productTable(userId), { limit: 500 });
  if (existing.items.length > 0) return existing.items;
  const now = new Date().toISOString();
  const records = starterCatalogue.map((item, index) => ({
    ...item,
    sku: 'HD-' + String(index + 1).padStart(4, '0'),
    brand: '',
    variant: '',
    barcode: '',
    purchaseUnit: item.unit,
    conversionFactor: 1,
    buyingPrice: 0,
    sellingPrice: 0,
    reorderLevel: 0,
    taxCategory: 'Unconfigured',
    active: true,
    source: 'starter_catalogue',
    ownerUserId: userId,
    createdAt: now,
    updatedAt: now,
  }));
  const ids = await db.add(productTable(userId), records);
  if (ids.some(id => !id)) throw new Error('The starter catalogue could not be fully loaded.');
  const loaded = await db.list(productTable(userId), { limit: 500 });
  return loaded.items;
}

async function addOwned(
  userId: string,
  name: string,
  record: Record<string, unknown>
) {
  const [id] = await db.add(table(userId, name), [
    {
      ...record,
      ownerUserId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  if (!id) throw new Error('The record could not be saved.');
  return { ...record, id, ownerUserId: userId };
}

const defaultAccounts = [
  { code: '1000', name: 'Cash on Hand', type: 'ASSET', group: 'Cash & cash equivalents' },
  { code: '1010', name: 'M-Pesa Wallet', type: 'ASSET', group: 'Cash & cash equivalents' },
  { code: '1020', name: 'Bank Account', type: 'ASSET', group: 'Cash & cash equivalents' },
  { code: '1200', name: 'Inventory Asset', type: 'ASSET', group: 'Current assets' },
  { code: '1300', name: 'Accounts Receivable', type: 'ASSET', group: 'Current assets' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', group: 'Current liabilities' },
  { code: '2010', name: 'Customer Refunds Payable', type: 'LIABILITY', group: 'Current liabilities' },
  { code: '3000', name: 'Owner Capital & Opening Balances', type: 'EQUITY', group: 'Equity' },
  { code: '3100', name: 'Inventory Opening / Adjustment Clearing', type: 'EQUITY', group: 'Equity' },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME', group: 'Operating income' },
  { code: '4010', name: 'Sales Returns & Allowances', type: 'EXPENSE', group: 'Contra revenue' },
  { code: '4200', name: 'Other Business Income', type: 'INCOME', group: 'Other income' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', group: 'Cost of sales' },
  { code: '5100', name: 'Rent Expense', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5110', name: 'Utilities Expense', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5120', name: 'Salaries & Wages', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5130', name: 'Transport & Delivery', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5140', name: 'Repairs & Maintenance', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5150', name: 'Licences & Permits', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5160', name: 'Marketing & Advertising', type: 'EXPENSE', group: 'Operating expenses' },
  { code: '5190', name: 'General Operating Expenses', type: 'EXPENSE', group: 'Operating expenses' },
];

async function ensureAccountingAccounts(userId: string) {
  const existing = await listOwned(userId, 'accounting_accounts');
  const existingCodes = new Set(existing.map((account: any) => account.code));
  const missing = defaultAccounts.filter(account => !existingCodes.has(account.code));
  if (missing.length) {
    const now = new Date().toISOString();
    const ids = await db.add(table(userId, 'accounting_accounts'), missing.map(account => ({
      ...account, active: true, system: true, ownerUserId: userId, createdAt: now, updatedAt: now,
    })));
    if (ids.some(id => !id)) throw new Error('The chart of accounts could not be initialised.');
  }
  return listOwned(userId, 'accounting_accounts');
}

async function postJournal(userId: string, entry: {
  sourceType: string;
  sourceId: string;
  reference: string;
  description: string;
  date?: string;
  lines: Array<{ accountCode: string; debit?: number; credit?: number }>;
}) {
  const sourceKey = entry.sourceType + ':' + entry.sourceId;
  const existing = await listOwned(userId, 'journal_entries');
  const duplicate = existing.find((journal: any) => journal.sourceKey === sourceKey);
  if (duplicate) return duplicate;
  const accounts = await ensureAccountingAccounts(userId);
  const totalDebit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0) * 100) / 100;
  const totalCredit = Math.round(entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0) * 100) / 100;
  if (!entry.lines.length || Math.abs(totalDebit - totalCredit) > 0.01 || totalDebit <= 0)
    throw new Error('Accounting entry rejected: journal debits and credits must balance.');
  const lines = entry.lines.map(line => {
    const account = accounts.find((item: any) => item.code === line.accountCode && item.active !== false);
    if (!account) throw new Error('Accounting account ' + line.accountCode + ' is not configured.');
    const debit = Math.round(Number(line.debit || 0) * 100) / 100;
    const credit = Math.round(Number(line.credit || 0) * 100) / 100;
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0))
      throw new Error('Accounting journal lines must contain a non-negative debit or credit, not both.');
    return { accountCode: account.code, accountName: account.name, debit, credit };
  });
  return addOwned(userId, 'journal_entries', {
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceKey,
    reference: entry.reference,
    description: entry.description,
    date: entry.date ? new Date(entry.date + 'T00:00:00.000Z').toISOString() : new Date().toISOString(),
    status: 'POSTED',
    totalDebit,
    totalCredit,
    lines,
  });
}

function cashAccountCode(method: string) {
  if (method === 'CASH') return '1000';
  if (method === 'MPESA') return '1010';
  return '1020';
}


const ADMIN_EMAILS = ['collkip@gmail.com'];
const MASTER_CATALOGUE_CATEGORIES = [
  'Cement & masonry', 'Steel & metal', 'Roofing', 'Plumbing', 'Electrical',
  'Timber & boards', 'Paint & finishes', 'Fasteners & fittings',
  'Tools & equipment', 'Safety & protective wear', 'Doors & household',
  'Agriculture & irrigation', 'General supplies',
];

type MasterCatalogueRow = {
  category: string;
  productFamily: string;
  name: string;
  specification: string;
  brand: string;
  sku: string;
  barcode: string;
  stockUnit: string;
  purchaseUnit: string;
  conversionFactor: number;
  description: string;
};

function validateMasterCatalogueRows(input: unknown) {
  const errors: Array<{ row: number; message: string }> = [];
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) {
    return { rows: [] as MasterCatalogueRow[], errors: [{ row: 0, message: 'Upload between 1 and 500 catalogue rows.' }] };
  }
  const rows: MasterCatalogueRow[] = [];
  const seenSkus = new Set<string>();
  const seenSpecs = new Set<string>();
  input.forEach((raw, index) => {
    const item = (raw || {}) as Record<string, unknown>;
    const rowNumber = index + 2;
    const category = textField(item.category, 100);
    const name = textField(item.name, 160);
    const sku = textField(item.sku, 60).toUpperCase();
    const stockUnit = textField(item.stockUnit ?? item.unit, 40);
    const purchaseUnit = textField(item.purchaseUnit, 40) || stockUnit;
    const conversionFactor = item.conversionFactor === '' || item.conversionFactor == null ? 1 : Number(item.conversionFactor);
    const productFamily = textField(item.productFamily, 120);
    const specification = textField(item.specification, 160);
    const brand = textField(item.brand, 100);
    const barcode = textField(item.barcode, 80);
    const description = textField(item.description, 500);
    if (!MASTER_CATALOGUE_CATEGORIES.includes(category)) errors.push({ row: rowNumber, message: 'Category is missing or is not one of the 13 supported categories.' });
    if (!name) errors.push({ row: rowNumber, message: 'Product name is required.' });
    if (!sku) errors.push({ row: rowNumber, message: 'SKU / item code is required.' });
    if (!stockUnit) errors.push({ row: rowNumber, message: 'Stock unit is required.' });
    if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) errors.push({ row: rowNumber, message: 'Conversion factor must be a positive number.' });
    const skuKey = sku.toLowerCase();
    const specKey = [category, productFamily, name, specification, brand].map(normalise).join('|');
    if (sku && seenSkus.has(skuKey)) errors.push({ row: rowNumber, message: 'Duplicate SKU within this upload: ' + sku });
    if (name && seenSpecs.has(specKey)) errors.push({ row: rowNumber, message: 'Duplicate product specification within this upload.' });
    if (sku) seenSkus.add(skuKey);
    if (name) seenSpecs.add(specKey);
    rows.push({ category, productFamily, name, specification, brand, sku, barcode, stockUnit, purchaseUnit, conversionFactor, description });
  });
  return { rows, errors };
}

function masterItemsTable(version: number) {
  return 'master_catalogue_v' + String(version);
}

async function listMasterReleases() {
  const result = await db.list('master_catalogue_releases', { limit: 100 });
  return result.items.slice().sort((a: any, b: any) => Number(b.version || 0) - Number(a.version || 0));
}

async function getCurrentMasterRelease() {
  const releases = await listMasterReleases();
  const release = releases.find((item: any) => item.status === 'PUBLISHED');
  if (!release) return { release: null, items: [] as any[] };
  const result = await db.list(masterItemsTable(Number(release.version)), { limit: 500 });
  return { release, items: result.items };
}

async function publishMasterCatalogue(rows: MasterCatalogueRow[], createdBy: string, sourceVersion?: number) {
  const releases = await listMasterReleases();
  const version = releases.reduce((max: number, item: any) => Math.max(max, Number(item.version || 0)), 0) + 1;
  const now = new Date().toISOString();
  const releaseRecord = {
    version,
    status: 'DRAFT',
    itemCount: rows.length,
    createdBy,
    createdAt: now,
    sourceVersion: sourceVersion ?? null,
  };
  const [releaseId] = await db.add('master_catalogue_releases', [releaseRecord]);
  if (!releaseId) throw new Error('The catalogue release could not be created.');
  const records = rows.map((row, index) => ({
    ...row,
    releaseId,
    version,
    sortOrder: index + 1,
    createdAt: now,
  }));
  const ids = await db.add(masterItemsTable(version), records);
  if (ids.some(id => !id)) {
    await db.delete(masterItemsTable(version), ids.filter((id): id is string => Boolean(id)));
    await db.update('master_catalogue_releases', [{
      id: releaseId,
      record: { ...releaseRecord, status: 'FAILED', updatedAt: new Date().toISOString() },
    }]);
    throw new Error('The catalogue rows could not all be saved. No release was published.');
  }
  const published = { ...releaseRecord, status: 'PUBLISHED', publishedAt: new Date().toISOString() };
  const [updated] = await db.update('master_catalogue_releases', [{ id: releaseId, record: published }]);
  if (!updated) throw new Error('Catalogue rows were saved, but the release could not be published. Contact support before retrying.');
  return { ...published, id: releaseId };
}

async function ensureInitialMasterCatalogue(createdBy: string) {
  const releases = await listMasterReleases();
  if (releases.some((item: any) => item.status === 'PUBLISHED')) return;
  const rows = starterCatalogue.map((item, index) => ({
    category: item.category,
    productFamily: item.category,
    name: item.name,
    specification: '',
    brand: '',
    sku: 'HD-' + String(index + 1).padStart(4, '0'),
    barcode: '',
    stockUnit: item.unit,
    purchaseUnit: item.unit,
    conversionFactor: 1,
    description: '',
  }));
  await publishMasterCatalogue(rows, createdBy);
}

export const handler = router({

  'GET /api/software-owner/summary': [
    requireAuth(),
    async ctx => {
      if (!isSoftwareOwner(ctx)) return error('Access is restricted to the Collkip Software Owner administrator.', 403);
      const licences = await db.list(desktopLicenceTable, { limit: 500 });
      const items = licences.items.map((item: any) => ({
        id: item.id, businessName: item.businessName, contactName: item.contactName,
        contactEmail: item.contactEmail, contactPhone: item.contactPhone, plan: item.plan,
        status: item.status, price: item.price, currency: item.currency, startsAt: item.startsAt,
        expiresAt: item.expiresAt, deviceLimit: item.deviceLimit, branchLimit: item.branchLimit,
        activatedAt: item.activatedAt, createdAt: item.createdAt,
      }));
      return json({ items, total: items.length,
        active: items.filter((x: any) => licenceIsUsable(x)).length,
        suspended: items.filter((x: any) => x.status === 'suspended').length });
    },
  ],
  'POST /api/software-owner/licences': [
    requireAuth(),
    async ctx => {
      if (!isSoftwareOwner(ctx)) return error('Access is restricted to the Collkip Software Owner administrator.', 403);
      const body = (ctx.body || {}) as Record<string, any>;
      const businessName = textField(body.businessName, 160);
      const contactName = textField(body.contactName, 120);
      const contactEmail = textField(body.contactEmail, 160).toLowerCase();
      const contactPhone = textField(body.contactPhone, 50);
      const plan = ['monthly', 'annual', 'lifetime'].includes(body.plan) ? body.plan : '';
      const price = Number(body.price || 0);
      const deviceLimit = Math.floor(Number(body.deviceLimit || 1));
      const branchLimit = Math.floor(Number(body.branchLimit || 1));
      if (!businessName || !contactName || !plan || !Number.isFinite(price) || price < 0 ||
          deviceLimit < 1 || deviceLimit > 100 || branchLimit < 1 || branchLimit > 100)
        return error('Enter a business, contact, valid plan, non-negative price, and device/branch limits between 1 and 100.', 400);
      const now = new Date();
      const startsAt = body.startsAt ? new Date(String(body.startsAt)).toISOString() : now.toISOString();
      const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() :
        plan === 'monthly' ? new Date(now.getTime() + 30 * 86400000).toISOString() :
        plan === 'annual' ? new Date(now.getTime() + 365 * 86400000).toISOString() : null;
      if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(startsAt)))
        return error('The expiry date must be after the start date.', 400);
      const key = 'HRMS-' + randomHex(16).toUpperCase().match(/.{1,4}/g)!.join('-');
      const record = { businessName, contactName, contactEmail, contactPhone, plan, price,
        currency: textField(body.currency, 8) || 'KES', deviceLimit, branchLimit, startsAt, expiresAt,
        status: 'issued', keyHash: await sha256(key), businessUserId: null, businessId: null,
        activatedAt: null, createdAt: now.toISOString(), createdBy: ctx.user!.userId };
      const [id] = await db.add(desktopLicenceTable, [record]);
      if (!id) return error('The licence could not be created. Please retry.', 500);
      return json({ id, licenceKey: key, businessName, plan, status: 'issued', expiresAt, deviceLimit, branchLimit });
    },
  ],
  'PATCH /api/software-owner/licences/:id': [
    requireAuth(),
    async ctx => {
      if (!isSoftwareOwner(ctx)) return error('Access is restricted to the Collkip Software Owner administrator.', 403);
      const records = await db.list(desktopLicenceTable, { limit: 500 });
      const current = records.items.find((item: any) => item.id === ctx.params.id);
      if (!current) return error('Licence not found.', 404);
      const body = (ctx.body || {}) as Record<string, any>;
      const status = body.status === undefined ? current.status : body.status;
      if (!['active', 'suspended', 'revoked', 'issued'].includes(status)) return error('Invalid licence status.', 400);
      const deviceLimit = body.deviceLimit === undefined ? current.deviceLimit : Math.floor(Number(body.deviceLimit));
      const branchLimit = body.branchLimit === undefined ? current.branchLimit : Math.floor(Number(body.branchLimit));
      if (!Number.isFinite(deviceLimit) || deviceLimit < 1 || deviceLimit > 100 || !Number.isFinite(branchLimit) || branchLimit < 1 || branchLimit > 100)
        return error('Device and branch limits must be between 1 and 100.', 400);
      let expiresAt = current.expiresAt;
      if (body.expiresAt !== undefined) {
        expiresAt = body.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null;
        if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) return error('Enter a valid expiry date.', 400);
      }
      const updated = { ...current, status, deviceLimit, branchLimit, expiresAt, updatedAt: new Date().toISOString() };
      const [saved] = await db.update(desktopLicenceTable, [{ id: current.id, record: updated }]);
      if (!saved) return error('Licence changes could not be saved.', 500);
      return json({ ok: true, licence: { id: updated.id, status, expiresAt, deviceLimit, branchLimit } });
    },
  ],
  'POST /api/desktop/licences/activate': [
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const key = textField(body.licenceKey, 100).toUpperCase();
      const deviceId = textField(body.deviceId, 100);
      const deviceName = textField(body.deviceName, 120) || 'Primary Windows computer';
      if (!key || !deviceId) return error('A licence key and device identity are required.', 400);
      const all = await db.list(desktopLicenceTable, { limit: 500 });
      const keyHash = await sha256(key);
      const licence = all.items.find((item: any) => item.keyHash === keyHash);
      if (!licence) return error('The licence key is invalid.', 404);
      if (licence.status !== 'issued') return error('This licence has already been activated or is not available for activation.', 409);
      if (licence.startsAt && Date.parse(licence.startsAt) > Date.now()) return error('This licence is not active yet.', 403);
      if (licence.expiresAt && Date.parse(licence.expiresAt) <= Date.now()) return error('This licence has expired. Contact Collkip for renewal.', 403);
      const userId = 'business_' + randomHex(16);
      const businessId = textField(body.businessId, 100) || randomHex(16);
      const now = new Date().toISOString();
      const [claimed] = await db.tx.update(desktopLicenceTable, [{ id: licence.id,
        record: { ...licence, status: 'active', businessUserId: userId, businessId, activatedAt: now, primaryDeviceId: deviceId },
        if: { status: 'issued', keyHash: licence.keyHash } }], { patch: true });
      if (!claimed) return error('This licence has already been activated. Contact Collkip if you need help.', 409);
      const token = randomHex(32);
      const [deviceIdRecord] = await db.add(table(userId, 'desktop_devices'), [{
        userId, deviceId, deviceName, deviceType: 'Windows desktop', ownerDevice: true,
        status: 'active', createdAt: now, lastSeenAt: now, licenceId: licence.id }]);
      const [tokenId] = await db.add(desktopTokenTable, [{
        tokenHash: await sha256(token), userId, deviceId, ownerDevice: true,
        status: 'active', createdAt: now, licenceId: licence.id }]);
      if (!deviceIdRecord || !tokenId) return error('The licence was claimed but the primary device could not be registered. Contact support.', 500);
      return json({ ok: true, id: licence.id, deviceToken: token, ownerDevice: true, deviceId, businessId,
        businessName: licence.businessName, plan: licence.plan, expiresAt: licence.expiresAt,
        deviceLimit: licence.deviceLimit, branchLimit: licence.branchLimit });
    },
  ],

  'POST /api/desktop/licences/attach': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Sign in again on the primary Business Owner computer.', 401);
      if (!device.ownerDevice) return error('Only the primary Business Owner computer can attach the business licence.', 403);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const key = textField(body.licenceKey, 100).toUpperCase();
      if (!key) return error('A licence key is required.', 400);
      const current = await getLicenceForBusiness(device.userId);
      if (current) return error('This business already has a licence linked to it.', 409);
      const all = await db.list(desktopLicenceTable, { limit: 500 });
      const keyHash = await sha256(key);
      const licence = all.items.find((item: any) => item.keyHash === keyHash);
      if (!licence) return error('The licence key is invalid.', 404);
      if (licence.status !== 'issued') return error('This licence has already been activated or is not available for activation.', 409);
      if (licence.startsAt && Date.parse(licence.startsAt) > Date.now()) return error('This licence is not active yet.', 403);
      if (licence.expiresAt && Date.parse(licence.expiresAt) <= Date.now()) return error('This licence has expired. Contact Collkip for renewal.', 403);
      const saved = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
      const snapshotBusinessId = saved.items[0]?.snapshot?.business?.id;
      const businessId = String(snapshotBusinessId || textField(body.businessId, 100) || randomHex(16));
      const now = new Date().toISOString();
      const [claimed] = await db.tx.update(desktopLicenceTable, [{
        id: licence.id,
        record: { ...licence, status: 'active', businessUserId: device.userId, businessId, activatedAt: now, primaryDeviceId: device.deviceId },
        if: { status: 'issued', keyHash: licence.keyHash },
      }], { patch: true });
      if (!claimed) return error('This licence has already been activated. Contact Collkip if you need help.', 409);
      const tokenUpdated = await db.update(desktopTokenTable, [{ id: device.id, record: { ...device, licenceId: licence.id, lastSeenAt: now } }]);
      const deviceRows = await db.list(table(device.userId, 'desktop_devices'), { limit: 100 });
      const registeredDevice = deviceRows.items.find((item: any) => item.deviceId === device.deviceId);
      let deviceSaved = false;
      if (registeredDevice) {
        const [ok] = await db.update(table(device.userId, 'desktop_devices'), [{
          id: registeredDevice.id,
          record: { ...registeredDevice, licenceId: licence.id, status: 'active', lastSeenAt: now },
        }]);
        deviceSaved = Boolean(ok);
      } else {
        const [id] = await db.add(table(device.userId, 'desktop_devices'), [{
          userId: device.userId, deviceId: device.deviceId, deviceName: textField(body.deviceName, 120) || 'Primary Windows computer',
          deviceType: 'Windows desktop', ownerDevice: true, status: 'active', createdAt: now, lastSeenAt: now, licenceId: licence.id,
        }]);
        deviceSaved = Boolean(id);
      }
      if (!tokenUpdated?.[0] || !deviceSaved) {
        console.error('Licence attached but existing primary device metadata could not be fully updated', { licenceId: licence.id, deviceId: device.deviceId });
        return error('The licence was linked, but this computer record could not be fully updated. Contact Collkip before retrying.', 500);
      }
      return json({ ok: true, id: licence.id, ownerDevice: true, deviceId: device.deviceId, businessId,
        businessName: licence.businessName, plan: licence.plan, expiresAt: licence.expiresAt,
        deviceLimit: licence.deviceLimit, branchLimit: licence.branchLimit });
    },
  ],
  'GET /api/desktop/licences/status': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Sign in again.', 401);
      const licence = await getLicenceForBusiness(device.userId);
      if (!licence) return json({ licenceActive: false, status: 'none', message: 'No licence is currently linked to this business.' });
      const expired = Boolean(licence.expiresAt && Date.parse(licence.expiresAt) <= Date.now());
      const status = expired && licence.status === 'active' ? 'expired' : licence.status;
      const licenceActive = licenceIsUsable(licence);
      const message = licenceActive ? 'Your business licence is active.' :
        status === 'expired' ? 'Your business licence has expired. Enter a replacement licence key below.' :
        status === 'suspended' ? 'Your business licence has been suspended. Enter a replacement licence key below or contact Collkip.' :
        status === 'revoked' ? 'Your business licence has been revoked. Enter a replacement licence key below or contact Collkip.' :
        'Your business licence is not active. Enter a replacement licence key below or contact Collkip.';
      return json({ licenceActive, status, message, expiresAt: licence.expiresAt || null });
    },
  ],
  'POST /api/desktop/licences/replace': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Sign in again.', 401);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const actorStaffId = textField(body.actorStaffId, 100);
      const passwordHash = textField(body.passwordHash, 300);
      if (!actorStaffId || !passwordHash.startsWith('$argon2')) {
        return error('Sign in as the Business Owner before replacing the licence.', 403);
      }
      const syncRows = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
      const snapshot = syncRows.items.length ? syncRows.items[0].snapshot : null;
      const staffRows = snapshot && Array.isArray(snapshot.staff) ? snapshot.staff : [];
      const ownerAccount = staffRows.find((item: any) =>
        item.profile && item.profile.id === actorStaffId &&
        item.profile.role === 'Business Owner' &&
        item.profile.status === 'active' &&
        item.account && item.account.status === 'active' &&
        item.account.passwordHash === passwordHash
      );
      if (!ownerAccount) return error('The signed-in account could not be verified as this business active Business Owner. Sync and sign in again.', 403);
      const current = await getLicenceForBusiness(device.userId);
      if (!current) return error('No existing licence was found for this business. Contact Collkip for assistance.', 404);
      if (licenceIsUsable(current)) return error('The current licence is still active. A replacement is only needed after suspension, revocation or expiry.', 409);
      const key = textField(body.licenceKey, 100).toUpperCase();
      if (!key) return error('Enter the replacement licence key.', 400);
      const all = await db.list(desktopLicenceTable, { limit: 500 });
      const keyHash = await sha256(key);
      const replacement = all.items.find((item: any) => item.keyHash === keyHash);
      if (!replacement) return error('The replacement licence key is invalid.', 404);
      if (replacement.id === current.id) return error('Enter a new licence key, not the expired or inactive key.', 400);
      if (replacement.status !== 'issued' || replacement.businessUserId) return error('This replacement licence has already been used or is not available.', 409);
      if (replacement.startsAt && Date.parse(replacement.startsAt) > Date.now()) return error('This replacement licence is not active yet.', 403);
      if (replacement.expiresAt && Date.parse(replacement.expiresAt) <= Date.now()) return error('This replacement licence has already expired.', 403);
      const now = new Date().toISOString();
      const businessId = String(current.businessId || snapshot?.business?.id || textField(body.businessId, 100) || '');
      const oldRecord = { ...current, status: 'replaced', businessUserId: null, businessId: null, replacedAt: now, replacedByLicenceId: replacement.id, updatedAt: now };
      const newRecord = { ...replacement, status: 'active', businessUserId: device.userId, businessId, activatedAt: now, primaryDeviceId: current.primaryDeviceId || device.deviceId, updatedAt: now };
      const updated = await db.tx.update(desktopLicenceTable, [
        { id: current.id, record: oldRecord, if: { status: current.status, keyHash: current.keyHash } },
        { id: replacement.id, record: newRecord, if: { status: 'issued', keyHash: replacement.keyHash } },
      ], { patch: true });
      if (!updated || updated.length !== 2 || !updated.every(Boolean)) return error('The replacement key could not be applied. Refresh and try again.', 409);
      return json({ ok: true, id: newRecord.id, deviceToken: null, ownerDevice: device.ownerDevice, deviceId: device.deviceId, businessId, businessName: replacement.businessName, plan: replacement.plan, expiresAt: replacement.expiresAt, deviceLimit: replacement.deviceLimit, branchLimit: replacement.branchLimit });
    },
  ],

  'POST /api/desktop/pairings/issue': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('Sign in on an authorised business computer before generating a pairing code.', 401);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const actorStaffId = textField(body.actorStaffId, 100);
      const passwordHash = textField(body.passwordHash, 300);
      if (!actorStaffId || !passwordHash.startsWith('$argon2')) {
        return error('Sign in as the Business Owner before generating a pairing code.', 403);
      }
      const syncRows = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
      const staffRows = Array.isArray(syncRows.items[0]?.snapshot?.staff) ? syncRows.items[0].snapshot.staff : [];
      const ownerAccount = staffRows.find((item: any) =>
        item.profile?.id === actorStaffId && item.profile?.role === 'Business Owner' &&
        item.profile?.status === 'active' && item.account?.status === 'active' &&
        item.account?.mustChangePassword !== true && item.account?.passwordHash === passwordHash
      );
      if (!ownerAccount) return error('The signed-in account could not be verified as this business active Business Owner. Sync and sign in again.', 403);
      const licence = await getLicenceForBusiness(device.userId);
      if (!licenceIsUsable(licence)) return error('The business licence is not active. Refresh licence status before generating pairing codes.', 403);
      const devices = await db.list(table(device.userId, 'desktop_devices'), { limit: 100 });
      const activeDevices = devices.items.filter((item: any) => item.status === 'active');
      if (activeDevices.length >= Number(licence.deviceLimit || 1)) return error('The device allowance for this business licence has been reached.', 403);
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 90000000 + 10000000);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const record = {
        userId: device.userId,
        codeHash: await sha256(code),
        createdAt: new Date().toISOString(),
        expiresAt,
        claimedAt: null,
        status: 'pending',
        ownerDevice: false,
        createdByDeviceId: device.deviceId,
      };
      const [id] = await db.add(desktopPairingTable, [record]);
      if (!id) return error('A pairing code could not be created. Please try again.', 500);
      return json({ code, expiresAt, ownerDevice: false });
    },
  ],
  'POST /api/desktop/pairings/claim': [
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const code = textField(body.code, 16).replace(/\s/g, '');
      const deviceId = textField(body.deviceId, 80);
      const deviceName = textField(body.deviceName, 100) || 'Windows desktop';
      if (!/^\d{8}$/.test(code) || !deviceId) return error('Enter a valid 8-digit pairing code and device identity.', 400);
      const sourceIp = textField(ctx.event?.requestContext?.http?.sourceIp || ctx.event?.requestContext?.identity?.sourceIp || 'unknown', 80);
      const ipHash = await sha256(sourceIp);
      const attemptsTable = 'desktop_pairing_attempts_global';
      const attempts = await db.list(attemptsTable, { limit: 500 });
      const currentAttempt = attempts.items.find((item: any) => item.ipHash === ipHash);
      const now = Date.now();
      const inWindow = currentAttempt && now - Date.parse(currentAttempt.windowStartedAt) < 10 * 60 * 1000;
      if (inWindow && Number(currentAttempt.attempts || 0) >= 10) {
        return error('Too many pairing attempts from this connection. Wait 10 minutes and generate a new code.', 429);
      }
      const attemptRecord = {
        ipHash,
        attempts: inWindow ? Number(currentAttempt.attempts || 0) + 1 : 1,
        windowStartedAt: inWindow ? currentAttempt.windowStartedAt : new Date().toISOString(),
      };
      if (currentAttempt) {
        const [saved] = await db.update(attemptsTable, [{ id: currentAttempt.id, record: { ...currentAttempt, ...attemptRecord } }]);
        if (!saved) return error('Pairing protection could not be updated. Please retry shortly.', 503);
      } else {
        const [saved] = await db.add(attemptsTable, [attemptRecord]);
        if (!saved) return error('Pairing protection could not be initialised. Please retry shortly.', 503);
      }
      const codeHash = await sha256(code);
      const pairings = await db.list(desktopPairingTable, { limit: 500 });
      const pairing = pairings.items.find((item: any) => item.codeHash === codeHash && item.status === 'pending');
      if (!pairing) return error('This pairing code is invalid or has already been used.', 404);
      if (Date.parse(pairing.expiresAt) <= Date.now()) return error('This pairing code has expired. Generate a new one from the owner portal.', 410);
      const licence = await getLicenceForBusiness(pairing.userId);
      if (!licenceIsUsable(licence)) return error('The business licence is not active. Contact Collkip before pairing another computer.', 403);
      const devices = await db.list(table(pairing.userId, 'desktop_devices'), { limit: 100 });
      if (devices.items.filter((item: any) => item.status === 'active').length >= Number(licence.deviceLimit || 1)) {
        return error('The device allowance for this business licence has been reached.', 403);
      }
      if (devices.items.some((item: any) => item.deviceId === deviceId && item.status === 'active')) {
        return error('This computer is already registered. Use its existing installation or revoke its previous registration.', 409);
      }
      const [claimed] = await db.tx.update(desktopPairingTable, [{
        id: pairing.id,
        record: { claimedAt: new Date().toISOString(), status: 'claimed', claimedDeviceId: deviceId },
        if: { status: 'pending' },
      }], { patch: true });
      if (!claimed) return error('This pairing code has already been claimed. Generate a new code.', 409);
      const token = randomHex(32);
      const tokenHash = await sha256(token);
      const device = {
        userId: pairing.userId,
        deviceId,
        deviceName,
        deviceType: 'Windows desktop',
        ownerDevice: false,
        licenceId: licence.id,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      const [deviceRecordId] = await db.add(table(pairing.userId, 'desktop_devices'), [device]);
      if (!deviceRecordId) return error('The computer could not be registered. Generate a new pairing code and try again.', 500);
      const [tokenId] = await db.add(desktopTokenTable, [{
        tokenHash,
        userId: pairing.userId,
        deviceId,
        ownerDevice: false,
        licenceId: licence.id,
        status: 'active',
        createdAt: new Date().toISOString(),
      }]);
      if (!tokenId) return error('A secure device credential could not be issued.', 500);
      return json({ deviceToken: token, ownerDevice: false, deviceId, licenceId: licence.id,
        licenceStatus: licence.status, plan: licence.plan, expiresAt: licence.expiresAt || null,
        deviceLimit: licence.deviceLimit, branchLimit: licence.branchLimit,
        businessId: licence.businessId || null, businessName: licence.businessName || null });
    },
  ],
  'GET /api/desktop/sync/pull': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const headers = ctx.event?.headers || {};
      const hasActorProof = Boolean(headers['x-hrms-staff-id'] || headers['X-Hrms-Staff-Id'] ||
        headers['x-hrms-password-hash'] || headers['X-Hrms-Password-Hash']);
      const actor = hasActorProof ? await verifiedDesktopActor(ctx, device) : null;
      if (hasActorProof && !actor) return error('The signed-in staff account could not be verified. Sign in again and synchronise.', 403);
      const saved = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
      const now = new Date().toISOString();
      const tokenRecord = { ...device, lastSeenAt: now };
      await db.update(desktopTokenTable, [{ id: device.id, record: tokenRecord }]);
      return json({ snapshot: saved.items[0]?.snapshot || null, updatedAt: saved.items[0]?.updatedAt || null,
        ownerDevice: actor ? actor.profile.role === 'Business Owner' : false, bootstrap: !hasActorProof });
    },
  ],
  'POST /api/desktop/sync/password': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const body = (ctx.body || {}) as Record<string, any>;
      const staffId = textField(body.staffId, 80);
      const actorStaffId = textField(ctx.event?.headers?.['x-hrms-staff-id'] || ctx.event?.headers?.['X-Hrms-Staff-Id'], 100);
      const expectedHash = typeof body.expectedPasswordHash === 'string' ? body.expectedPasswordHash : '';
      const nextHash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
      if (!actorStaffId || actorStaffId !== staffId) return error('A staff member may only synchronise their own password change.', 403);
      if (!staffId || !expectedHash.startsWith('$argon2') || !nextHash.startsWith('$argon2')) {
        return error('A staff ID and Argon2 password hashes are required. Plaintext passwords are never accepted.', 400);
      }
      const targetTable = table(device.userId, 'desktop_sync_state');
      const saved = await db.list(targetTable, { limit: 1 });
      const current = saved.items[0];
      if (!current?.snapshot || !Array.isArray(current.snapshot.staff)) return error('The primary computer has not synchronised staff accounts yet.', 409);
      const snapshot = JSON.parse(JSON.stringify(current.snapshot));
      const staffRecord = snapshot.staff.find((item: any) => item.profile?.id === staffId);
      if (!staffRecord?.account) return error('This staff account is not present in the cloud workspace.', 404);
      if (staffRecord.account.passwordHash === nextHash) return json({ ok: true, alreadyApplied: true });
      if (staffRecord.account.passwordHash !== expectedHash) return error('The staff password has changed on another computer. Sync this computer and try again.', 409);
      staffRecord.account.passwordHash = nextHash;
      staffRecord.account.mustChangePassword = false;
      const updatedAt = new Date().toISOString();
      const record = { ...current, snapshot, updatedAt, revision: Number(current.revision || 0) + 1 };
      const [ok] = await db.update(targetTable, [{ id: current.id, record }]);
      if (!ok) return error('The password update could not be saved to the cloud. Please retry.', 500);
      return json({ ok: true, updatedAt });
    },
  ],
  'POST /api/desktop/sync/customers': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const actor = await verifiedDesktopActor(ctx, device);
      if (!actor) return error('The signed-in staff account could not be verified. Sign in again and synchronise.', 403);
      const body = (ctx.body || {}) as Record<string, any>;
      const incoming = Array.isArray(body.customers) ? body.customers : null;
      if (!incoming || incoming.length > 5000) return error('A valid customer list of up to 5,000 records is required.', 400);
      const targetTable = table(device.userId, 'desktop_sync_state');
      const saved = await db.list(targetTable, { limit: 1 });
      const current = saved.items[0];
      if (!current?.snapshot) return error('The primary computer has not synchronised the business workspace yet.', 409);
      const snapshot = JSON.parse(JSON.stringify(current.snapshot));
      const records = Array.isArray(snapshot.customers) ? snapshot.customers : [];
      const byId = new Map<string, any>(records.map((item: any): [string, any] => [item.id, item]));
      for (const item of incoming) {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.phone !== 'string' || item.name.trim().length < 2 || !item.phone.trim()) {
          return error('Every customer needs an ID, name and phone number.', 400);
        }
        const existing: any = byId.get(item.id);
        const incomingTime = Date.parse(item.updatedAt || item.createdAt || '') || 0;
        const existingTime = Date.parse(existing?.updatedAt || existing?.createdAt || '') || 0;
        if (!existing || incomingTime >= existingTime) byId.set(item.id, {
          id: item.id, businessId: snapshot.business?.id, name: item.name.slice(0,160), phone: item.phone.slice(0,40),
          email: typeof item.email === 'string' ? item.email.slice(0,160) : null,
          address: typeof item.address === 'string' ? item.address.slice(0,240) : null,
          kraPin: typeof item.kraPin === 'string' ? item.kraPin.slice(0,30) : null,
          notes: typeof item.notes === 'string' ? item.notes.slice(0,1000) : null,
          active: item.active !== false, createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
        });
      }
      snapshot.customers = Array.from(byId.values());
      const updatedAt = new Date().toISOString();
      const record = { ...current, snapshot, updatedAt, revision: Number(current.revision || 0) + 1 };
      const [ok] = await db.update(targetTable, [{ id: current.id, record }]);
      if (!ok) return error('Customer records could not be saved to the cloud. Please retry.', 500);
      return json({ ok: true, updatedAt, count: snapshot.customers.length });
    },
  ],
  'POST /api/desktop/sync/inventory': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const actor = await verifiedDesktopActor(ctx, device);
      if (!actor) return error('The signed-in staff account could not be verified. Sign in again and synchronise.', 403);
      if (actor.profile.role === 'Business Owner') return error('The Business Owner computer must publish the complete business snapshot.', 403);
      const body = (ctx.body || {}) as Record<string, any>;
      const incoming = body.stockMovements;
      if (!Array.isArray(incoming) || incoming.length > 10000) return error('The stock movement batch is invalid or exceeds 10,000 records.', 400);
      if (new TextEncoder().encode(JSON.stringify(body)).length > 5000000) return error('The stock movement batch exceeds the 5 MB limit.', 413);

      const targetTable = table(device.userId, 'desktop_sync_state');
      const existing = await db.list(targetTable, { limit: 1 });
      const current = existing.items[0];
      const snapshot = current?.snapshot;
      if (!snapshot?.business?.id || !snapshot.inventory || !Array.isArray(snapshot.inventory.stock_movements)) {
        return error('The owner computer must publish the initial business inventory before staff stock changes can sync.', 409);
      }
      const branches = new Set((Array.isArray(snapshot.branches) ? snapshot.branches : []).map((item: any) => item.id));
      const products = new Set((Array.isArray(snapshot.inventory.products) ? snapshot.inventory.products : []).map((item: any) => item.id));
      const warehouses = new Map((Array.isArray(snapshot.inventory.warehouses) ? snapshot.inventory.warehouses : []).map((item: any) => [item.id, item.branch_id]));
      const staff = new Map((Array.isArray(snapshot.staff) ? snapshot.staff : []).map((item: any) => [item.profile?.id, item.profile]));
      const existingIds = new Set(snapshot.inventory.stock_movements.map((item: any) => item.id));
      const additions: any[] = [];
      const batchIds = new Set<string>();
      for (const movement of incoming) {
        const id = typeof movement?.id === 'string' ? movement.id : '';
        const productId = typeof movement?.product_id === 'string' ? movement.product_id : '';
        const branchId = typeof movement?.branch_id === 'string' ? movement.branch_id : '';
        const actorId = typeof movement?.actor_staff_id === 'string' ? movement.actor_staff_id : '';
        const movementType = movement?.movement_type;
        const quantity = Number(movement?.quantity);
        const delta = Number(movement?.quantity_delta);
        if (!id || !productId || !branchId || !actorId || !['RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT'].includes(movementType) ||
            !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(delta) || delta === 0) {
          return error('A stock movement is missing valid identity, type, branch, product or quantity data.', 400);
        }
        if (!branches.has(branchId) || !products.has(productId)) return error('A stock movement references a product or branch outside this business.', 403);
        const profile: any = staff.get(actorId);
        if (!profile || profile.status !== 'active') return error('A stock movement references an inactive or unknown staff account.', 403);
        if (profile.branchId && profile.branchId !== branchId) return error('A staff account cannot sync stock movements for another assigned branch.', 403);
        if (movementType === 'ADJUSTMENT' && !['Business Owner', 'Manager'].includes(profile.role)) {
          return error('Only a Business Owner or Manager may sync stock adjustments.', 403);
        }
        if (movement.warehouse_id && warehouses.get(movement.warehouse_id) !== branchId) {
          return error('A stock movement references a warehouse outside its branch.', 403);
        }
        if (!existingIds.has(id) && !batchIds.has(id)) {
          additions.push(movement);
          batchIds.add(id);
        }
      }
      if (additions.length) snapshot.inventory.stock_movements.push(...additions);
      const updatedAt = new Date().toISOString();
      const saved = { ...current, snapshot, updatedAt, updatedByDeviceId: device.deviceId, revision: Number(current.revision || 0) + 1 };
      const [ok] = await db.update(targetTable, [{ id: current.id, record: saved }]);
      if (!ok) return error('Staff stock movements could not be saved to the cloud. Please retry.', 500);
      return json({ ok: true, updatedAt, revision: saved.revision, received: incoming.length, added: additions.length });
    },
  ],
  'POST /api/desktop/sync/transactions': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const actor = await verifiedDesktopActor(ctx, device);
      if (!actor) return error('The signed-in staff account could not be verified. Sign in again and synchronise.', 403);
      if (actor.profile.role === 'Business Owner') return error('The Business Owner account uses full business snapshot synchronisation.', 403);

      const body = (ctx.body || {}) as Record<string, any>;
      const financial = body.financial;
      if (!financial || typeof financial !== 'object' || Array.isArray(financial)) {
        return error('A financial transaction batch is required.', 400);
      }
      if (new TextEncoder().encode(JSON.stringify(body)).length > 5000000) {
        return error('The POS transaction batch exceeds the 5 MB limit.', 413);
      }

      const tableColumns: Record<string, string[]> = {
        pos_shifts: ['id', 'branch_id', 'cashier_staff_id', 'opening_float', 'closing_cash', 'closing_mpesa', 'status', 'opened_at', 'closed_at'],
        sales: ['id', 'receipt_number', 'branch_id', 'shift_id', 'cashier_staff_id', 'total', 'payment_method', 'payment_reference', 'status', 'created_at', 'customer_id', 'customer_name', 'customer_phone', 'cash_amount', 'mpesa_amount', 'subtotal', 'discount_amount', 'discount_type', 'discount_value', 'discount_approved_by', 'discount_approved_at'],
        sale_items: ['id', 'sale_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'unit_cost', 'line_total', 'discount_amount', 'net_line_total'],
        sale_returns: ['id', 'return_number', 'sale_id', 'branch_id', 'shift_id', 'actor_staff_id', 'approved_by', 'reason', 'refund_total', 'cash_amount', 'mpesa_amount', 'mpesa_reference', 'status', 'created_at'],
        sale_return_items: ['id', 'return_id', 'sale_item_id', 'product_id', 'product_name', 'quantity', 'unit_refund', 'refund_amount', 'restock_quantity'],
        cashbook_entries: ['id', 'business_id', 'entry_type', 'direction', 'amount', 'payment_method', 'reference', 'description', 'source_type', 'source_id', 'actor_staff_id', 'created_at'],
        accounting_cashbook: ['id', 'business_id', 'direction', 'description', 'amount', 'payment_method', 'account_code', 'reference', 'entry_date', 'actor_staff_id', 'branch_id', 'created_at'],
        journal_entries: ['id', 'business_id', 'source_type', 'source_id', 'source_key', 'reference', 'description', 'entry_date', 'status', 'total_debit', 'total_credit', 'actor_staff_id', 'branch_id', 'created_at'],
        journal_lines: ['id', 'journal_id', 'account_code', 'account_name', 'debit', 'credit']
      };
      const tableOrder = Object.keys(tableColumns);
      for (const name of Object.keys(financial)) {
        if (!tableColumns[name]) return error('The transaction batch contains an unsupported table.', 400);
      }
      for (const name of tableOrder) {
        if (financial[name] !== undefined && (!Array.isArray(financial[name]) || financial[name].length > 10000)) {
          return error('The ' + name + ' batch must be an array of up to 10,000 records.', 400);
        }
      }

      const targetTable = table(device.userId, 'desktop_sync_state');
      const saved = await db.list(targetTable, { limit: 1 });
      const current = saved.items[0];
      if (!current?.snapshot?.business?.id || !Array.isArray(current.snapshot.branches) ||
          !Array.isArray(current.snapshot.staff) || !current.snapshot.inventory?.products) {
        return error('The owner computer must publish the business, staff, branches and product catalogue before POS transactions can sync.', 409);
      }

      const snapshot = JSON.parse(JSON.stringify(current.snapshot));
      const businessId = snapshot.business.id;
      const branchIds = new Set(snapshot.branches.map((item: any) => item.id));
      const productIds = new Set((snapshot.inventory.products || []).map((item: any) => item.id));
      const staffById = new Map((snapshot.staff || []).map((item: any) => [item.profile?.id, item.profile]));
      const activeStaff = (id: any) => {
        const profile: any = staffById.get(id);
        return profile && profile.status === 'active' ? profile : null;
      };
      const branchAllowed = (profile: any, branchId: string) =>
        Boolean(profile && branchIds.has(branchId) && (!profile.branchId || profile.branchId === branchId));
      const finite = (value: any) => typeof value === 'number' && Number.isFinite(value);
      const positive = (value: any) => finite(value) && value > 0;
      const nonNegative = (value: any) => finite(value) && value >= 0;
      const cleanText = (value: any, max = 240) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
      const existingFinancial = snapshot.financial && typeof snapshot.financial === 'object' ? snapshot.financial : {};
      const merged: Record<string, any[]> = {};
      for (const name of tableOrder) merged[name] = Array.isArray(existingFinancial[name]) ? existingFinancial[name].slice() : [];

      const batch: Record<string, any[]> = {};
      for (const name of tableOrder) {
        const rows = Array.isArray(financial[name]) ? financial[name] : [];
        const seen = new Set<string>();
        batch[name] = [];
        for (const row of rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) return error('A ' + name + ' record is invalid.', 400);
          const keys = Object.keys(row);
          if (keys.some((key: string) => !tableColumns[name].includes(key))) return error('A ' + name + ' record contains unsupported fields.', 400);
          if (!cleanText(row.id, 120) || seen.has(row.id)) return error('Every ' + name + ' record must have a unique ID in this batch.', 400);
          seen.add(row.id);
          batch[name].push(row);
        }
      }

      const currentById: Record<string, Map<string, any>> = {};
      for (const name of tableOrder) currentById[name] = new Map(merged[name].map((row: any) => [row.id, row]));
      const shifts = new Map(currentById.pos_shifts);
      for (const row of batch.pos_shifts) {
        const cashier = activeStaff(row.cashier_staff_id);
        if (!branchAllowed(cashier, row.branch_id) || !cleanText(row.opened_at, 80) ||
            !nonNegative(row.opening_float) || !['OPEN', 'CLOSED'].includes(row.status)) {
          return error('A shift references an invalid branch, cashier, opening float or status.', 400);
        }
        if (row.status === 'CLOSED' && (!nonNegative(row.closing_cash) || !nonNegative(row.closing_mpesa) || !cleanText(row.closed_at, 80))) {
          return error('A closed shift must include valid closing cash, M-Pesa and closing time.', 400);
        }
        const prior: any = shifts.get(row.id);
        if (prior && (prior.branch_id !== row.branch_id || prior.cashier_staff_id !== row.cashier_staff_id)) {
          return error('A shift ID cannot be reassigned to another cashier or branch.', 409);
        }
        if (prior?.status === 'CLOSED' && row.status !== 'CLOSED') return error('A closed shift cannot be reopened through synchronisation.', 409);
        if (!prior) shifts.set(row.id, row);
        else if (row.status === 'CLOSED') shifts.set(row.id, { ...prior, status: 'CLOSED', closing_cash: row.closing_cash, closing_mpesa: row.closing_mpesa, closed_at: row.closed_at });
      }

      const sales = new Map(currentById.sales);
      const receiptNumbers = new Set(merged.sales.map((row: any) => row.receipt_number));
      for (const row of batch.sales) {
        const cashier = activeStaff(row.cashier_staff_id);
        const shift: any = shifts.get(row.shift_id);
        if (!cleanText(row.receipt_number, 80) || !branchAllowed(cashier, row.branch_id) ||
            !shift || shift.branch_id !== row.branch_id || shift.cashier_staff_id !== row.cashier_staff_id ||
            !positive(row.total) || !['CASH', 'MPESA', 'SPLIT'].includes(row.payment_method) ||
            !nonNegative(row.cash_amount) || !nonNegative(row.mpesa_amount) ||
            Math.abs(row.cash_amount + row.mpesa_amount - row.total) > 0.02 ||
            !['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED'].includes(row.status)) {
          return error('A sale has invalid cashier, shift, branch, payment or total relationships.', 400);
        }
        if (row.customer_id && !(snapshot.customers || []).some((item: any) => item.id === row.customer_id)) {
          return error('A sale references a customer outside this business.', 403);
        }
        if (Number(row.discount_amount || 0) > 0) {
          const approver = activeStaff(row.discount_approved_by);
          if (!approver || !['Business Owner', 'Manager'].includes(approver.role) ||
              (approver.role !== 'Business Owner' && approver.branchId && approver.branchId !== row.branch_id)) {
            return error('A discounted sale must reference an authorised Business Owner or Manager.', 403);
          }
        }
        const prior: any = sales.get(row.id);
        if (prior && prior.receipt_number !== row.receipt_number) return error('A sale ID cannot be reassigned to another receipt.', 409);
        if (!prior && receiptNumbers.has(row.receipt_number)) return error('A receipt number is already recorded under another sale ID.', 409);
        if (!prior) {
          sales.set(row.id, row);
          receiptNumbers.add(row.receipt_number);
        } else if (row.status === 'RETURNED' || (row.status === 'PARTIALLY_RETURNED' && prior.status === 'COMPLETED')) {
          sales.set(row.id, { ...prior, status: row.status });
        }
      }

      const saleItems = new Map(currentById.sale_items);
      const saleItemIds = new Set(saleItems.keys());
      for (const row of batch.sale_items) {
        const sale: any = sales.get(row.sale_id);
        if (!sale || !productIds.has(row.product_id) || !cleanText(row.product_name, 160) ||
            !positive(row.quantity) || !nonNegative(row.unit_price) || !nonNegative(row.unit_cost) ||
            !nonNegative(row.line_total) || !nonNegative(row.discount_amount || 0) || !nonNegative(row.net_line_total ?? row.line_total)) {
          return error('A sale item references an invalid sale or product, or contains invalid quantities or amounts.', 400);
        }
        const prior = saleItems.get(row.id);
        if (prior && (prior.sale_id !== row.sale_id || prior.product_id !== row.product_id)) return error('A sale item ID cannot be reassigned.', 409);
        if (!prior) { saleItems.set(row.id, row); saleItemIds.add(row.id); }
      }

      const returns = new Map(currentById.sale_returns);
      const returnNumbers = new Set(merged.sale_returns.map((row: any) => row.return_number));
      for (const row of batch.sale_returns) {
        const sale: any = sales.get(row.sale_id);
        const actor = activeStaff(row.actor_staff_id);
        const approver = activeStaff(row.approved_by);
        const shift: any = shifts.get(row.shift_id);
        if (!sale || sale.branch_id !== row.branch_id || !branchAllowed(actor, row.branch_id) ||
            !approver || !['Business Owner', 'Manager'].includes(approver.role) ||
            (approver.role !== 'Business Owner' && approver.branchId && approver.branchId !== row.branch_id) ||
            !shift || shift.branch_id !== row.branch_id || !cleanText(row.return_number, 80) ||
            !cleanText(row.reason, 500) || !positive(row.refund_total) ||
            !nonNegative(row.cash_amount) || !nonNegative(row.mpesa_amount) ||
            Math.abs(row.cash_amount + row.mpesa_amount - row.refund_total) > 0.02 ||
            !['COMPLETED'].includes(row.status)) {
          return error('A return has invalid sale, branch, staff approval, shift or refund relationships.', 400);
        }
        const prior: any = returns.get(row.id);
        if (prior && prior.return_number !== row.return_number) return error('A return ID cannot be reassigned to another return number.', 409);
        if (!prior && returnNumbers.has(row.return_number)) return error('A return number is already recorded under another return ID.', 409);
        if (!prior) { returns.set(row.id, row); returnNumbers.add(row.return_number); }
      }

      const returnItems = new Map(currentById.sale_return_items);
      for (const row of batch.sale_return_items) {
        const parent: any = returns.get(row.return_id);
        const sold: any = saleItems.get(row.sale_item_id);
        if (!parent || !sold || sold.sale_id !== parent.sale_id || sold.product_id !== row.product_id ||
            !productIds.has(row.product_id) || !cleanText(row.product_name, 160) ||
            !positive(row.quantity) || !nonNegative(row.unit_refund) || !nonNegative(row.refund_amount) ||
            !nonNegative(row.restock_quantity) || row.restock_quantity > row.quantity + 0.000001) {
          return error('A return item does not match its original sale item or contains invalid quantities or amounts.', 400);
        }
        const prior = returnItems.get(row.id);
        if (prior && (prior.return_id !== row.return_id || prior.sale_item_id !== row.sale_item_id)) return error('A return item ID cannot be reassigned.', 409);
        if (!prior) returnItems.set(row.id, row);
      }

      const cashbook = new Map(currentById.cashbook_entries);
      for (const row of batch.cashbook_entries) {
        const source = row.source_type === 'POS_SALE' ? sales.get(row.source_id) : row.source_type === 'POS_RETURN' ? returns.get(row.source_id) : null;
        const actor = activeStaff(row.actor_staff_id);
        if (row.business_id !== businessId || !source || !actor || !['POS_SALE', 'POS_RETURN'].includes(row.entry_type) ||
            !['POS_SALE', 'POS_RETURN'].includes(row.source_type) ||
            !['IN', 'OUT'].includes(row.direction) || !positive(row.amount) ||
            !['CASH', 'MPESA'].includes(row.payment_method) ||
            (row.source_type === 'POS_SALE' && (row.entry_type !== 'POS_SALE' || row.direction !== 'IN')) ||
            (row.source_type === 'POS_RETURN' && (row.entry_type !== 'POS_RETURN' || row.direction !== 'OUT'))) {
          return error('A cashbook entry must be a valid POS sale or refund linked to this business.', 400);
        }
        const prior = cashbook.get(row.id);
        if (!prior) cashbook.set(row.id, row);
        else if (prior.source_id !== row.source_id || prior.source_type !== row.source_type) return error('A cashbook entry ID cannot be reassigned.', 409);
      }

      const manualCashbook = new Map(currentById.accounting_cashbook);
      for (const row of batch.accounting_cashbook) {
        const actor = activeStaff(row.actor_staff_id);
        const cashCode = row.payment_method === 'CASH' ? '1000' : row.payment_method === 'MPESA' ? '1010' : row.payment_method === 'BANK' ? '1020' : '';
        if (row.business_id !== businessId || !actor || !['Manager', 'Accountant'].includes(actor.role) || actor.branchId !== row.branch_id ||
            !branchAllowed(actor, row.branch_id) || !cleanText(row.branch_id, 120) ||
            !['RECEIPT', 'PAYMENT'].includes(row.direction) || !cleanText(row.description, 180) ||
            !positive(row.amount) || !cashCode || !cleanText(row.account_code, 40) || row.account_code === cashCode ||
            !cleanText(row.entry_date, 40) || !cleanText(row.actor_staff_id, 120)) {
          return error('A manual cashbook entry must have a valid active staff member, assigned branch, account, date and positive amount.', 400);
        }
        const prior = manualCashbook.get(row.id);
        if (prior && (prior.branch_id !== row.branch_id || prior.actor_staff_id !== row.actor_staff_id)) {
          return error('A cashbook entry cannot be reassigned to another branch or staff member.', 409);
        }
        if (!prior) manualCashbook.set(row.id, row);
      }

      const journals = new Map(currentById.journal_entries);
      for (const row of batch.journal_entries) {
        const source = row.source_type === 'SALE' ? sales.get(row.source_id) :
          row.source_type === 'RETURN' ? returns.get(row.source_id) :
          row.source_type === 'CASHBOOK' ? manualCashbook.get(row.source_id) : null;
        const actor = activeStaff(row.actor_staff_id);
        const isCashbook = row.source_type === 'CASHBOOK';
        const effectiveBranchId = isCashbook ? row.branch_id : source?.branch_id;
        const branchMatches = source && (isCashbook ? source.branch_id === row.branch_id : (!row.branch_id || row.branch_id === source.branch_id));
        if (row.business_id !== businessId || !source || !actor || !branchMatches ||
            !['SALE', 'RETURN', 'CASHBOOK'].includes(row.source_type) || !cleanText(effectiveBranchId, 120) ||
            !cleanText(row.source_key, 160) || (isCashbook && row.source_key !== 'CASHBOOK:' + row.source_id) ||
            !cleanText(row.reference, 120) || !cleanText(row.description, 500) ||
            !cleanText(row.entry_date, 40) || !positive(row.total_debit) ||
            !positive(row.total_credit) || Math.abs(row.total_debit - row.total_credit) > 0.02 ||
            row.status !== 'POSTED') {
          return error('A journal entry must be a balanced posted POS or authorised branch cashbook journal for this business.', 400);
        }
        if (!branchAllowed(actor, effectiveBranchId) || (isCashbook && (!['Manager', 'Accountant'].includes(actor.role) || actor.branchId !== effectiveBranchId))) {
          return error('The journal actor is not authorised for this branch.', 403);
        }
        const prior = journals.get(row.id);
        if (prior && (prior.source_key !== row.source_key || (prior.branch_id && prior.branch_id !== effectiveBranchId))) return error('A journal entry ID cannot be reassigned.', 409);
        if (!prior && merged.journal_entries.some((item: any) => item.source_key === row.source_key)) {
          return error('This journal source has already been posted.', 409);
        }
        if (!prior) journals.set(row.id, { ...row, branch_id: effectiveBranchId });
      }

      const journalLines = new Map(currentById.journal_lines);
      for (const row of batch.journal_lines) {
        const journal: any = journals.get(row.journal_id);
        if (!journal || !cleanText(row.account_code, 40) || !cleanText(row.account_name, 160) ||
            !nonNegative(row.debit) || !nonNegative(row.credit) ||
            (row.debit > 0 && row.credit > 0) || (row.debit === 0 && row.credit === 0)) {
          return error('A journal line must belong to an authorised POS or cashbook journal and contain a valid debit or credit.', 400);
        }
        const prior = journalLines.get(row.id);
        if (prior && prior.journal_id !== row.journal_id) return error('A journal line ID cannot be reassigned.', 409);
        if (!prior) journalLines.set(row.id, row);
      }
      for (const row of batch.journal_entries.filter((item: any) => item.source_type === 'CASHBOOK')) {
        const linked = manualCashbook.get(row.source_id);
        const lines = Array.from(journalLines.values()).filter((line: any) => line.journal_id === row.id);
        const cashCode = linked?.payment_method === 'CASH' ? '1000' : linked?.payment_method === 'MPESA' ? '1010' : '1020';
        const expectedDebitCode = linked?.direction === 'RECEIPT' ? cashCode : linked?.account_code;
        const expectedCreditCode = linked?.direction === 'RECEIPT' ? linked?.account_code : cashCode;
        const debit = Math.round(lines.reduce((sum: number, line: any) => sum + Number(line.debit || 0), 0) * 100) / 100;
        const credit = Math.round(lines.reduce((sum: number, line: any) => sum + Number(line.credit || 0), 0) * 100) / 100;
        const debitLine = lines.find((line: any) => Number(line.debit || 0) > 0);
        const creditLine = lines.find((line: any) => Number(line.credit || 0) > 0);
        if (!linked || lines.length !== 2 || Math.abs(debit - Number(linked.amount)) > 0.02 ||
            Math.abs(credit - Number(linked.amount)) > 0.02 || Math.abs(debit - credit) > 0.02 ||
            debitLine?.account_code !== expectedDebitCode || creditLine?.account_code !== expectedCreditCode) {
          return error('A manual cashbook journal must contain the two authorised accounts and balanced lines matching its cashbook amount.', 400);
        }
      }

      for (const name of tableOrder) {
        const byId = new Map(merged[name].map((row: any) => [row.id, row]));
        for (const row of batch[name]) {
          const prior: any = byId.get(row.id);
          if (!prior) byId.set(row.id, row);
          else if (name === 'pos_shifts' && row.status === 'CLOSED') {
            byId.set(row.id, { ...prior, status: 'CLOSED', closing_cash: row.closing_cash, closing_mpesa: row.closing_mpesa, closed_at: row.closed_at });
          } else if (name === 'sales' && (row.status === 'RETURNED' || (row.status === 'PARTIALLY_RETURNED' && prior.status === 'COMPLETED'))) {
            byId.set(row.id, { ...prior, status: row.status });
          }
        }
        merged[name] = Array.from(byId.values());
      }

      snapshot.financial = merged;
      const updatedAt = new Date().toISOString();
      const record = { ...current, snapshot, updatedAt, updatedByDeviceId: device.deviceId, revision: Number(current.revision || 0) + 1 };
      const [ok] = await db.update(targetTable, [{ id: current.id, record }]);
      if (!ok) return error('POS transaction records could not be saved to the cloud. Please retry.', 500);
      return json({
        ok: true, updatedAt, revision: record.revision,
        received: tableOrder.reduce((sum, name) => sum + batch[name].length, 0),
        added: tableOrder.reduce((sum, name) => sum + batch[name].filter((row: any) => !currentById[name].has(row.id)).length, 0)
      });
    },
  ],

  'POST /api/desktop/sync/push': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const actor = await verifiedDesktopActor(ctx, device);
      if (!actor || actor.profile.role !== 'Business Owner') return error('Only a verified, active Business Owner account can publish business and staff account changes.', 403);
      const body = (ctx.body || {}) as Record<string, any>;
      const snapshot = body.snapshot;
      if (!snapshot || !snapshot.business || !Array.isArray(snapshot.branches) || !Array.isArray(snapshot.staff)) {
        return error('The synchronisation snapshot is incomplete.', 400);
      }
      if (snapshot.branches.length > 100 || snapshot.staff.length > 200) return error('The current synchronisation limit is 100 branches and 200 staff accounts.', 413);
      if (snapshot.staff.some((staff: any) => !staff.profile?.id || !staff.account?.username || typeof staff.account?.passwordHash !== 'string' || !staff.account.passwordHash.startsWith('$argon2'))) {
        return error('Staff synchronisation requires valid account records with Argon2 password hashes. Plaintext passwords are never accepted.', 400);
      }
      const size = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (size > 5000000) return error('The business snapshot exceeds the 5 MB synchronisation limit. Reduce oversized attachments and try again.', 413);
      const targetTable = table(device.userId, 'desktop_sync_state');
      const existing = await db.list(targetTable, { limit: 1 });
      const latestSnapshot = existing.items[0]?.snapshot;
      if (latestSnapshot && Array.isArray(latestSnapshot.staff)) {
        for (const staff of snapshot.staff) {
          const latest = latestSnapshot.staff.find((item: any) => item.profile?.id === staff.profile?.id);
          if (latest?.account?.passwordHash && latest.account.passwordHash !== staff.account.passwordHash) {
            staff.account.passwordHash = latest.account.passwordHash;
            staff.account.mustChangePassword = Boolean(latest.account.mustChangePassword);
          }
        }
      }
      const saved = {
        snapshot,
        updatedAt: new Date().toISOString(),
        updatedByDeviceId: device.deviceId,
        revision: Number(existing.items[0]?.revision || 0) + 1,
      };
      if (existing.items[0]) {
        const [ok] = await db.update(targetTable, [{ id: existing.items[0].id, record: { ...existing.items[0], ...saved } }]);
        if (!ok) return error('The cloud snapshot could not be updated. Please retry.', 500);
      } else {
        const [id] = await db.add(targetTable, [saved]);
        if (!id) return error('The first cloud snapshot could not be saved. Please retry.', 500);
      }
      return json({ ok: true, revision: saved.revision, updatedAt: saved.updatedAt, snapshot: saved.snapshot });
    },
  ],

  'GET /api/discount-managers': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const staff = await getSyncedStaff(userId);
      if (!staff.length) return error('No synced desktop staff accounts were found. Sync the authorised Windows computer first.', 409);
      const configured = await listOwned(userId, 'discount_manager_credentials');
      const items = staff.filter((item: any) => ['Manager', 'Business Owner'].includes(item.profile?.role) &&
        item.profile?.status !== 'inactive' && item.account?.status !== 'inactive' && item.account?.mustChangePassword !== true)
        .map((item: any) => {
          const saved = configured.find((entry: any) => entry.managerStaffId === item.profile.id && entry.active !== false);
          return { id: item.profile.id, name: item.profile.displayName || item.account.username, role: item.profile.role,
            configured: Boolean(saved), discountLimitPercent: saved ? Number(saved.discountLimitPercent) : 0 };
        });
      return json({ items });
    },
  ],
  'PUT /api/discount-managers/:id': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, unknown>;
      const pin = textField(body.pin, 64);
      const limit = Number(body.discountLimitPercent);
      if (pin.length < 8) return error('Manager approval PIN must contain at least 8 characters.', 400);
      if (!Number.isFinite(limit) || limit < 0 || limit > 100) return error('Set a discount limit between 0 and 100 percent.', 400);
      const staff = await getSyncedStaff(userId);
      const manager = staff.find((item: any) => item.profile?.id === ctx.params.id &&
        ['Manager', 'Business Owner'].includes(item.profile?.role) && item.profile?.status !== 'inactive' &&
        item.account?.status !== 'inactive' && item.account?.mustChangePassword !== true);
      if (!manager) return error('The selected manager is not an active, fully activated synced staff account.', 404);
      const records = await listOwned(userId, 'discount_manager_credentials');
      const current = records.find((item: any) => item.managerStaffId === ctx.params.id);
      const salt = randomHex(16), iterations = 310000;
      const pinHash = await discountPinHash(pin, salt, iterations);
      const now = new Date().toISOString();
      const record = { managerStaffId: ctx.params.id, managerName: textField(manager.profile.displayName || manager.account.username, 120),
        role: manager.profile.role, discountLimitPercent: Math.round(limit * 100) / 100, salt, pinHash, iterations, active: true, updatedAt: now };
      if (current) {
        const [ok] = await db.update(table(userId, 'discount_manager_credentials'), [{ id: current.id, record: { ...current, ...record } }]);
        if (!ok) return error('Manager discount settings could not be saved.', 500);
      } else await addOwned(userId, 'discount_manager_credentials', record);
      await addOwned(userId, 'audit_logs', { action: 'DISCOUNT_MANAGER_CONFIGURED', entityType: 'STAFF_ACCOUNT',
        entityId: ctx.params.id, managerName: record.managerName, discountLimitPercent: record.discountLimitPercent, createdAt: now });
      return json({ manager: { id: ctx.params.id, name: record.managerName, role: record.role, configured: true, discountLimitPercent: record.discountLimitPercent } });
    },
  ],

  'GET /api/health': [
    async () => json({ ok: true, service: 'hardware-retail-foundation' }),
  ],

  'GET /api/business': [
    requireAuth(),
    async ctx => {
      const items = await listOwned(ctx.user!.userId, 'businesses');
      return json({ business: items[0] || null });
    },
  ],
  'POST /api/business': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 160);
      if (!name) return error('Business name is required.', 400);
      const userId = ctx.user!.userId;
      const existing = await listOwned(userId, 'businesses');
      const record = {
        name,
        tradingName: textField(body.tradingName),
        kraPin: textField(body.kraPin, 24),
        phone: textField(body.phone, 40),
        email: textField(body.email, 160),
        address: textField(body.address, 240),        county: textField(body.county, 100),
        town: textField(body.town, 100),
        currency: textField(body.currency, 8) || 'KES',
        timezone: textField(body.timezone, 80) || 'Africa/Nairobi',
        taxStatus: textField(body.taxStatus, 80) || 'Not yet configured',
        financialYearStart: textField(body.financialYearStart, 10) || '01-01',
      };
      if (existing.length) {
        const id = existing[0].id;
        const [ok] = await db.update(table(userId, 'businesses'), [
          {
            id,
            record: {
              ...existing[0],
              ...record,
              updatedAt: new Date().toISOString(),
            },
          },
        ]);
        if (!ok) return error('Business profile could not be updated.', 500);
        return json({ business: { ...existing[0], ...record, id } });
      }
      const saved = await addOwned(userId, 'businesses', record);
      return json({ business: saved }, 201);
    },
  ],
  'GET /api/branches': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'branches') }),
  ],
  'POST /api/branches': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 120);
      const code = textField(body.code, 32).toUpperCase();
      if (!name || !code)
        return error('Branch name and code are required.', 400);
      const userId = ctx.user!.userId;
      const branches = await listOwned(userId, 'branches');
      if (branches.some((b: any) => b.code === code))
        return error('A branch with this code already exists.', 409);
      const saved = await addOwned(userId, 'branches', {
        name,
        code,
        phone: textField(body.phone, 40),
        address: textField(body.address, 240),
        isDefault: Boolean(body.isDefault) || branches.length === 0,
      });
      return json({ branch: saved }, 201);
    },
  ],
  'GET /api/warehouses': [
    requireAuth(),
    async ctx =>
      json({ items: await listOwned(ctx.user!.userId, 'warehouses') }),
  ],
  'POST /api/warehouses': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 120);
      const code = textField(body.code, 32).toUpperCase();
      const branchId = textField(body.branchId, 100);
      if (!name || !code || !branchId)
        return error('Warehouse name, code and branch are required.', 400);
      const userId = ctx.user!.userId;
      const branches = await listOwned(userId, 'branches');
      if (!branches.some((b: any) => b.id === branchId))
        return error('Select a valid branch belonging to this business.', 400);
      const warehouses = await listOwned(userId, 'warehouses');
      if (warehouses.some((w: any) => w.code === code))
        return error('A warehouse with this code already exists.', 409);
      const saved = await addOwned(userId, 'warehouses', {
        name,
        code,
        branchId,
        isDefault: Boolean(body.isDefault) || warehouses.length === 0,
      });
      return json({ warehouse: saved }, 201);
    },
  ],
  'GET /api/team': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'team') }),
  ],
  'POST /api/team': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 120);
      const email = textField(body.email, 160).toLowerCase();
      const role = textField(body.role, 80);
      const branchId = textField(body.branchId, 100);
      const allowedRoles = [
        'Branch Manager',
        'Accountant',
        'Cashier',
        'Salesperson',
        'Storekeeper',
        'Delivery Personnel',
      ];
      if (!name || !email || !allowedRoles.includes(role))
        return error('Provide a name, email and valid staff role.', 400);
      const userId = ctx.user!.userId;
      if (branchId) {
        const branches = await listOwned(userId, 'branches');
        if (!branches.some((b: any) => b.id === branchId))
          return error(
            'Select a valid branch belonging to this business.',
            400
          );
      }
      const saved = await addOwned(userId, 'team', {
        name,
        email,
        role,
        branchId,
        status: 'profile_only',
      });
      return json({ member: saved }, 201);
    },
  ],


  'GET /api/master-catalogue/current': [
    requireAuth(),
    async () => {
      const current = await getCurrentMasterRelease();
      return json({ release: current.release, items: current.items });
    },
  ],
  'GET /api/desktop/master-catalogue/current': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This desktop is not paired or its device access has been revoked.', 401);
      const current = await getCurrentMasterRelease();
      return json({ release: current.release, items: current.items });
    },
  ],
  'GET /api/master-catalogue/admin': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async ctx => {
      await ensureInitialMasterCatalogue(ctx.user!.userId);
      const [current, releases] = await Promise.all([getCurrentMasterRelease(), listMasterReleases()]);
      return json({ release: current.release, items: current.items, releases });
    },
  ],
  'POST /api/master-catalogue/preview': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async ctx => {
      const body = (ctx.body || {}) as { items?: unknown[] };
      const validation = validateMasterCatalogueRows(body.items);
      return json({
        valid: validation.errors.length === 0,
        rowCount: validation.rows.length,
        validCount: Math.max(0, validation.rows.length - validation.errors.length),
        errors: validation.errors,
      });
    },
  ],
  'POST /api/master-catalogue/releases': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async ctx => {
      const body = (ctx.body || {}) as { items?: unknown[] };
      const validation = validateMasterCatalogueRows(body.items);
      if (validation.errors.length) return json({ error: 'Correct the CSV validation errors before publishing.', errors: validation.errors }, 400);
      try {
        const release = await publishMasterCatalogue(validation.rows, ctx.user!.userId);
        return json({ release }, 201);
      } catch (err: any) {
        return error(err?.message || 'The catalogue release could not be published.', 500);
      }
    },
  ],
  'POST /api/master-catalogue/rollback/:id': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async ctx => {
      const releases = await listMasterReleases();
      const target = releases.find((item: any) => item.id === ctx.params.id && item.status === 'PUBLISHED');
      if (!target) return error('The selected catalogue version is unavailable.', 404);
      const saved = await db.list(masterItemsTable(Number(target.version)), { limit: 500 });
      if (!saved.items.length) return error('The selected catalogue version contains no products.', 409);
      const rows = saved.items.map((item: any) => ({
        category: item.category, productFamily: item.productFamily || '', name: item.name,
        specification: item.specification || '', brand: item.brand || '', sku: item.sku,
        barcode: item.barcode || '', stockUnit: item.stockUnit, purchaseUnit: item.purchaseUnit || item.stockUnit,
        conversionFactor: Number(item.conversionFactor || 1), description: item.description || '',
      }));
      try {
        const release = await publishMasterCatalogue(rows, ctx.user!.userId, Number(target.version));
        return json({ release }, 201);
      } catch (err: any) {
        return error(err?.message || 'The catalogue rollback could not be published.', 500);
      }
    },
  ],
  'POST /api/master-catalogue/adopt': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as { productIds?: unknown[] };
      if (!Array.isArray(body.productIds) || body.productIds.length < 1 || body.productIds.length > 500) return error('Select between 1 and 500 master catalogue products.', 400);
      const current = await getCurrentMasterRelease();
      if (!current.release) return error('The central master catalogue has not been published yet.', 404);
      const selectedIds = new Set(body.productIds.filter((id): id is string => typeof id === 'string'));
      const selected = current.items.filter((item: any) => selectedIds.has(item.id));
      if (!selected.length || selected.length !== selectedIds.size) return error('One or more selected master catalogue products are no longer available.', 409);
      const userId = ctx.user!.userId;
      const existing = await db.list(productTable(userId), { limit: 500 });
      const seenSkus = new Set(existing.items.map((item: any) => normalise(item.sku)));
      const seenSpecs = new Set(existing.items.map((item: any) => [item.category, item.name, item.variant, item.brand].map(normalise).join('|')));
      const now = new Date().toISOString();
      const accepted: Record<string, unknown>[] = [];
      let skipped = 0;
      for (const item of selected) {
        const sku = normalise(item.sku);
        const spec = [item.category, item.name, item.specification, item.brand].map(normalise).join('|');
        if ((sku && seenSkus.has(sku)) || seenSpecs.has(spec)) { skipped++; continue; }
        if (sku) seenSkus.add(sku);
        seenSpecs.add(spec);
        accepted.push({
          name: item.name, category: item.category, unit: item.stockUnit, brand: item.brand || '',
          variant: item.specification || '', sku: item.sku, barcode: item.barcode || '',
          purchaseUnit: item.purchaseUnit || item.stockUnit, conversionFactor: Number(item.conversionFactor || 1),
          buyingPrice: 0, sellingPrice: 0, reorderLevel: 0, taxCategory: 'Unconfigured',
          active: true, source: 'master_catalogue', masterProductId: item.id, masterVersion: current.release.version,
          ownerUserId: userId, createdAt: now, updatedAt: now,
        });
      }
      if (!accepted.length) return json({ added: 0, skipped, message: 'All selected products already exist in your business catalogue.' });
      const ids = await db.add(productTable(userId), accepted);
      if (ids.some(id => !id)) {
        await db.delete(productTable(userId), ids.filter((id): id is string => Boolean(id)));
        return error('The selected products could not all be added. No stock or prices were created.', 500);
      }
      return json({ added: ids.length, skipped, masterVersion: current.release.version });
    },
  ],

  'GET /api/products': [
    requireAuth(),
    async ctx => {
      const items = await ensureStarterCatalogue(ctx.user!.userId);
      return json({ items, starterCount: starterCatalogue.length });
    },
  ],
  'POST /api/products': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 160);
      const category = textField(body.category, 100);
      const unit = textField(body.unit, 40);
      if (!name || !category || !unit) return error('Product name, category and stock unit are required.', 400);
      const userId = ctx.user!.userId;
      const items = await db.list(productTable(userId), { limit: 500 });
      const duplicate = items.items.find((p: any) => p.active !== false &&
        normalise(p.name) === normalise(name) &&
        normalise(p.variant) === normalise(body.variant) &&
        normalise(p.brand) === normalise(body.brand));
      if (duplicate) return error('A matching product already exists. Select it from the catalogue instead.', 409);
      const record = {
        name, category, unit, brand: textField(body.brand, 100),
        variant: textField(body.variant, 100), sku: textField(body.sku, 60) || 'HD-' + Date.now().toString(36).toUpperCase(),
        barcode: textField(body.barcode, 80), purchaseUnit: textField(body.purchaseUnit, 40) || unit,
        conversionFactor: Math.max(0.000001, Number(body.conversionFactor) || 1),
        buyingPrice: Math.max(0, Number(body.buyingPrice) || 0),
        sellingPrice: Math.max(0, Number(body.sellingPrice) || 0),
        reorderLevel: Math.max(0, Number(body.reorderLevel) || 0),
        taxCategory: textField(body.taxCategory, 60) || 'Unconfigured',
        active: true, source: 'business_custom',
      };
      const saved = await addOwned(userId, 'products', record);
      return json({ product: saved }, 201);
    },
  ],

  'POST /api/products/import': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as { items?: unknown[] };
      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 500)
        return error('Upload a CSV containing between 1 and 500 product rows.', 400);
      const userId = ctx.user!.userId;
      const existing = await db.list(productTable(userId), { limit: 500 });
      const seen = new Set(existing.items.map((p: any) =>
        [normalise(p.name), normalise(p.brand), normalise(p.variant)].join('|')
      ));
      const now = new Date().toISOString();
      const accepted: Record<string, unknown>[] = [];
      let skipped = 0;
      for (const raw of body.items) {
        const item = (raw || {}) as Record<string, unknown>;
        const name = textField(item.name, 160);
        const category = textField(item.category, 100);        const unit = textField(item.unit, 40);
        if (!name || !category || !unit) { skipped++; continue; }
        const brand = textField(item.brand, 100);
        const variant = textField(item.variant, 100);
        const key = [normalise(name), normalise(brand), normalise(variant)].join('|');
        if (seen.has(key)) { skipped++; continue; }
        seen.add(key);
        accepted.push({
          name, category, unit, brand, variant,
          sku: textField(item.sku, 60) || 'HD-IMP-' + (accepted.length + 1).toString().padStart(4, '0'),
          barcode: textField(item.barcode, 80),
          purchaseUnit: textField(item.purchaseUnit, 40) || unit,
          conversionFactor: Math.max(0.000001, Number(item.conversionFactor) || 1),
          buyingPrice: Math.max(0, Number(item.buyingPrice) || 0),
          sellingPrice: Math.max(0, Number(item.sellingPrice) || 0),
          reorderLevel: Math.max(0, Number(item.reorderLevel) || 0),
          taxCategory: textField(item.taxCategory, 60) || 'Unconfigured',
          active: true, source: 'csv_import', ownerUserId: userId,
          createdAt: now, updatedAt: now,
        });
      }
      if (accepted.length) {
        const ids = await db.add(productTable(userId), accepted);
        if (ids.some(id => !id)) throw new Error('Some imported products could not be saved. Review the catalogue before retrying.');
      }
      return json({ imported: accepted.length, skipped, totalRows: body.items.length });
    },
  ],

  'PUT /api/products/:id': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const items = await db.list(productTable(userId), { limit: 500 });
      const current = items.items.find((p: any) => p.id === ctx.params.id);
      if (!current) return error('Product not found in this business catalogue.', 404);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 160);
      const category = textField(body.category, 100);
      const unit = textField(body.unit, 40);
      if (!name || !category || !unit) return error('Product name, category and stock unit are required.', 400);
      const duplicate = items.items.find((p: any) => p.id !== current.id &&
        normalise(p.name) === normalise(name) &&
        normalise(p.variant) === normalise(body.variant) &&
        normalise(p.brand) === normalise(body.brand));
      if (duplicate) return error('Another catalogue item already has the same name, brand and variation.', 409);
      const record = {
        ...current, name, category, unit,
        brand: textField(body.brand, 100), variant: textField(body.variant, 100),
        sku: textField(body.sku, 60), barcode: textField(body.barcode, 80),
        purchaseUnit: textField(body.purchaseUnit, 40) || unit,
        conversionFactor: Math.max(0.000001, Number(body.conversionFactor) || 1),
        buyingPrice: Math.max(0, Number(body.buyingPrice) || 0),
        sellingPrice: Math.max(0, Number(body.sellingPrice) || 0),
        reorderLevel: Math.max(0, Number(body.reorderLevel) || 0),
        taxCategory: textField(body.taxCategory, 60) || 'Unconfigured',
        updatedAt: new Date().toISOString(),
      };
      const [ok] = await db.update(productTable(userId), [{ id: current.id, record }]);
      if (!ok) return error('Product could not be updated.', 500);
      return json({ product: { ...record, id: current.id } });
    },
  ],
  'GET /api/stock': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'stock_movements') }),
  ],
  'POST /api/stock/receive': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const userId = ctx.user!.userId;
      const productId = textField(body.productId, 120);
      const branchId = textField(body.branchId, 120);
      const warehouseId = textField(body.warehouseId, 120);
      const quantity = Number(body.quantity);
      const unitCost = Number(body.unitCost);
      if (!productId || !branchId || !warehouseId || !Number.isFinite(quantity) || quantity <= 0 ||
          !Number.isFinite(unitCost) || unitCost < 0) {
        return error('Select a product, branch and warehouse, then enter a valid quantity and unit cost.', 400);
      }
      const products = await db.list(productTable(userId), { limit: 500 });
      if (!products.items.some((p: any) => p.id === productId && p.active !== false))
        return error('Select an active product from this business catalogue.', 400);
      const branches = await listOwned(userId, 'branches');
      if (!branches.some((b: any) => b.id === branchId)) return error('Select a valid business branch.', 400);
      const warehouses = await listOwned(userId, 'warehouses');
      if (!warehouses.some((w: any) => w.id === warehouseId && w.branchId === branchId))
        return error('The selected warehouse does not belong to the selected branch.', 400);
      const saved = await addOwned(userId, 'stock_movements', {
        type: 'RECEIPT', productId, branchId, warehouseId,
        quantity, unitCost, totalCost: quantity * unitCost,
        reference: textField(body.reference, 100),
        note: textField(body.note, 300),
      });
      await postJournal(userId, { sourceType: 'STOCK_RECEIPT', sourceId: saved.id, reference: textField(body.reference, 100) || saved.id, description: 'Manual stock receipt: ' + (textField(body.note, 180) || productId), lines: [{ accountCode: '1200', debit: quantity * unitCost }, { accountCode: '3100', credit: quantity * unitCost }] });
      return json({ movement: saved }, 201);
    },
  ],


  'GET /api/pos/stock': [
    requireAuth(),
    async ctx => {
      const items = await listOwned(ctx.user!.userId, 'stock_movements');
      return json({ items });
    },
  ],
  'GET /api/sales': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'sales') }),
  ],
  'POST /api/sales': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, any>;
      const branchId = textField(body.branchId, 120);
      const warehouseId = textField(body.warehouseId, 120);
      if (!branchId || !warehouseId || !Array.isArray(body.items) || !body.items.length || body.items.length > 100)
        return error('Select a branch and warehouse and add at least one product.', 400);
      const branches = await listOwned(userId, 'branches');
      if (!branches.some((b: any) => b.id === branchId)) return error('Invalid branch.', 400);
      const warehouses = await listOwned(userId, 'warehouses');
      if (!warehouses.some((w: any) => w.id === warehouseId && w.branchId === branchId)) return error('The warehouse does not belong to the selected branch.', 400);
      const shifts = await listOwned(userId, 'pos_shifts');
      const shift = shifts.find((s: any) => s.id === textField(body.shiftId, 120) && s.status === 'OPEN' && s.branchId === branchId);
      if (!shift) return error('Open a cashier shift for this branch before processing a sale.', 409);
      const products = await db.list(productTable(userId), { limit: 500 });
      const movements = await listOwned(userId, 'stock_movements');
      const saleItems: any[] = [];
      for (const raw of body.items) {
        const line = raw as Record<string, any>;
        const product = products.items.find((p: any) => p.id === textField(line.productId, 120) && p.active !== false);
        const quantity = Number(line.quantity);
        const unitPrice = Number(line.unitPrice);
        const discountPercent = Number(line.discountPercent || 0);
        if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)
          return error('A sale line contains an invalid product, quantity or price.', 400);
        const available = movements.filter((m: any) => m.productId === product.id && m.branchId === branchId && m.warehouseId === warehouseId)
          .reduce((sum: number, m: any) => sum + (m.type === 'RECEIPT' || m.type === 'RETURN' ? Number(m.quantity) : m.type === 'SALE' ? -Number(m.quantity) : 0), 0);
        const alreadyInCart = saleItems.filter(x => x.productId === product.id).reduce((sum, x) => sum + x.quantity, 0);
        if (quantity + alreadyInCart > available) return error('Insufficient stock for ' + product.name + '. Available: ' + Math.max(0, available - alreadyInCart) + '.', 409);
        const lineSubtotal = quantity * unitPrice;
        const discountAmount = Math.round(lineSubtotal * discountPercent) / 100;
        const receiptRows = movements.filter((movement: any) => movement.productId === product.id && movement.branchId === branchId && movement.warehouseId === warehouseId && movement.type === 'RECEIPT');
        const receivedQuantity = receiptRows.reduce((sum: number, movement: any) => sum + Number(movement.quantity || 0), 0);
        const receivedValue = receiptRows.reduce((sum: number, movement: any) => sum + Number(movement.totalCost || (Number(movement.quantity || 0) * Number(movement.unitCost || 0))), 0);
        const unitCost = receivedQuantity > 0 ? Math.max(0, receivedValue / receivedQuantity) : 0;
        saleItems.push({ productId: product.id, name: product.name, sku: product.sku || '', unit: product.unit, quantity, unitPrice, unitCost, discountPercent, discountAmount, lineTotal: Math.round((lineSubtotal - discountAmount) * 100) / 100 });
      }
      const total = Math.round(saleItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
      const hasDiscount = saleItems.some(item => item.discountPercent > 0);
      const approval = body.discountApproval || {};
      let verifiedApproval: any = null;
      if (hasDiscount) {
        const managerStaffId = textField(approval.managerStaffId, 120);
        const pin = textField(approval.pin, 64);
        const reason = textField(approval.reason, 300);
        if (!managerStaffId || pin.length < 8 || !reason) return error('Discounted sales require an active manager account, approval PIN and reason.', 400);
        const staff = await getSyncedStaff(userId);
        const manager = staff.find((item: any) => item.profile?.id === managerStaffId &&
          ['Manager', 'Business Owner'].includes(item.profile?.role) && item.profile?.status !== 'inactive' &&
          item.account?.status !== 'inactive' && item.account?.mustChangePassword !== true);
        if (!manager) return error('The selected manager account is inactive or has not completed first-time password setup.', 403);
        const credentials = await listOwned(userId, 'discount_manager_credentials');
        const credential = credentials.find((item: any) => item.managerStaffId === managerStaffId && item.active !== false);
        if (!credential) return error('This manager has not been configured for discount approval by the Business Owner.', 403);
        const attempts = await listOwned(userId, 'discount_approval_attempts');
        const recentFailures = attempts.filter((item: any) => item.managerStaffId === managerStaffId && item.success !== true &&
          Date.now() - new Date(item.createdAt).getTime() < 15 * 60 * 1000);
        if (recentFailures.length >= 5) return error('Too many incorrect approval attempts. Try again after 15 minutes.', 429);
        const candidate = await discountPinHash(pin, credential.salt, Number(credential.iterations || 310000));
        if (!constantTimeEqual(candidate, String(credential.pinHash || ''))) {
          await addOwned(userId, 'discount_approval_attempts', { managerStaffId, success: false, createdAt: new Date().toISOString() });
          return error('Manager approval PIN is incorrect.', 401);
        }
        const limit = Number(credential.discountLimitPercent || 0);
        const requestedMaximum = Math.max(...saleItems.map(item => Number(item.discountPercent || 0)));
        if (requestedMaximum > limit + 0.000001) return error('This manager can approve discounts up to ' + limit + '%. The requested discount is ' + requestedMaximum + '%.', 403);
        verifiedApproval = { managerStaffId, managerName: textField(manager.profile.displayName || manager.account.username, 120),
          managerRole: manager.profile.role, discountLimitPercent: limit, reason, verifiedAt: new Date().toISOString() };
      }
      if (!Array.isArray(body.payments) || !body.payments.length) return error('Enter at least one payment method.', 400);
      const payments = body.payments.map((p: any) => ({ method: textField(p.method, 20).toUpperCase(), amount: Number(p.amount), reference: textField(p.reference, 80) }));
      if (payments.some((p: any) => !['CASH', 'MPESA'].includes(p.method) || !Number.isFinite(p.amount) || p.amount <= 0))
        return error('Payment entries must be positive cash or M-Pesa amounts.', 400);
      const paid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
      if (Math.abs(paid - total) > 0.01) return error('Payment total must equal the sale total. Credit sales are not enabled in this phase.', 400);
      if (payments.some((p: any) => p.method === 'MPESA' && !p.reference)) return error('Enter the M-Pesa transaction code.', 400);
      const now = new Date().toISOString();
      const receiptNumber = 'HD-' + Date.now().toString(36).toUpperCase();
      const sale = await addOwned(userId, 'sales', {
        receiptNumber, branchId, warehouseId, shiftId: shift.id,
        customerName: textField(body.customerName, 120) || 'Walk-in customer',
        customerPhone: textField(body.customerPhone, 40),
        items: saleItems, payments, total, discountApproval: verifiedApproval, status: 'COMPLETED', createdAt: now,
      });
      if (hasDiscount) await addOwned(userId, 'audit_logs', { action: 'SALE_DISCOUNT_APPROVED', entityType: 'SALE', entityId: sale.id, reference: receiptNumber, ...verifiedApproval, discountTotal: saleItems.reduce((sum,item)=>sum+item.discountAmount,0), createdAt: now });
      const stockRows = saleItems.map(item => ({
        type: 'SALE', productId: item.productId, branchId, warehouseId,
        quantity: item.quantity, unitCost: Number(item.unitCost || 0),
        totalCost: Math.round(Number(item.unitCost || 0) * Number(item.quantity || 0) * 100) / 100,
        reference: receiptNumber, note: 'POS sale', ownerUserId: userId, createdAt: now, updatedAt: now,
      }));
      const ids = await db.add(table(userId, 'stock_movements'), stockRows);
      if (ids.some(id => !id)) throw new Error('The sale was saved but stock movements need review. Do not retry this receipt; contact an administrator.');
      const paymentLines = payments.map((payment: any) => ({ accountCode: cashAccountCode(payment.method), debit: payment.amount }));      const costOfGoodsSold = Math.round(saleItems.reduce((sum, item) => sum + Number(item.unitCost || 0) * Number(item.quantity || 0), 0) * 100) / 100;
      const saleJournalLines: Array<{ accountCode: string; debit?: number; credit?: number }> = [
        ...paymentLines,
        { accountCode: '4000', credit: total },
      ];
      if (costOfGoodsSold > 0) {
        saleJournalLines.push({ accountCode: '5000', debit: costOfGoodsSold });
        saleJournalLines.push({ accountCode: '1200', credit: costOfGoodsSold });
      }
      await postJournal(userId, { sourceType: 'SALE', sourceId: sale.id, reference: receiptNumber, description: 'POS sale ' + receiptNumber, lines: saleJournalLines });
      return json({ sale }, 201);
    },
  ],
  'GET /api/pos/shifts': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'pos_shifts') }),
  ],
  'POST /api/pos/shifts/open': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, unknown>;
      const branchId = textField(body.branchId, 120);
      const openingFloat = Number(body.openingFloat);
      const branches = await listOwned(userId, 'branches');
      if (!branches.some((b: any) => b.id === branchId) || !Number.isFinite(openingFloat) || openingFloat < 0)
        return error('Select a valid branch and enter a non-negative opening float.', 400);
      const shifts = await listOwned(userId, 'pos_shifts');
      if (shifts.some((s: any) => s.status === 'OPEN' && s.branchId === branchId))
        return error('There is already an open cashier shift for this branch.', 409);
      const shift = await addOwned(userId, 'pos_shifts', { branchId, openingFloat, closingCash: null, status: 'OPEN', openedAt: new Date().toISOString(), closedAt: null });
      return json({ shift }, 201);
    },
  ],
  'POST /api/pos/shifts/:id/close': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const shifts = await listOwned(userId, 'pos_shifts');
      const shift = shifts.find((s: any) => s.id === ctx.params.id && s.status === 'OPEN');
      if (!shift) return error('Open cashier shift not found.', 404);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const closingCash = Number(body.closingCash);
      const closingMpesa = Number(body.closingMpesa);
      if (!Number.isFinite(closingCash) || closingCash < 0 || !Number.isFinite(closingMpesa) || closingMpesa < 0)
        return error('Enter valid non-negative closing cash and M-Pesa totals.', 400);

      const sales = await listOwned(userId, 'sales');
      const returns = await listOwned(userId, 'sales_returns');
      const shiftSales = sales.filter((sale: any) => sale.shiftId === shift.id && sale.status === 'COMPLETED');
      const shiftRefunds = returns.filter((record: any) => record.status === 'REFUNDED' && record.refundShiftId === shift.id);
      const sumPayments = (rows: any[], method: string) => rows.reduce((sum: number, row: any) =>
        sum + (row.payments || []).filter((payment: any) => payment.method === method)
          .reduce((paymentSum: number, payment: any) => paymentSum + Number(payment.amount || 0), 0), 0);
      const cashRefunds = shiftRefunds.filter((record: any) => record.refundMethod === 'CASH')
        .reduce((sum: number, record: any) => sum + Number(record.refundAmount || 0), 0);
      const mpesaRefunds = shiftRefunds.filter((record: any) => record.refundMethod === 'MPESA')
        .reduce((sum: number, record: any) => sum + Number(record.refundAmount || 0), 0);
      const expectedCash = Math.round((Number(shift.openingFloat || 0) + sumPayments(shiftSales, 'CASH') - cashRefunds) * 100) / 100;
      const expectedMpesa = Math.round((sumPayments(shiftSales, 'MPESA') - mpesaRefunds) * 100) / 100;
      const cashVariance = Math.round((closingCash - expectedCash) * 100) / 100;
      const mpesaVariance = Math.round((closingMpesa - expectedMpesa) * 100) / 100;
      const reconciliation = {
        salesCount: shiftSales.length,
        refundsCount: shiftRefunds.length,
        openingFloat: Number(shift.openingFloat || 0),
        cashSales: Math.round(sumPayments(shiftSales, 'CASH') * 100) / 100,
        mpesaSales: Math.round(sumPayments(shiftSales, 'MPESA') * 100) / 100,
        cashRefunds: Math.round(cashRefunds * 100) / 100,
        mpesaRefunds: Math.round(mpesaRefunds * 100) / 100,
        expectedCash, expectedMpesa, closingCash, closingMpesa,
        cashVariance, mpesaVariance,
        totalVariance: Math.round((cashVariance + mpesaVariance) * 100) / 100,
      };
      const closedAt = new Date().toISOString();
      const updatedShift = {
        ...shift, ...reconciliation, status: 'CLOSED', closedAt,
        reconciliationStatus: Math.abs(cashVariance) < 0.01 && Math.abs(mpesaVariance) < 0.01 ? 'BALANCED' : 'VARIANCE',
      };
      const [ok] = await db.update(table(userId, 'pos_shifts'), [{ id: shift.id, record: updatedShift }]);
      if (!ok) return error('The cashier shift could not be closed.', 500);
      await addOwned(userId, 'audit_logs', {
        action: 'CASHIER_SHIFT_RECONCILED', entityType: 'POS_SHIFT', entityId: shift.id,
        reconciliation, createdAt: closedAt,
      });
      return json({ shift: { ...updatedShift, id: shift.id }, reconciliation });
    },
  ],


  'GET /api/returns': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'sales_returns') }),
  ],
  'POST /api/returns': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, any>;
      const saleId = textField(body.saleId, 120);
      const productId = textField(body.productId, 120);
      const quantity = Number(body.quantity);
      const condition = textField(body.condition, 20).toUpperCase();
      const refundMethod = textField(body.refundMethod, 20).toUpperCase();
      const reason = textField(body.reason, 300);
      if (!saleId || !productId || !Number.isFinite(quantity) || quantity <= 0 || !['RESTOCK','DAMAGED'].includes(condition) || !['CASH','MPESA'].includes(refundMethod) || !reason)
        return error('Enter a valid sale, product, quantity, condition, refund method and reason.', 400);
      const sales = await listOwned(userId, 'sales');
      const sale = sales.find((s: any) => s.id === saleId && s.status === 'COMPLETED');
      if (!sale) return error('Original completed sale was not found.', 404);
      const soldItem = (sale.items || []).find((item: any) => item.productId === productId);
      if (!soldItem) return error('This product was not part of the selected sale.', 400);
      const priorReturns = await listOwned(userId, 'sales_returns');
      const alreadyReturned = priorReturns.filter((r: any) => r.saleId === saleId && r.productId === productId).reduce((sum: number, r: any) => sum + Number(r.quantity), 0);
      if (quantity > Number(soldItem.quantity) - alreadyReturned + 0.000001)
        return error('Return quantity exceeds the unreturned quantity from the original sale.', 409);
      const unitPaid = Number(soldItem.lineTotal) / Number(soldItem.quantity);
      const refundAmount = Math.round(unitPaid * quantity * 100) / 100;
      const now = new Date().toISOString();
      const returnNumber = 'RT-' + Date.now().toString(36).toUpperCase();
      const returnRecord = await addOwned(userId, 'sales_returns', {
        returnNumber, saleId, receiptNumber: sale.receiptNumber, productId,
        productName: soldItem.name, branchId: sale.branchId, warehouseId: sale.warehouseId,
        quantity, condition, refundMethod, refundAmount, reason,
        status: 'REFUND_DUE', stockRestored: condition === 'RESTOCK', createdAt: now,
      });
      const returnCost = Math.round(Number(soldItem.unitCost || 0) * quantity * 100) / 100;
      if (condition === 'RESTOCK') {
        const [movementId] = await db.add(table(userId, 'stock_movements'), [{
          type: 'RETURN', productId, branchId: sale.branchId, warehouseId: sale.warehouseId,
          quantity, unitCost: Number(soldItem.unitCost || 0), totalCost: returnCost, reference: returnNumber,
          note: 'Resalable customer return against ' + sale.receiptNumber,
          ownerUserId: userId, createdAt: now, updatedAt: now,
        }]);
        if (!movementId) throw new Error('Return record saved but stock restoration needs administrator review. Do not submit this return again.');
      }
      const returnLines: Array<{ accountCode: string; debit?: number; credit?: number }> = [
        { accountCode: '4010', debit: refundAmount },
        { accountCode: '2010', credit: refundAmount },
      ];
      if (condition === 'RESTOCK' && returnCost > 0) {
        returnLines.push({ accountCode: '1200', debit: returnCost });
        returnLines.push({ accountCode: '5000', credit: returnCost });
      }
      await postJournal(userId, { sourceType: 'RETURN', sourceId: returnRecord.id, reference: returnNumber, description: 'Customer return ' + returnNumber, lines: returnLines });
      return json({ returnRecord }, 201);
    },
  ],

  'POST /api/returns/:id/refund': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const returns = await listOwned(userId, 'sales_returns');
      const record = returns.find((item: any) => item.id === ctx.params.id);
      if (!record) return error('Return record not found.', 404);
      if (record.status !== 'REFUND_DUE') return error('This return is not awaiting a refund. It may already have been settled.', 409);
      const body = (ctx.body || {}) as Record<string, unknown>;
      const paymentMethod = textField(body.paymentMethod, 20).toUpperCase();
      const reference = textField(body.reference, 100);
      if (!['CASH', 'MPESA'].includes(paymentMethod)) return error('Choose Cash or M-Pesa as the refund method.', 400);
      if (paymentMethod === 'MPESA' && !reference) return error('Enter the M-Pesa refund transaction code.', 400);
      const now = new Date().toISOString();
      const openShifts = await listOwned(userId, 'pos_shifts');
      const refundShift = openShifts.find((item: any) => item.status === 'OPEN' && item.branchId === record.branchId);
      const updated = {
        ...record, status: 'REFUNDED', refundMethod: paymentMethod, refundReference: reference,
        refundedAt: now, refundSettledBy: userId, refundShiftId: refundShift?.id || null,
      };
      const [ok] = await db.update(table(userId, 'sales_returns'), [{ id: record.id, record: updated }]);
      if (!ok) return error('Refund settlement could not be saved.', 500);
      await postJournal(userId, { sourceType: 'RETURN_REFUND', sourceId: record.id, reference: reference || record.returnNumber, description: 'Refund paid for ' + record.returnNumber, lines: [{ accountCode: '2010', debit: Number(record.refundAmount) }, { accountCode: cashAccountCode(paymentMethod), credit: Number(record.refundAmount) }] });
      await addOwned(userId, 'audit_logs', { action: 'CUSTOMER_REFUND_SETTLED', entityType: 'SALES_RETURN', entityId: record.id, reference: record.returnNumber, paymentMethod, refundAmount: record.refundAmount, refundReference: reference, createdAt: now });
      return json({ returnRecord: { ...updated, id: record.id } }, 200);
    },
  ],

  'GET /api/suppliers': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'suppliers') }),
  ],
  'POST /api/suppliers': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>;
      const name = textField(body.name, 160);
      if (!name) return error('Supplier or company name is required.', 400);
      const userId = ctx.user!.userId;
      const existing = await listOwned(userId, 'suppliers');
      const phone = textField(body.phone, 40);
      if (existing.some((s: any) => normalise(s.name) === normalise(name) && normalise(s.phone) === normalise(phone))) return error('A supplier with this name and phone already exists.', 409);
      const supplier = await addOwned(userId, 'suppliers', { name, contactName: textField(body.contactName, 120), phone, email: textField(body.email, 160), kraPin: textField(body.kraPin, 24), address: textField(body.address, 240), active: true });
      return json({ supplier }, 201);
    },
  ],
  'PUT /api/suppliers/:id': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId; const items = await listOwned(userId, 'suppliers');
      const current = items.find((x: any) => x.id === ctx.params.id); if (!current) return error('Supplier not found.', 404);
      const body = (ctx.body || {}) as Record<string, unknown>; const name = textField(body.name, 160); if (!name) return error('Supplier name is required.', 400);
      const record = { ...current, name, contactName: textField(body.contactName, 120), phone: textField(body.phone, 40), email: textField(body.email, 160), kraPin: textField(body.kraPin, 24), address: textField(body.address, 240), updatedAt: new Date().toISOString() };
      const [ok] = await db.update(table(userId, 'suppliers'), [{ id: current.id, record }]); if (!ok) return error('Supplier could not be updated.', 500); return json({ supplier: { ...record, id: current.id } });
    },
  ],
  'GET /api/purchases': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'purchases') }),
  ],
  'POST /api/purchases': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId; const body = (ctx.body || {}) as Record<string, any>;
      const supplierId = textField(body.supplierId, 120); const branchId = textField(body.branchId, 120); const warehouseId = textField(body.warehouseId, 120);
      if (!supplierId || !branchId || !warehouseId || !Array.isArray(body.items) || !body.items.length || body.items.length > 100) return error('Select a supplier, branch, warehouse and at least one product.', 400);
      const suppliers = await listOwned(userId, 'suppliers'); if (!suppliers.some((s: any) => s.id === supplierId && s.active !== false)) return error('Select a valid supplier.', 400);
      const branches = await listOwned(userId, 'branches'); if (!branches.some((b: any) => b.id === branchId)) return error('Select a valid branch.', 400);
      const warehouses = await listOwned(userId, 'warehouses'); if (!warehouses.some((w: any) => w.id === warehouseId && w.branchId === branchId)) return error('The warehouse does not belong to the selected branch.', 400);
      const products = await db.list(productTable(userId), { limit: 500 }); const items: any[] = [];
      for (const raw of body.items) { const line = raw as Record<string, any>; const product = products.items.find((p: any) => p.id === textField(line.productId, 120) && p.active !== false); const quantity = Number(line.quantity); const unitCost = Number(line.unitCost); if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) return error('Each purchase line needs a valid product, positive quantity and non-negative unit cost.', 400); items.push({ productId: product.id, productName: product.name, sku: product.sku || '', unit: product.unit, quantity, receivedQuantity: 0, unitCost, lineTotal: Math.round(quantity * unitCost * 100) / 100 }); }
      const total = Math.round(items.reduce((sum, x) => sum + x.lineTotal, 0) * 100) / 100; const now = new Date().toISOString(); const orderNumber = 'PO-' + Date.now().toString(36).toUpperCase();
      const purchase = await addOwned(userId, 'purchases', { orderNumber, supplierId, supplierName: suppliers.find((s: any) => s.id === supplierId).name, branchId, warehouseId, invoiceNumber: textField(body.invoiceNumber, 100), expectedDate: textField(body.expectedDate, 20), notes: textField(body.notes, 400), items, total, paidAmount: 0, payments: [], status: 'ORDERED', receivedAt: null, createdAt: now });
      return json({ purchase }, 201);
    },
  ],
  'POST /api/purchases/:id/receive': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const purchases = await listOwned(userId, 'purchases');
      const purchase = purchases.find((x: any) => x.id === ctx.params.id);
      if (!purchase) return error('Purchase order not found.', 404);
      const body = (ctx.body || {}) as Record<string, any>;
      const pending = (purchase.items || []).filter((x: any) => Number(x.receivedQuantity || 0) < Number(x.quantity));
      if (!pending.length) return error('All quantities on this purchase order have already been received.', 409);
      const requested = Array.isArray(body.items) ? body.items : pending.map((x: any) => ({ productId: x.productId, quantity: Number(x.quantity) - Number(x.receivedQuantity || 0) }));
      if (!requested.length || requested.length > 100) return error('Enter at least one item quantity to receive.', 400);
      const seen = new Set<string>();
      const receiptLines: any[] = [];
      for (const raw of requested) {
        const productId = textField(raw?.productId, 120);
        const quantity = Number(raw?.quantity);
        const line = pending.find((x: any) => x.productId === productId);
        if (!line || seen.has(productId) || !Number.isFinite(quantity) || quantity <= 0) return error('Each receipt line must identify a pending product and a positive quantity.', 400);
        const remaining = Number(line.quantity) - Number(line.receivedQuantity || 0);
        if (quantity > remaining + 0.000001) return error('Received quantity cannot exceed the outstanding quantity for ' + line.productName + '.', 409);
        seen.add(productId);
        receiptLines.push({ ...line, receiveNow: quantity, remainingBefore: remaining });
      }
      const now = new Date().toISOString();
      const movements = receiptLines.map((x: any) => ({ type: 'RECEIPT', productId: x.productId, branchId: purchase.branchId, warehouseId: purchase.warehouseId, quantity: x.receiveNow, unitCost: Number(x.unitCost), totalCost: x.receiveNow * Number(x.unitCost), reference: purchase.orderNumber, supplierId: purchase.supplierId, supplierInvoice: purchase.invoiceNumber, note: 'Purchase order partial goods receipt', ownerUserId: userId, createdAt: now, updatedAt: now }));
      const ids = await db.add(table(userId, 'stock_movements'), movements);
      if (ids.some(id => !id)) throw new Error('Some stock receipt movements could not be saved. Review the stock ledger before retrying.');
      const receivedByProduct = new Map(receiptLines.map((x: any) => [x.productId, x.receiveNow]));
      const items = (purchase.items || []).map((x: any) => ({ ...x, receivedQuantity: Math.min(Number(x.quantity), Number(x.receivedQuantity || 0) + Number(receivedByProduct.get(x.productId) || 0)) }));
      const complete = items.every((x: any) => Number(x.receivedQuantity || 0) >= Number(x.quantity));
      const nextStatus = complete ? 'RECEIVED' : 'PART_RECEIVED';
      const [ok] = await db.update(table(userId, 'purchases'), [{ id: purchase.id, record: { ...purchase, items, status: nextStatus, receivedAt: complete ? now : purchase.receivedAt || null, lastReceiptAt: now, updatedAt: now } }]);
      if (!ok) throw new Error('Stock was received but the purchase order status could not be updated. Contact an administrator before retrying.');
      const receivedValue = Math.round(receiptLines.reduce((sum: number, item: any) => sum + item.receiveNow * Number(item.unitCost || 0), 0) * 100) / 100;
      if (receivedValue > 0) await postJournal(userId, { sourceType: 'PURCHASE_RECEIPT', sourceId: purchase.id + ':' + now, reference: purchase.orderNumber, description: 'Goods received for ' + purchase.orderNumber, lines: [{ accountCode: '1200', debit: receivedValue }, { accountCode: '2000', credit: receivedValue }] });
      await addOwned(userId, 'audit_logs', { action: 'PURCHASE_GOODS_RECEIVED', entityType: 'PURCHASE', entityId: purchase.id, reference: purchase.orderNumber, receivedLines: receiptLines.map((x: any) => ({ productId: x.productId, quantity: x.receiveNow })), receivedValue, createdAt: now });
      return json({ purchase: { ...purchase, items, status: nextStatus, lastReceiptAt: now }, receivedLines: receiptLines.length, receivedQuantity: receiptLines.reduce((sum: number, x: any) => sum + x.receiveNow, 0), status: nextStatus }, 200);
    },
  ],
  'POST /api/purchases/:id/payments': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId; const purchases = await listOwned(userId, 'purchases'); const purchase = purchases.find((x: any) => x.id === ctx.params.id); if (!purchase) return error('Purchase order not found.', 404);
      const body = (ctx.body || {}) as Record<string, unknown>; const amount = Number(body.amount); const balance = Math.max(0, Number(purchase.total) - Number(purchase.paidAmount || 0)); const paymentMethod = textField(body.paymentMethod, 20).toUpperCase() || 'BANK'; if (!Number.isFinite(amount) || amount <= 0 || amount > balance + 0.01 || !['CASH','MPESA','BANK'].includes(paymentMethod)) return error('Enter a positive payment not exceeding the outstanding supplier balance and choose Cash, M-Pesa or Bank.', 400);
      const paymentReference = textField(body.reference, 100);
      if (paymentMethod === 'MPESA' && !paymentReference) return error('Enter the M-Pesa transaction code for this supplier payment.', 400);
      const now = new Date().toISOString(); const payments = [...(purchase.payments || []), { amount, paymentMethod, reference: paymentReference, paidAt: now }]; const paidAmount = Math.round((Number(purchase.paidAmount || 0) + amount) * 100) / 100; const status = paidAmount >= Number(purchase.total) - 0.01 ? 'PAID' : 'PART_PAID'; const record = { ...purchase, payments, paidAmount, status: purchase.status === 'RECEIVED' ? status : purchase.status, paymentStatus: status, updatedAt: now }; const [ok] = await db.update(table(userId, 'purchases'), [{ id: purchase.id, record }]); if (!ok) return error('Supplier payment could not be recorded.', 500);
      const payment = payments[payments.length - 1];      await postJournal(userId, { sourceType: 'SUPPLIER_PAYMENT', sourceId: purchase.id + ':' + String(payments.length), reference: payment.reference || purchase.orderNumber, description: 'Supplier payment for ' + purchase.orderNumber, lines: [{ accountCode: '2000', debit: amount }, { accountCode: cashAccountCode(paymentMethod), credit: amount }] });
      return json({ purchase: { ...record, id: purchase.id } }, 200);
    },
  ],
  'GET /api/customers': [
    requireAuth(),
    async ctx => json({ items: await listOwned(ctx.user!.userId, 'customers') }),
  ],
  'POST /api/customers': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as Record<string, unknown>; const name = textField(body.name, 160); const phone = textField(body.phone, 40); if (!name || !phone) return error('Customer name and phone number are required.', 400);
      const userId = ctx.user!.userId; const existing = await listOwned(userId, 'customers'); if (existing.some((c: any) => normalise(c.phone) === normalise(phone))) return error('A customer with this phone number already exists.', 409);
      const customer = await addOwned(userId, 'customers', { name, phone, email: textField(body.email, 160), address: textField(body.address, 240), kraPin: textField(body.kraPin, 24), notes: textField(body.notes, 300), active: true }); return json({ customer }, 201);
    },
  ],
  'PUT /api/customers/:id': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId; const items = await listOwned(userId, 'customers'); const current = items.find((x: any) => x.id === ctx.params.id); if (!current) return error('Customer not found.', 404);
      const body = (ctx.body || {}) as Record<string, unknown>; const name = textField(body.name, 160); const phone = textField(body.phone, 40); if (!name || !phone) return error('Customer name and phone number are required.', 400); if (items.some((x: any) => x.id !== current.id && normalise(x.phone) === normalise(phone))) return error('Another customer already uses this phone number.', 409);
      const record = { ...current, name, phone, email: textField(body.email, 160), address: textField(body.address, 240), kraPin: textField(body.kraPin, 24), notes: textField(body.notes, 300), updatedAt: new Date().toISOString() }; const [ok] = await db.update(table(userId, 'customers'), [{ id: current.id, record }]); if (!ok) return error('Customer could not be updated.', 500); return json({ customer: { ...record, id: current.id } });
    },
  ],

  'GET /api/accounting': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const accounts = await ensureAccountingAccounts(userId);
      const journals = await listOwned(userId, 'journal_entries');
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const journal of journals as any[]) {
        for (const line of journal.lines || []) {
          const current = totals.get(line.accountCode) || { debit: 0, credit: 0 };
          current.debit += Number(line.debit || 0);
          current.credit += Number(line.credit || 0);
          totals.set(line.accountCode, current);
        }
      }
      const trialBalance = accounts.map((account: any) => {
        const value = totals.get(account.code) || { debit: 0, credit: 0 };
        const debitBalance = Math.max(0, value.debit - value.credit);
        const creditBalance = Math.max(0, value.credit - value.debit);
        return { ...account, debitTotal: value.debit, creditTotal: value.credit, debitBalance, creditBalance };
      });
      const amountFor = (type: string) => trialBalance
        .filter((account: any) => account.type === type)
        .reduce((sum: number, account: any) => sum + (type === 'ASSET' || type === 'EXPENSE' ? account.debitBalance - account.creditBalance : account.creditBalance - account.debitBalance), 0);
      const income = amountFor('INCOME');
      const expenses = amountFor('EXPENSE');
      const assets = amountFor('ASSET');
      const liabilities = amountFor('LIABILITY');
      const equity = amountFor('EQUITY');
      const cashBalance = ['1000', '1010', '1020'].reduce((sum, code) => {
        const account = trialBalance.find((item: any) => item.code === code);
        return sum + (account ? account.debitBalance - account.creditBalance : 0);
      }, 0);
      return json({
        accounts,
        journals: journals.slice().sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).slice(0, 100),
        trialBalance,
        profitAndLoss: { income, expenses, netProfit: income - expenses },
        balanceSheet: { assets, liabilities, equity: equity + income - expenses },
        cashbook: { cashBalance },
        openingBalance: journals.find((journal: any) => journal.sourceType === 'OPENING_BALANCE') || null,
        postedJournalCount: journals.length,
      });
    },
  ],
  'POST /api/accounting/opening-balances': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const existingJournals = await listOwned(userId, 'journal_entries');
      if (existingJournals.some((journal: any) => journal.sourceType === 'OPENING_BALANCE'))
        return error('Opening balances have already been posted. Contact an authorised accountant to arrange a correction journal.', 409);

      const body = (ctx.body || {}) as Record<string, unknown>;
      const effectiveDate = textField(body.effectiveDate, 10);
      const parsedOpeningDate = new Date(effectiveDate + 'T00:00:00.000Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(parsedOpeningDate.getTime()) || parsedOpeningDate.toISOString().slice(0, 10) !== effectiveDate)
        return error('Enter a valid opening balance date.', 400);

      if (!Array.isArray(body.balances))
        return error('Enter opening balances for at least one account.', 400);

      const accounts = await ensureAccountingAccounts(userId);
      const seen = new Set<string>();
      const lines: Array<{ accountCode: string; debit?: number; credit?: number }> = [];
      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const raw of body.balances as Array<Record<string, unknown>>) {
        const accountCode = textField(raw.accountCode, 10);
        const amount = Number(raw.amount);
        if (!accountCode || !Number.isFinite(amount) || amount < 0)
          return error('Each opening balance must have a valid account and a non-negative amount.', 400);
        if (seen.has(accountCode))
          return error('An account appears more than once in the opening balance list.', 400);
        seen.add(accountCode);
        if (amount === 0) continue;

        const account = accounts.find((item: any) => item.code === accountCode && item.active !== false);
        if (!account || !['ASSET', 'LIABILITY'].includes(account.type))
          return error('Opening balances can only be entered for active asset and liability accounts.', 400);

        const rounded = Math.round(amount * 100) / 100;
        if (account.type === 'ASSET') {
          totalAssets += rounded;
          lines.push({ accountCode, debit: rounded });
        } else {
          totalLiabilities += rounded;
          lines.push({ accountCode, credit: rounded });
        }
      }

      totalAssets = Math.round(totalAssets * 100) / 100;
      totalLiabilities = Math.round(totalLiabilities * 100) / 100;
      if (lines.length === 0)
        return error('Enter at least one non-zero asset or liability balance.', 400);

      const ownerEquity = Math.round((totalAssets - totalLiabilities) * 100) / 100;
      if (ownerEquity > 0) lines.push({ accountCode: '3000', credit: ownerEquity });
      if (ownerEquity < 0) lines.push({ accountCode: '3000', debit: Math.abs(ownerEquity) });

      const journal = await postJournal(userId, {
        sourceType: 'OPENING_BALANCE',
        sourceId: 'initial',
        reference: 'OPENING-' + effectiveDate.replace(/-/g, ''),
        description: 'Business opening balances as at ' + effectiveDate,
        date: effectiveDate,
        lines,
      });
      return json({ openingBalance: journal }, 201);
    },
  ],
  'POST /api/accounting/expenses': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, unknown>;
      const description = textField(body.description, 180);
      const amount = Number(body.amount);
      const accountCode = textField(body.accountCode, 10);
      const paymentMethod = textField(body.paymentMethod, 20).toUpperCase();
      if (!description || !Number.isFinite(amount) || amount <= 0 || !['5100','5110','5120','5130','5140','5150','5160','5190'].includes(accountCode) || !['CASH','MPESA','BANK'].includes(paymentMethod))
        return error('Enter a description, positive amount, expense category and valid payment account.', 400);
      const expense: any = await addOwned(userId, 'expenses', {
        description, amount: Math.round(amount * 100) / 100, accountCode,
        paymentMethod, reference: textField(body.reference, 100),
        notes: textField(body.notes, 300), date: textField(body.date, 20) || new Date().toISOString().slice(0, 10),
        status: 'POSTED',
      });
      await postJournal(userId, {
        sourceType: 'EXPENSE', sourceId: expense.id, reference: expense.reference || expense.id,
        description: 'Expense: ' + description,
        lines: [
          { accountCode, debit: expense.amount },
          { accountCode: cashAccountCode(paymentMethod), credit: expense.amount },
        ],
      });
      return json({ expense }, 201);
    },
  ],
  'POST /api/accounting/cashbook': [
    requireAuth(),
    async ctx => {
      const userId = ctx.user!.userId;
      const body = (ctx.body || {}) as Record<string, unknown>;
      const direction = textField(body.direction, 20).toUpperCase();
      const description = textField(body.description, 180);
      const amount = Number(body.amount);
      const cashMethod = textField(body.paymentMethod, 20).toUpperCase();
      const offsetCode = textField(body.accountCode, 10);
      if (!['RECEIPT','PAYMENT'].includes(direction) || !description || !Number.isFinite(amount) || amount <= 0 || !['CASH','MPESA','BANK'].includes(cashMethod))
        return error('Enter a valid cashbook direction, description, amount and cash/bank account.', 400);
      const accounts = await ensureAccountingAccounts(userId);
      const offset = accounts.find((account: any) => account.code === offsetCode && account.active !== false && account.code !== cashAccountCode(cashMethod));
      if (!offset) return error('Select a valid offset account different from the cash/bank account.', 400);      const record: any = await addOwned(userId, 'cashbook_entries', {
        direction, description, amount: Math.round(amount * 100) / 100,
        paymentMethod: cashMethod, accountCode: offsetCode,
        reference: textField(body.reference, 100),
        date: textField(body.date, 20) || new Date().toISOString().slice(0, 10),
      });
      const cashCode = cashAccountCode(cashMethod);
      await postJournal(userId, {
        sourceType: 'CASHBOOK', sourceId: record.id, reference: record.reference || record.id,
        description: 'Cashbook ' + direction.toLowerCase() + ': ' + description,
        lines: direction === 'RECEIPT'
          ? [{ accountCode: cashCode, debit: record.amount }, { accountCode: offsetCode, credit: record.amount }]
          : [{ accountCode: offsetCode, debit: record.amount }, { accountCode: cashCode, credit: record.amount }],
      });
      return json({ entry: record }, 201);
    },
  ],
  'GET /api/audit': [
    requireAuth(),
    async ctx =>
      json({ items: await listOwned(ctx.user!.userId, 'audit_logs') }),
  ],
});
