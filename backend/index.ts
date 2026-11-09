import { router, json, error, requireAuth, db } from '@appdeploy/sdk';

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

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
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

export const handler = router({

  'POST /api/desktop/pairings/issue': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('Sign in on an authorised business computer before generating a pairing code.', 401);
      if (!device.ownerDevice) return error('Only the primary Business Owner computer can generate pairing codes.', 403);
      const devices = await db.list(table(device.userId, 'desktop_devices'), { limit: 100 });
      const activeDevices = devices.items.filter((item: any) => item.status === 'active');
      if (activeDevices.length >= 100) return error('The current device allowance has been reached. Contact the software provider to review your licence.', 403);
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
      const code = textField(body.code, 16).replace(/\\s/g, '');
      const deviceId = textField(body.deviceId, 80);
      const deviceName = textField(body.deviceName, 100) || 'Windows desktop';
      if (!/^\\d{8}$/.test(code) || !deviceId) return error('Enter a valid 8-digit pairing code and device identity.', 400);
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
      const devices = await db.list(table(pairing.userId, 'desktop_devices'), { limit: 100 });
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
        ownerDevice: Boolean(pairing.ownerDevice),
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
        ownerDevice: device.ownerDevice,
        status: 'active',
        createdAt: new Date().toISOString(),
      }]);
      if (!tokenId) return error('A secure device credential could not be issued.', 500);
      return json({ deviceToken: token, ownerDevice: device.ownerDevice, deviceId });
    },
  ],
  'GET /api/desktop/sync/pull': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const saved = await db.list(table(device.userId, 'desktop_sync_state'), { limit: 1 });
      const now = new Date().toISOString();
      const tokenRecord = { ...device, lastSeenAt: now };
      await db.update(desktopTokenTable, [{ id: device.id, record: tokenRecord }]);
      return json({ snapshot: saved.items[0]?.snapshot || null, updatedAt: saved.items[0]?.updatedAt || null, ownerDevice: Boolean(device.ownerDevice) });
    },
  ],
  'POST /api/desktop/sync/password': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      const body = (ctx.body || {}) as Record<string, any>;
      const staffId = textField(body.staffId, 80);
      const expectedHash = typeof body.expectedPasswordHash === 'string' ? body.expectedPasswordHash : '';
      const nextHash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
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
  'POST /api/desktop/sync/push': [
    async ctx => {
      const device = await authenticatedDesktop(ctx);
      if (!device) return error('This computer is not authorised. Pair it again from the owner portal.', 401);
      if (!device.ownerDevice) return error('Only the primary owner computer can publish business and staff account changes.', 403);
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
      if (size > 220000) return error('The business snapshot is too large to synchronise in one request. Reduce logo size or staff records and try again.', 413);
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
      if (hasDiscount && (!textField(approval.managerName, 120) || !textField(approval.reason, 300)))
        return error('Discounted sales require a manager approval name and reason.', 400);
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
        items: saleItems, payments, total, discountApproval: hasDiscount ? { managerName: textField(approval.managerName, 120), reason: textField(approval.reason, 300), recordedAt: now } : null, status: 'COMPLETED', createdAt: now,
      });
      if (hasDiscount) await addOwned(userId, 'audit_logs', { action: 'SALE_DISCOUNT_APPROVED', entityType: 'SALE', entityId: sale.id, reference: receiptNumber, managerName: textField(approval.managerName, 120), reason: textField(approval.reason, 300), discountTotal: saleItems.reduce((sum,item)=>sum+item.discountAmount,0), createdAt: now });
      const stockRows = saleItems.map(item => ({
        type: 'SALE', productId: item.productId, branchId, warehouseId,
        quantity: item.quantity, unitCost: 0, totalCost: 0,
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
      if (!Number.isFinite(closingCash) || closingCash < 0) return error('Enter a valid closing cash count.', 400);
      const [ok] = await db.update(table(userId, 'pos_shifts'), [{ id: shift.id, record: { ...shift, closingCash, status: 'CLOSED', closedAt: new Date().toISOString() } }]);
      if (!ok) return error('The cashier shift could not be closed.', 500);
      return json({ shift: { ...shift, closingCash, status: 'CLOSED' } });
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
      if (condition === 'RESTOCK') {
        const [movementId] = await db.add(table(userId, 'stock_movements'), [{
          type: 'RETURN', productId, branchId: sale.branchId, warehouseId: sale.warehouseId,
          quantity, unitCost: 0, totalCost: 0, reference: returnNumber,
          note: 'Resalable customer return against ' + sale.receiptNumber,
          ownerUserId: userId, createdAt: now, updatedAt: now,
        }]);
        if (!movementId) throw new Error('Return record saved but stock restoration needs administrator review. Do not submit this return again.');
      }
      const returnCost = Math.round(Number(soldItem.unitCost || 0) * quantity * 100) / 100;
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
      const updated = { ...record, status: 'REFUNDED', refundMethod: paymentMethod, refundReference: reference, refundedAt: now, refundSettledBy: userId };
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
      const now = new Date().toISOString(); const payments = [...(purchase.payments || []), { amount, paymentMethod, reference: textField(body.reference, 100), paidAt: now }]; const paidAmount = Math.round((Number(purchase.paidAmount || 0) + amount) * 100) / 100; const status = paidAmount >= Number(purchase.total) - 0.01 ? 'PAID' : 'PART_PAID'; const record = { ...purchase, payments, paidAmount, status: purchase.status === 'RECEIVED' ? status : purchase.status, paymentStatus: status, updatedAt: now }; const [ok] = await db.update(table(userId, 'purchases'), [{ id: purchase.id, record }]); if (!ok) return error('Supplier payment could not be recorded.', 500);
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
