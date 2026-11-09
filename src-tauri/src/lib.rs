use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::Manager;
use uuid::Uuid;

struct LocalDatabase(Mutex<Connection>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStatus {
    setup_required: bool,
    device_id: String,
    staff_count: i64,
    schema_version: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StaffSession {
    staff_id: String,
    username: String,
    display_name: String,
    role: String,
    branch_id: Option<String>,
    must_change_password: bool,
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join("hardware-retail-local.sqlite3"))
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;

        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS businesses (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'KES',
            timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS branches (
            id TEXT PRIMARY KEY,
            business_id TEXT NOT NULL REFERENCES businesses(id),
            name TEXT NOT NULL,
            code TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS staff_profiles (
            id TEXT PRIMARY KEY,
            business_id TEXT NOT NULL REFERENCES businesses(id),
            display_name TEXT NOT NULL,
            role TEXT NOT NULL,
            branch_id TEXT REFERENCES branches(id),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS staff_accounts (
            id TEXT PRIMARY KEY,
            staff_profile_id TEXT NOT NULL UNIQUE REFERENCES staff_profiles(id),
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_outbox (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            attempts INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            last_error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created
            ON sync_outbox(status, created_at);

        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            actor_staff_id TEXT,
            event_type TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            details_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
            name TEXT NOT NULL, sku TEXT NOT NULL, unit TEXT NOT NULL,
            buying_price REAL NOT NULL DEFAULT 0, selling_price REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(business_id, sku)
        );
        CREATE TABLE IF NOT EXISTS warehouses (
            id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES branches(id),
            name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
            branch_id TEXT NOT NULL REFERENCES branches(id), warehouse_id TEXT REFERENCES warehouses(id),
            movement_type TEXT NOT NULL CHECK(movement_type IN ('RECEIPT','SALE','RETURN','ADJUSTMENT')),
            quantity REAL NOT NULL CHECK(quantity > 0), unit_cost REAL NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0, reference TEXT, actor_staff_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_local_stock_lookup ON stock_movements(product_id,branch_id,created_at);
        CREATE TABLE IF NOT EXISTS pos_shifts (
            id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES branches(id),
            cashier_staff_id TEXT NOT NULL REFERENCES staff_profiles(id), opening_float REAL NOT NULL DEFAULT 0,
            closing_cash REAL, closing_mpesa REAL, status TEXT NOT NULL DEFAULT 'OPEN',
            opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY, receipt_number TEXT NOT NULL UNIQUE, branch_id TEXT NOT NULL REFERENCES branches(id),
            shift_id TEXT NOT NULL REFERENCES pos_shifts(id), cashier_staff_id TEXT NOT NULL REFERENCES staff_profiles(id),
            total REAL NOT NULL, payment_method TEXT NOT NULL, payment_reference TEXT,
            status TEXT NOT NULL DEFAULT 'COMPLETED', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
            product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL,
            quantity REAL NOT NULL, unit_price REAL NOT NULL, unit_cost REAL NOT NULL DEFAULT 0,
            line_total REAL NOT NULL
        );

        ",
    ).map_err(|e| e.to_string())?;

    let existing: Option<String> = connection
        .query_row("SELECT value FROM app_meta WHERE key = 'device_id'", [], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?;

    if existing.is_none() {
        connection.execute(
            "INSERT INTO app_meta(key, value) VALUES('device_id', ?1)",
            [Uuid::new_v4().to_string()],
        ).map_err(|e| e.to_string())?;
    }

    connection.execute(
        "INSERT OR IGNORE INTO app_meta(key, value) VALUES('schema_version', '1')",
        [],
    ).map_err(|e| e.to_string())?;

    // Additive migrations keep existing installed databases intact.
    fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let mut statement = connection.prepare(&format!("PRAGMA table_info({table})")).map_err(|e| e.to_string())?;
        let rows = statement.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?;
        for name in rows { if name.map_err(|e| e.to_string())? == column { return Ok(true); } }
        Ok(false)
    }
    for (column, definition) in [("phone", "TEXT"), ("email", "TEXT"), ("address", "TEXT"), ("logo_data_url", "TEXT")] {
        if !has_column(connection, "businesses", column)? {
            connection.execute_batch(&format!("ALTER TABLE businesses ADD COLUMN {column} {definition};")).map_err(|e| e.to_string())?;
        }
    }
    if !has_column(connection, "staff_accounts", "must_change_password")? {
        connection.execute_batch("ALTER TABLE staff_accounts ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;").map_err(|e| e.to_string())?;
    }
    connection.execute_batch("
        CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_business_code ON branches(business_id, code) WHERE code IS NOT NULL;\n        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            device_name TEXT NOT NULL,
            device_type TEXT NOT NULL DEFAULT 'Windows desktop',
            status TEXT NOT NULL DEFAULT 'active',
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    " ).map_err(|e| e.to_string())?;
    let device_id: String = connection.query_row("SELECT value FROM app_meta WHERE key='device_id'", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    connection.execute(
        "INSERT OR IGNORE INTO devices(id, device_name) VALUES(?1, 'This computer')",
        [&device_id],
    ).map_err(|e| e.to_string())?;
    connection.execute("UPDATE app_meta SET value='2' WHERE key='schema_version'", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Could not secure the password: {e}"))
}

fn verify_password(password: &str, stored_hash: &str) -> Result<bool, String> {
    let parsed = PasswordHash::new(stored_hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[tauri::command]
fn get_local_status(database: tauri::State<'_, LocalDatabase>) -> Result<LocalStatus, String> {
    let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    let device_id: String = connection.query_row(
        "SELECT value FROM app_meta WHERE key = 'device_id'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let schema_version: i64 = connection.query_row(
        "SELECT CAST(value AS INTEGER) FROM app_meta WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;
    let staff_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM staff_accounts",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    Ok(LocalStatus {
        setup_required: staff_count == 0,
        device_id,
        staff_count,
        schema_version,
    })
}

#[tauri::command]
fn setup_owner(
    database: tauri::State<'_, LocalDatabase>,
    display_name: String,
    username: String,
    password: String,
) -> Result<StaffSession, String> {
    let display_name = display_name.trim();
    let username = username.trim().to_lowercase();

    if display_name.len() < 2 || display_name.len() > 100 {
        return Err("Enter a name between 2 and 100 characters.".into());
    }
    if username.len() < 3 || username.len() > 40 || !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
        return Err("Username must be 3–40 characters and use letters, numbers, dots, dashes or underscores.".into());
    }
    if password.len() < 12 || password.len() > 128 {
        return Err("Password must be at least 12 characters.".into());
    }

    let mut connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    let existing: i64 = connection.query_row("SELECT COUNT(*) FROM staff_accounts", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if existing > 0 {
        return Err("Initial setup has already been completed. Sign in instead.".into());
    }

    let activated_business_id = read_sync_value(&connection, "business_id")?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let business_id = activated_business_id.filter(|value| !value.is_empty()).unwrap_or_else(|| Uuid::new_v4().to_string());
    let staff_id = Uuid::new_v4().to_string();
    let account_id = Uuid::new_v4().to_string();
    let password_hash = hash_password(&password)?;

    transaction.execute(
        "INSERT INTO businesses(id, name) VALUES(?1, ?2)",
        params![business_id, format!("{display_name}'s Business")],
    ).map_err(|e| e.to_string())?;
    transaction.execute(
        "INSERT INTO staff_profiles(id, business_id, display_name, role) VALUES(?1, ?2, ?3, 'Business Owner')",
        params![staff_id, business_id, display_name],
    ).map_err(|e| e.to_string())?;
    transaction.execute(
        "INSERT INTO staff_accounts(id, staff_profile_id, username, password_hash) VALUES(?1, ?2, ?3, ?4)",
        params![account_id, staff_id, username, password_hash],
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") { "That username is already in use.".to_string() } else { e.to_string() }
    })?;
    transaction.execute(
        "INSERT INTO audit_events(id, actor_staff_id, event_type, entity_type, entity_id) VALUES(?1, ?2, 'OWNER_ACCOUNT_CREATED', 'staff_account', ?3)",
        params![Uuid::new_v4().to_string(), staff_id, account_id],
    ).map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())?;

    Ok(StaffSession {
        staff_id,
        username,
        display_name: display_name.to_string(),
        role: "Business Owner".into(),
        branch_id: None,
        must_change_password: false,
    })
}

#[tauri::command]
fn login_staff(
    database: tauri::State<'_, LocalDatabase>,
    username: String,
    password: String,
) -> Result<StaffSession, String> {
    let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    let record = connection.query_row(
        "SELECT a.id, a.username, a.password_hash, a.status, p.id, p.display_name, p.role, p.branch_id, p.status, a.must_change_password
         FROM staff_accounts a
         JOIN staff_profiles p ON p.id = a.staff_profile_id
         WHERE a.username = ?1 COLLATE NOCASE",
        [username.trim()],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, i64>(9)?,
        )),
    ).optional().map_err(|e| e.to_string())?;

    let (account_id, canonical_username, password_hash, account_status, staff_id, display_name, role, branch_id, profile_status, must_change_password) =
        record.ok_or_else(|| "Incorrect username or password.".to_string())?;

    if account_status != "active" || profile_status != "active" {
        return Err("This staff account is inactive. Contact the business owner.".into());
    }
    if !verify_password(&password, &password_hash)? {
        return Err("Incorrect username or password.".into());
    }

    connection.execute(
        "UPDATE staff_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [&account_id],
    ).map_err(|e| e.to_string())?;
    connection.execute(
        "INSERT INTO audit_events(id, actor_staff_id, event_type, entity_type, entity_id) VALUES(?1, ?2, 'LOCAL_LOGIN', 'staff_account', ?3)",
        params![Uuid::new_v4().to_string(), staff_id, account_id],
    ).map_err(|e| e.to_string())?;

    Ok(StaffSession {
        staff_id,
        username: canonical_username,
        display_name,
        role,
        branch_id,
        must_change_password: must_change_password == 1,
    })
}



#[tauri::command]
fn change_staff_password(database:tauri::State<'_,LocalDatabase>,staff_id:String,current_password:String,new_password:String)->Result<(),String>{
    if new_password.len()<12 || new_password.len()>128 { return Err("New password must be between 12 and 128 characters.".into()); }
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let (account_id,stored_hash):(String,String)=c.query_row("SELECT id,password_hash FROM staff_accounts WHERE staff_profile_id=?1 AND status='active'",[&staff_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?.ok_or_else(||"Staff account not found.".to_string())?;
    if !verify_password(&current_password,&stored_hash)? { return Err("Current password is incorrect.".into()); }
    let hash=hash_password(&new_password)?;
    c.execute("UPDATE staff_accounts SET password_hash=?1,must_change_password=0 WHERE id=?2",params![hash,account_id]).map_err(|e|e.to_string())?;
    c.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id) VALUES(?1,?2,'STAFF_PASSWORD_CHANGED','staff_account',?3)",params![Uuid::new_v4().to_string(),staff_id,account_id]).map_err(|e|e.to_string())?;
    let mut pending: Vec<serde_json::Value> = read_sync_value(&c,"pending_password_sync")?
        .and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default();
    pending.retain(|item| item["staffId"].as_str() != Some(staff_id.as_str()));
    pending.push(serde_json::json!({
        "staffId":staff_id,
        "expectedPasswordHash":stored_hash,
        "passwordHash":hash
    }));
    let pending_json=serde_json::to_string(&pending).map_err(|e|e.to_string())?;
    write_sync_value(&c,"pending_password_sync",&pending_json)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BusinessProfile {
    id: String,
    name: String,
    currency: String,
    timezone: String,
    phone: Option<String>,
    email: Option<String>,
    address: Option<String>,
    logo_data_url: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BranchRecord { id: String, name: String, code: Option<String>, status: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StaffRecord { staff_id: String, display_name: String, role: String, branch_id: Option<String>, username: String, status: String, must_change_password: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRecord { id: String, device_name: String, device_type: String, status: String, last_seen_at: String }

fn require_owner(connection: &Connection, actor_id: &str) -> Result<(), String> {
    let role: Option<String> = connection.query_row(
        "SELECT role FROM staff_profiles WHERE id=?1 AND status='active'", [actor_id], |r| r.get(0)
    ).optional().map_err(|e| e.to_string())?;
    if role.as_deref() != Some("Business Owner") { return Err("Only the business owner can perform this action.".into()); }
    Ok(())
}

#[tauri::command]
fn get_business_profile(database: tauri::State<'_, LocalDatabase>, actor_id: String) -> Result<BusinessProfile, String> {
    let c=database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    require_owner(&c,&actor_id)?;
    c.query_row("SELECT id,name,currency,timezone,phone,email,address,logo_data_url FROM businesses ORDER BY created_at LIMIT 1", [], |r| Ok(BusinessProfile{
        id:r.get(0)?,name:r.get(1)?,currency:r.get(2)?,timezone:r.get(3)?,phone:r.get(4)?,email:r.get(5)?,address:r.get(6)?,logo_data_url:r.get(7)?
    })).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_business_profile(database: tauri::State<'_, LocalDatabase>, actor_id:String, name:String, phone:Option<String>, email:Option<String>, address:Option<String>, logo_data_url:Option<String>, currency:String, timezone:String) -> Result<(),String> {
    let name=name.trim(); if name.len()<2 || name.len()>120 { return Err("Business name must be 2–120 characters.".into()); }
    if !["KES","USD","UGX","TZS"].contains(&currency.as_str()) { return Err("Select a supported currency.".into()); }
    let c=database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    require_owner(&c,&actor_id)?;
    let id:String=c.query_row("SELECT id FROM businesses ORDER BY created_at LIMIT 1",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    c.execute("UPDATE businesses SET name=?1,phone=?2,email=?3,address=?4,logo_data_url=?5,currency=?6,timezone=?7 WHERE id=?8",params![name,phone,email,address,logo_data_url,currency,timezone,id]).map_err(|e|e.to_string())?;
    c.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id) VALUES(?1,?2,'BUSINESS_PROFILE_UPDATED','business',?3)",params![Uuid::new_v4().to_string(),actor_id,id]).map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_branches(database:tauri::State<'_,LocalDatabase>,actor_id:String)->Result<Vec<BranchRecord>,String>{
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?; require_owner(&c,&actor_id)?;
    let mut st=c.prepare("SELECT id,name,code,status FROM branches ORDER BY name").map_err(|e|e.to_string())?;
    let rows=st.query_map([],|r|Ok(BranchRecord{id:r.get(0)?,name:r.get(1)?,code:r.get(2)?,status:r.get(3)?})).map_err(|e|e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
#[tauri::command]
fn create_branch(database:tauri::State<'_,LocalDatabase>,actor_id:String,name:String,code:String)->Result<BranchRecord,String>{
    let name=name.trim(); let code=code.trim().to_uppercase();
    if name.len()<2 || name.len()>100 {return Err("Branch name must be 2–100 characters.".into());}
    if code.len()<2 || code.len()>12 || !code.chars().all(|c|c.is_ascii_alphanumeric()||c=='-') {return Err("Branch code must be 2–12 letters, numbers or dashes.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;require_owner(&c,&actor_id)?;
    let business:String=c.query_row("SELECT id FROM businesses LIMIT 1",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let id=Uuid::new_v4().to_string();
    c.execute("INSERT INTO branches(id,business_id,name,code) VALUES(?1,?2,?3,?4)",params![id,business,name,code]).map_err(|e|if e.to_string().contains("UNIQUE"){"That branch code is already in use.".into()}else{e.to_string()})?;
    c.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id) VALUES(?1,?2,'BRANCH_CREATED','branch',?3)",params![Uuid::new_v4().to_string(),actor_id,id]).map_err(|e|e.to_string())?;
    Ok(BranchRecord{id,name:name.into(),code:Some(code),status:"active".into()})
}

#[tauri::command]
fn list_staff(database:tauri::State<'_,LocalDatabase>,actor_id:String)->Result<Vec<StaffRecord>,String>{
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;require_owner(&c,&actor_id)?;
    let mut st=c.prepare("SELECT p.id,p.display_name,p.role,p.branch_id,a.username,a.status,a.must_change_password FROM staff_profiles p JOIN staff_accounts a ON a.staff_profile_id=p.id ORDER BY p.created_at DESC").map_err(|e|e.to_string())?;
    let rows=st.query_map([],|r|Ok(StaffRecord{staff_id:r.get(0)?,display_name:r.get(1)?,role:r.get(2)?,branch_id:r.get(3)?,username:r.get(4)?,status:r.get(5)?,must_change_password:r.get::<_,i64>(6)?==1})).map_err(|e|e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}
#[tauri::command]
fn create_staff(database:tauri::State<'_,LocalDatabase>,actor_id:String,display_name:String,role:String,branch_id:Option<String>)->Result<serde_json::Value,String>{
    let display=display_name.trim(); if display.len()<2||display.len()>100{return Err("Enter a staff name between 2 and 100 characters.".into());}
    if !["Manager","Cashier","Storekeeper","Accountant","Supervisor"].contains(&role.as_str()){return Err("Select a valid staff role.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;require_owner(&c,&actor_id)?;
    if let Some(ref bid)=branch_id {let exists:i64=c.query_row("SELECT COUNT(*) FROM branches WHERE id=?1 AND status='active'",[bid],|r|r.get(0)).map_err(|e|e.to_string())?;if exists==0{return Err("Select an active branch.".into());}}
    let base:String=display.to_lowercase().chars().map(|ch|if ch.is_ascii_alphanumeric(){ch}else{' '}).collect::<String>().split_whitespace().collect::<Vec<_>>().join(".");
    let mut username=base.chars().take(24).collect::<String>(); if username.len()<3 {username=format!("staff.{}",Uuid::new_v4().simple().to_string().chars().take(6).collect::<String>());}
    let count:i64=c.query_row("SELECT COUNT(*) FROM staff_accounts WHERE username LIKE ?1",[format!("{username}%")],|r|r.get(0)).map_err(|e|e.to_string())?;
    if count>0 {username=format!("{}.{}",username,count+1);}
    let temporary_password=format!("HR-{}!a",Uuid::new_v4().simple().to_string().chars().take(12).collect::<String>());
    let hash=hash_password(&temporary_password)?;let profile=Uuid::new_v4().to_string();let account=Uuid::new_v4().to_string();
    let business:String=c.query_row("SELECT id FROM businesses LIMIT 1",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    c.execute("INSERT INTO staff_profiles(id,business_id,display_name,role,branch_id) VALUES(?1,?2,?3,?4,?5)",params![profile,business,display,role,branch_id]).map_err(|e|e.to_string())?;
    c.execute("INSERT INTO staff_accounts(id,staff_profile_id,username,password_hash,must_change_password) VALUES(?1,?2,?3,?4,1)",params![account,profile,username,hash]).map_err(|e|e.to_string())?;
    c.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id) VALUES(?1,?2,'STAFF_ACCOUNT_CREATED','staff_profile',?3)",params![Uuid::new_v4().to_string(),actor_id,profile]).map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"staffId":profile,"username":username,"temporaryPassword":temporary_password}))
}

#[tauri::command]
fn list_devices(database:tauri::State<'_,LocalDatabase>,actor_id:String)->Result<Vec<DeviceRecord>,String>{
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;require_owner(&c,&actor_id)?;
    let mut st=c.prepare("SELECT id,device_name,device_type,status,last_seen_at FROM devices ORDER BY created_at").map_err(|e|e.to_string())?;
    let rows=st.query_map([],|r|Ok(DeviceRecord{id:r.get(0)?,device_name:r.get(1)?,device_type:r.get(2)?,status:r.get(3)?,last_seen_at:r.get(4)?})).map_err(|e|e.to_string())?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())
}


const DESKTOP_API_BASE: &str = "https://api-v2.appdeploy.ai/app/hardware-retail-management-system-84id5j/api";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceSyncStatus {
    paired: bool,
    owner_device: bool,
    licence_active: bool,
    licence_status: String,
    licence_message: Option<String>,
    last_sync_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingResult { device_id: String, owner_device: bool }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingCodeResult {
    code: String,
    expires_at: String,
    owner_device: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncResult { owner_device: bool, updated_at: String, branches: usize, staff: usize }

fn read_sync_value(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection.query_row("SELECT value FROM sync_state WHERE key=?1", [key], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

fn write_sync_value(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection.execute(
        "INSERT INTO sync_state(key,value,updated_at) VALUES(?1,?2,CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",
        params![key,value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn activate_desktop_licence(
    database: tauri::State<'_, LocalDatabase>,
    licence_key: String,
    device_name: String,
    actor_staff_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let (device_id, existing_token, owner_device, existing_business_id, existing_licence_id, password_hash) = {
        let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
        let id: String = connection.query_row("SELECT value FROM app_meta WHERE key='device_id'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        let business_id: Option<String> = connection.query_row(
            "SELECT id FROM businesses ORDER BY created_at LIMIT 1", [], |row| row.get(0)
        ).optional().map_err(|e| e.to_string())?;
        let token = read_sync_value(&connection, "device_token")?;
        let owner = read_sync_value(&connection, "owner_device")?.unwrap_or_default() == "true";
        let licence_id = read_sync_value(&connection, "licence_id")?.unwrap_or_default();
        let hash = if let Some(actor_id) = actor_staff_id.as_deref() {
            connection.query_row(
                "SELECT a.password_hash FROM staff_accounts a
                 JOIN staff_profiles p ON p.id=a.staff_profile_id
                 WHERE p.id=?1 AND p.role='Business Owner' AND p.status='active' AND a.status='active'",
                [actor_id], |row| row.get::<_, String>(0)
            ).optional().map_err(|e| e.to_string())?
        } else { None };
        (id, token, owner, business_id, licence_id, hash)
    };
    let key = licence_key.trim().to_uppercase();
    if key.len() < 12 || key.len() > 100 || !key.starts_with("HRMS-") { return Err("Enter a valid licence key.".into()); }
    let attaching_existing = existing_token.is_some();
    let replacing_existing = attaching_existing && !existing_licence_id.is_empty();
    if replacing_existing && (actor_staff_id.is_none() || password_hash.is_none()) {
        return Err("Sign in as the Business Owner before replacing the licence.".into());
    }
    if attaching_existing && !replacing_existing && !owner_device {
        return Err("This computer is not the primary setup computer for initial licence activation.".into());
    }
    let endpoint = if replacing_existing { "replace" } else if attaching_existing { "attach" } else { "activate" };
    let mut payload = serde_json::json!({
        "licenceKey": key,
        "deviceId": device_id,
        "deviceName": device_name.trim(),
        "businessId": existing_business_id
    });
    if replacing_existing {
        payload["actorStaffId"] = serde_json::json!(actor_staff_id);
        payload["passwordHash"] = serde_json::json!(password_hash);
    }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30)).build()
        .map_err(|e| format!("Could not initialise the licence connection: {e}"))?;
    let request = client.post(format!("{DESKTOP_API_BASE}/desktop/licences/{endpoint}")).json(&payload);
    let response = if let Some(token) = existing_token.as_deref() {
        request.bearer_auth(token).send().await
    } else {
        request.send().await
    }.map_err(|e| format!("Could not reach the licence activation service. Check the internet connection and allow api-v2.appdeploy.ai through any firewall or proxy. Details: {e}"))?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(body.get("error").and_then(|v| v.as_str()).unwrap_or("Licence activation failed.").to_string());
    }
    let token = body.get("deviceToken").and_then(|v| v.as_str())
        .or(existing_token.as_deref())
        .ok_or_else(|| "The activation service did not issue a device credential.".to_string())?;
    let owner_value = body.get("ownerDevice").and_then(|v| v.as_bool()).unwrap_or(owner_device || !attaching_existing);
    let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    write_sync_value(&connection, "device_token", token)?;
    write_sync_value(&connection, "owner_device", if owner_value { "true" } else { "false" })?;
    write_sync_value(&connection, "licence_id", body.get("id").and_then(|v| v.as_str()).unwrap_or(""))?;
    write_sync_value(&connection, "licence_expires_at", body.get("expiresAt").and_then(|v| v.as_str()).unwrap_or(""))?;
    write_sync_value(&connection, "licence_status", "active")?;
    write_sync_value(&connection, "business_id", body.get("businessId").and_then(|v| v.as_str()).unwrap_or(""))?;
    Ok(body)
}

#[tauri::command]
async fn get_device_sync_status(database: tauri::State<'_, LocalDatabase>) -> Result<DeviceSyncStatus, String> {
    let (token, owner, licence_id, last, cached_status) = {
        let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
        (
            read_sync_value(&connection, "device_token")?,
            read_sync_value(&connection, "owner_device")?.unwrap_or_default() == "true",
            read_sync_value(&connection, "licence_id")?.unwrap_or_default(),
            read_sync_value(&connection, "last_sync_at")?,
            read_sync_value(&connection, "licence_status")?.unwrap_or_default(),
        )
    };
    let mut licence_active = !licence_id.is_empty() && (cached_status.is_empty() || cached_status == "active");
    let mut licence_status = if !cached_status.is_empty() {
        cached_status.clone()
    } else if licence_active {
        "active".to_string()
    } else {
        "none".to_string()
    };
    let mut licence_message: Option<String> = None;
    if let Some(token_value) = token.as_deref() {
        if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(12)).build() {
            if let Ok(response) = client.get(format!("{DESKTOP_API_BASE}/desktop/licences/status")).bearer_auth(token_value).send().await {
                if response.status().is_success() {
                    if let Ok(body) = response.json::<serde_json::Value>().await {
                        licence_active = body["licenceActive"].as_bool().unwrap_or(false);
                        licence_status = body["status"].as_str().unwrap_or("none").to_string();
                        licence_message = body["message"].as_str().map(str::to_string);
                        if let Ok(connection) = database.0.lock() {
                            let _ = write_sync_value(&connection, "licence_status", &licence_status);
                        }
                    }
                }
            }
        }
    }
    Ok(DeviceSyncStatus {
        paired: token.is_some(),
        owner_device: owner,
        licence_active,
        licence_status,
        licence_message,
        last_sync_at: last,
    })
}

#[tauri::command]
async fn generate_desktop_pairing_code(
    database: tauri::State<'_, LocalDatabase>,
    actor_staff_id: String,
) -> Result<PairingCodeResult, String> {
    let (token, password_hash) = {
        let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
        let token = read_sync_value(&connection, "device_token")?
            .ok_or_else(|| "Pair this computer with the business before generating a pairing code.".to_string())?;
        let password_hash: Option<String> = connection.query_row(
            "SELECT a.password_hash
             FROM staff_accounts a
             JOIN staff_profiles p ON p.id = a.staff_profile_id
             WHERE p.id = ?1
               AND p.role = 'Business Owner'
               AND p.status = 'active'
               AND a.status = 'active'",
            [&actor_staff_id],
            |row| row.get(0),
        ).optional().map_err(|e| e.to_string())?;
        let password_hash = password_hash
            .ok_or_else(|| "Only the signed-in Business Owner can generate pairing codes.".to_string())?;
        (token, password_hash)
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Could not initialise the pairing service connection: {e}"))?;
    let response = client.post(format!("{DESKTOP_API_BASE}/desktop/pairings/issue"))
        .bearer_auth(&token)
        .json(&serde_json::json!({
            "actorStaffId": actor_staff_id,
            "passwordHash": password_hash
        }))
        .send().await
        .map_err(|e| format!("Could not reach the pairing service. Check the internet connection. Details: {e}"))?;
    let status = response.status();
    let body: serde_json::Value = response.json().await
        .map_err(|e| format!("The cloud service returned an unreadable response: {e}"))?;
    if !status.is_success() {
        return Err(body.get("error").and_then(|v| v.as_str())
            .unwrap_or("Could not generate a pairing code.").to_string());
    }
    Ok(PairingCodeResult {
        code: body.get("code").and_then(|v| v.as_str())
            .ok_or_else(|| "The cloud service did not return a pairing code.".to_string())?.to_string(),
        expires_at: body.get("expiresAt").and_then(|v| v.as_str())
            .ok_or_else(|| "The cloud service did not return an expiry time.".to_string())?.to_string(),
        owner_device: body.get("ownerDevice").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

#[tauri::command]
async fn pair_desktop_device(
    database: tauri::State<'_, LocalDatabase>,
    pairing_code: String,
    device_name: String,
) -> Result<PairingResult, String> {
    let (device_id, already_paired) = {
        let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
        let id: String = connection.query_row("SELECT value FROM app_meta WHERE key='device_id'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
        (id, read_sync_value(&connection, "device_token")?.is_some())
    };
    if already_paired { return Err("This computer is already paired. Use Sync now to refresh it.".into()); }
    let code = pairing_code.trim();
    if code.len() != 8 || !code.chars().all(|c| c.is_ascii_digit()) {
        return Err("Enter the 8-digit code generated on an authorised computer by the Business Owner.".into());
    }
    let client = reqwest::Client::new();
    let response = client.post(format!("{DESKTOP_API_BASE}/desktop/pairings/claim"))
        .json(&serde_json::json!({ "code": code, "deviceId": device_id, "deviceName": device_name.trim() }))
        .send().await.map_err(|e| format!("Could not reach the owner portal: {e}"))?;
    let status = response.status();
    let body: serde_json::Value = response.json().await.map_err(|e| format!("The owner portal returned an unreadable response: {e}"))?;
    if !status.is_success() {
        return Err(body.get("error").and_then(|v|v.as_str()).unwrap_or("Pairing failed. Generate a fresh code and try again.").to_string());
    }
    let token = body.get("deviceToken").and_then(|v|v.as_str()).ok_or_else(|| "The owner portal did not issue a device credential.".to_string())?;
    let owner_device = body.get("ownerDevice").and_then(|v|v.as_bool()).unwrap_or(false);
    let connection = database.0.lock().map_err(|_| "Local database is busy".to_string())?;
    write_sync_value(&connection, "device_token", token)?;
    write_sync_value(&connection, "owner_device", if owner_device { "true" } else { "false" })?;
    connection.execute("UPDATE devices SET device_name=?1,last_seen_at=CURRENT_TIMESTAMP WHERE id=?2",params![device_name.trim(),device_id]).map_err(|e|e.to_string())?;
    Ok(PairingResult { device_id, owner_device })
}

fn build_local_snapshot(connection: &Connection) -> Result<serde_json::Value, String> {
    let business = connection.query_row(
        "SELECT id,name,currency,timezone,phone,email,address,logo_data_url FROM businesses ORDER BY created_at LIMIT 1",
        [], |r| Ok(serde_json::json!({
            "id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"currency":r.get::<_,String>(2)?,
            "timezone":r.get::<_,String>(3)?,"phone":r.get::<_,Option<String>>(4)?,"email":r.get::<_,Option<String>>(5)?,
            "address":r.get::<_,Option<String>>(6)?,"logoDataUrl":r.get::<_,Option<String>>(7)?
        }))
    ).optional().map_err(|e|e.to_string())?.ok_or_else(|| "Complete business setup before synchronising this computer.".to_string())?;
    let mut branch_statement=connection.prepare("SELECT id,name,code,status FROM branches ORDER BY created_at").map_err(|e|e.to_string())?;
    let branch_rows=branch_statement.query_map([],|r|Ok(serde_json::json!({
        "id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"code":r.get::<_,Option<String>>(2)?,"status":r.get::<_,String>(3)?
    }))).map_err(|e|e.to_string())?;
    let branches=branch_rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let mut staff_statement=connection.prepare(
        "SELECT p.id,p.business_id,p.display_name,p.role,p.branch_id,p.status,a.username,a.password_hash,a.status,a.must_change_password
         FROM staff_profiles p JOIN staff_accounts a ON a.staff_profile_id=p.id ORDER BY p.created_at"
    ).map_err(|e|e.to_string())?;
    let staff_rows=staff_statement.query_map([],|r|Ok(serde_json::json!({
        "profile":{"id":r.get::<_,String>(0)?,"businessId":r.get::<_,String>(1)?,"displayName":r.get::<_,String>(2)?,
            "role":r.get::<_,String>(3)?,"branchId":r.get::<_,Option<String>>(4)?,"status":r.get::<_,String>(5)?},
        "account":{"username":r.get::<_,String>(6)?,"passwordHash":r.get::<_,String>(7)?,
            "status":r.get::<_,String>(8)?,"mustChangePassword":r.get::<_,i64>(9)?==1}
    }))).map_err(|e|e.to_string())?;
    let staff=staff_rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"business":business,"branches":branches,"staff":staff}))
}

fn apply_remote_snapshot(connection: &mut Connection, snapshot: &serde_json::Value) -> Result<(), String> {
    let business=snapshot.get("business").ok_or_else(||"The cloud business profile is missing.".to_string())?;
    let business_id=business["id"].as_str().ok_or_else(||"The cloud business ID is invalid.".to_string())?;
    let name=business["name"].as_str().unwrap_or("Business");
    let currency=business["currency"].as_str().unwrap_or("KES");
    let timezone=business["timezone"].as_str().unwrap_or("Africa/Nairobi");
    let remote_staff_ids: Vec<&str> = snapshot["staff"].as_array().map(|rows| rows.iter().filter_map(|item| item["profile"]["id"].as_str()).collect()).unwrap_or_default();
    let local_staff_ids: Vec<String> = {
        let mut statement=connection.prepare("SELECT staff_profile_id FROM staff_accounts").map_err(|e|e.to_string())?;
        let rows=statement.query_map([],|row|row.get::<_,String>(0)).map_err(|e|e.to_string())?;
        let collected=rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        collected
    };
    if local_staff_ids.iter().any(|id| !remote_staff_ids.contains(&id.as_str())) {
        return Err("This computer already has a different local owner or staff account. Pairing cannot overwrite it. Use a clean Windows installation or contact support.".into());
    }
    let tx=connection.transaction().map_err(|e|e.to_string())?;
    tx.execute(
        "INSERT INTO businesses(id,name,currency,timezone,phone,email,address,logo_data_url)
         VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,currency=excluded.currency,timezone=excluded.timezone,
         phone=excluded.phone,email=excluded.email,address=excluded.address,logo_data_url=excluded.logo_data_url",
        params![business_id,name,currency,timezone,business["phone"].as_str(),business["email"].as_str(),
            business["address"].as_str(),business["logoDataUrl"].as_str()],
    ).map_err(|e|e.to_string())?;
    if let Some(branches)=snapshot["branches"].as_array() {
        for branch in branches {
            let id=branch["id"].as_str().ok_or_else(||"A cloud branch has no ID.".to_string())?;
            tx.execute(
                "INSERT INTO branches(id,business_id,name,code,status) VALUES(?1,?2,?3,?4,?5)
                 ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,status=excluded.status",
                params![id,business_id,branch["name"].as_str().unwrap_or("Branch"),branch["code"].as_str(),branch["status"].as_str().unwrap_or("active")],
            ).map_err(|e|e.to_string())?;
        }
    }
    if let Some(staff)=snapshot["staff"].as_array() {
        for item in staff {
            let profile=&item["profile"]; let account=&item["account"];
            let id=profile["id"].as_str().ok_or_else(||"A cloud staff profile has no ID.".to_string())?;
            let username=account["username"].as_str().ok_or_else(||"A cloud staff account has no username.".to_string())?;
            let hash=account["passwordHash"].as_str().ok_or_else(||"A cloud staff account has no password hash.".to_string())?;
            if !hash.starts_with("$argon2") { return Err("The cloud contains an unsupported staff password hash. No accounts were imported.".into()); }
            tx.execute(
                "INSERT INTO staff_profiles(id,business_id,display_name,role,branch_id,status) VALUES(?1,?2,?3,?4,?5,?6)
                 ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,branch_id=excluded.branch_id,status=excluded.status",
                params![id,business_id,profile["displayName"].as_str().unwrap_or("Staff"),profile["role"].as_str().unwrap_or("Cashier"),
                    profile["branchId"].as_str(),profile["status"].as_str().unwrap_or("active")],
            ).map_err(|e|e.to_string())?;
            tx.execute(
                "INSERT INTO staff_accounts(id,staff_profile_id,username,password_hash,status,must_change_password)
                 VALUES(?1,?2,?3,?4,?5,?6)
                 ON CONFLICT(staff_profile_id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,
                 status=excluded.status,must_change_password=excluded.must_change_password",
                params![Uuid::new_v4().to_string(),id,username,hash,account["status"].as_str().unwrap_or("active"),
                    if account["mustChangePassword"].as_bool().unwrap_or(false){1}else{0}],
            ).map_err(|e|e.to_string())?;
        }
    }
    tx.commit().map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn sync_desktop_workspace(database: tauri::State<'_, LocalDatabase>) -> Result<SyncResult, String> {
    let (token, owner_device, snapshot, pending_passwords) = {
        let connection=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
        let token=read_sync_value(&connection,"device_token")?.ok_or_else(||"Pair this computer with the online owner portal first.".to_string())?;
        let owner=read_sync_value(&connection,"owner_device")?.unwrap_or_default()=="true";
        let snapshot=if owner { Some(build_local_snapshot(&connection)?) } else { None };
        let pending: Vec<serde_json::Value> = read_sync_value(&connection,"pending_password_sync")?
            .and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default();
        (token,owner,snapshot,pending)
    };
    let client=reqwest::Client::new();
    let mut pending_applied = pending_passwords.is_empty();
    for change in &pending_passwords {
        let response=client.post(format!("{DESKTOP_API_BASE}/desktop/sync/password")).bearer_auth(&token)
            .json(change).send().await.map_err(|e|format!("Could not synchronise the staff password change: {e}"))?;
        let status=response.status();
        let body:serde_json::Value=response.json().await.map_err(|e|e.to_string())?;
        if status.is_success() {
            pending_applied = true;
        } else if !(owner_device && status == reqwest::StatusCode::CONFLICT) {
            return Err(body["error"].as_str().unwrap_or("The staff password change could not be synchronised.").to_string());
        }
    }
    let mut push_snapshot: Option<serde_json::Value> = None;
    if let Some(snapshot)=snapshot {
        let response=client.post(format!("{DESKTOP_API_BASE}/desktop/sync/push")).bearer_auth(&token)
            .json(&serde_json::json!({"snapshot":snapshot})).send().await
            .map_err(|e|format!("Could not upload this computer's changes: {e}"))?;
        let status=response.status(); let body:serde_json::Value=response.json().await.map_err(|e|e.to_string())?;
        if !status.is_success(){return Err(body["error"].as_str().unwrap_or("Cloud upload failed.").to_string());}
        push_snapshot=body.get("snapshot").cloned();
        pending_applied = true;
    }
    if pending_applied && !pending_passwords.is_empty() {
        let connection=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
        write_sync_value(&connection,"pending_password_sync","[]")?;
    }
    if let Some(remote) = push_snapshot {
        let mut connection=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
        apply_remote_snapshot(&mut connection,&remote)?;
    }
    let response=client.get(format!("{DESKTOP_API_BASE}/desktop/sync/pull")).bearer_auth(&token).send().await
        .map_err(|e|format!("Could not download the latest business data: {e}"))?;
    let status=response.status(); let body:serde_json::Value=response.json().await.map_err(|e|e.to_string())?;
    if !status.is_success(){return Err(body["error"].as_str().unwrap_or("Cloud download failed.").to_string());}
    let remote=body.get("snapshot").filter(|v|!v.is_null()).ok_or_else(||"The primary owner computer has not uploaded a business snapshot yet. Sync the primary computer first.".to_string())?;
    let updated_at=body["updatedAt"].as_str().unwrap_or("").to_string();
    let branches=remote["branches"].as_array().map(|x|x.len()).unwrap_or(0);
    let staff=remote["staff"].as_array().map(|x|x.len()).unwrap_or(0);
    if !owner_device {
        let mut connection=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
        apply_remote_snapshot(&mut connection,remote)?;
    }
    let connection=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    write_sync_value(&connection,"last_sync_at",&updated_at)?;
    Ok(SyncResult{owner_device,updated_at,branches,staff})
}


#[tauri::command]
fn get_pos_workspace(database: tauri::State<'_, LocalDatabase>, actor_staff_id: String) -> Result<serde_json::Value, String> {
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let actor: Option<(String,Option<String>)>=c.query_row("SELECT role,branch_id FROM staff_profiles WHERE id=?1 AND status='active'",[&actor_staff_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    let (role,assigned_branch)=actor.ok_or_else(||"Your staff account is inactive or unavailable.".to_string())?;
    let mut bs=c.prepare("SELECT id,name,code FROM branches WHERE status='active' ORDER BY name").map_err(|e|e.to_string())?;
    let branches=bs.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"code":r.get::<_,Option<String>>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let mut ps=c.prepare("SELECT id,name,sku,unit,buying_price,selling_price FROM products WHERE status='active' ORDER BY name").map_err(|e|e.to_string())?;
    let products=ps.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"sku":r.get::<_,String>(2)?,"unit":r.get::<_,String>(3)?,"buyingPrice":r.get::<_,f64>(4)?,"sellingPrice":r.get::<_,f64>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let mut stock=Vec::new();
    for p in &products {
        let pid=p["id"].as_str().unwrap_or_default();
        let mut st=c.prepare("SELECT branch_id,COALESCE(SUM(CASE WHEN movement_type IN ('RECEIPT','RETURN') THEN quantity WHEN movement_type='SALE' THEN -quantity ELSE 0 END),0) FROM stock_movements WHERE product_id=?1 GROUP BY branch_id").map_err(|e|e.to_string())?;
        let rows=st.query_map([pid],|r|Ok(serde_json::json!({"branchId":r.get::<_,String>(0)?,"quantity":r.get::<_,f64>(1)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for row in rows { stock.push(serde_json::json!({"productId":pid,"branchId":row["branchId"],"quantity":row["quantity"]})); }
    }
    let open_shift: Option<serde_json::Value>=c.query_row("SELECT id,branch_id,opening_float,opened_at FROM pos_shifts WHERE cashier_staff_id=?1 AND status='OPEN' ORDER BY opened_at DESC LIMIT 1",[&actor_staff_id],|r|Ok(serde_json::json!({"id":r.get::<_,String>(0)?,"branchId":r.get::<_,String>(1)?,"openingFloat":r.get::<_,f64>(2)?,"openedAt":r.get::<_,String>(3)?}))).optional().map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"role":role,"assignedBranchId":assigned_branch,"branches":branches,"products":products,"stock":stock,"openShift":open_shift}))
}

#[tauri::command]
fn create_pos_product(database:tauri::State<'_,LocalDatabase>,actor_staff_id:String,name:String,sku:String,unit:String,buying_price:f64,selling_price:f64)->Result<serde_json::Value,String>{
    let name=name.trim();let sku=sku.trim().to_uppercase();let unit=unit.trim();
    if name.len()<2||name.len()>160||sku.len()<2||sku.len()>60||unit.is_empty()||unit.len()>30{return Err("Enter a product name, SKU and stock unit.".into());}
    if !buying_price.is_finite()||buying_price<0||!selling_price.is_finite()||selling_price<0{return Err("Enter valid non-negative prices.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let role:Option<String>=c.query_row("SELECT role FROM staff_profiles WHERE id=?1 AND status='active'",[&actor_staff_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    if !matches!(role.as_deref(),Some("Business Owner")|Some("Storekeeper")){return Err("Only the Business Owner or Storekeeper can add products.".into());}
    let business:String=c.query_row("SELECT id FROM businesses ORDER BY created_at LIMIT 1",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let id=Uuid::new_v4().to_string();
    c.execute("INSERT INTO products(id,business_id,name,sku,unit,buying_price,selling_price) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id,business,name,sku,unit,buying_price,selling_price]).map_err(|e|if e.to_string().contains("UNIQUE"){"That SKU is already in use.".to_string()}else{e.to_string()})?;
    c.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id,details_json) VALUES(?1,?2,'PRODUCT_CREATED','product',?3,?4)",params![Uuid::new_v4().to_string(),actor_staff_id,id,serde_json::json!({"name":name,"sku":sku}).to_string()]).map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"id":id,"name":name,"sku":sku,"unit":unit,"buyingPrice":buying_price,"sellingPrice":selling_price}))
}

#[tauri::command]
fn receive_pos_stock(database:tauri::State<'_,LocalDatabase>,actor_staff_id:String,product_id:String,branch_id:String,quantity:f64,unit_cost:f64,reference:Option<String>)->Result<(),String>{
    if !quantity.is_finite()||quantity<=0||!unit_cost.is_finite()||unit_cost<0{return Err("Enter a positive quantity and a valid unit cost.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let role:Option<String>=c.query_row("SELECT role FROM staff_profiles WHERE id=?1 AND status='active'",[&actor_staff_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    if !matches!(role.as_deref(),Some("Business Owner")|Some("Storekeeper")){return Err("Only the Business Owner or Storekeeper can receive stock.".into());}
    let valid:i64=c.query_row("SELECT COUNT(*) FROM products WHERE id=?1 AND status='active'",[&product_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    let branch:i64=c.query_row("SELECT COUNT(*) FROM branches WHERE id=?1 AND status='active'",[&branch_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if valid==0||branch==0{return Err("Select a valid product and active branch.".into());}
    let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
    let movement=Uuid::new_v4().to_string();
    tx.execute("INSERT INTO stock_movements(id,product_id,branch_id,movement_type,quantity,unit_cost,total_cost,reference,actor_staff_id) VALUES(?1,?2,?3,'RECEIPT',?4,?5,?6,?7,?8)",params![movement,product_id,branch_id,quantity,unit_cost,quantity*unit_cost,reference,actor_staff_id]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id,details_json) VALUES(?1,?2,'STOCK_RECEIVED','stock_movement',?3,?4)",params![Uuid::new_v4().to_string(),actor_staff_id,movement,serde_json::json!({"productId":product_id,"branchId":branch_id,"quantity":quantity,"unitCost":unit_cost}).to_string()]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())
}

#[tauri::command]
fn open_pos_shift(database:tauri::State<'_,LocalDatabase>,actor_staff_id:String,branch_id:String,opening_float:f64)->Result<serde_json::Value,String>{
    if !opening_float.is_finite()||opening_float<0{return Err("Enter a valid non-negative opening float.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let role:Option<(String,Option<String>)>=c.query_row("SELECT role,branch_id FROM staff_profiles WHERE id=?1 AND status='active'",[&actor_staff_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    let (role,assigned)=role.ok_or_else(||"Staff account is inactive.".to_string())?;
    if !["Business Owner","Manager","Cashier","Supervisor"].contains(&role.as_str()){return Err("Your role is not permitted to operate the POS.".into());}
    if assigned.as_deref().is_some_and(|id|id!=branch_id){return Err("You can only open a shift at your assigned branch.".into());}
    let exists:i64=c.query_row("SELECT COUNT(*) FROM branches WHERE id=?1 AND status='active'",[&branch_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if exists==0{return Err("Select an active branch.".into());}
    let open:i64=c.query_row("SELECT COUNT(*) FROM pos_shifts WHERE cashier_staff_id=?1 AND status='OPEN'",[&actor_staff_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if open>0{return Err("You already have an open cashier shift.".into());}
    let id=Uuid::new_v4().to_string();
    c.execute("INSERT INTO pos_shifts(id,branch_id,cashier_staff_id,opening_float) VALUES(?1,?2,?3,?4)",params![id,branch_id,actor_staff_id,opening_float]).map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"id":id,"branchId":branch_id,"openingFloat":opening_float,"status":"OPEN"}))
}

#[tauri::command]
fn process_pos_sale(database:tauri::State<'_,LocalDatabase>,actor_staff_id:String,branch_id:String,shift_id:String,items:Vec<serde_json::Value>,payment_method:String,payment_reference:Option<String>)->Result<serde_json::Value,String>{
    if items.is_empty()||items.len()>80{return Err("Add between 1 and 80 sale lines.".into());}
    let method=payment_method.trim().to_uppercase();
    if !["CASH","MPESA"].contains(&method.as_str()){return Err("Select Cash or M-Pesa.".into());}
    if method=="MPESA"&&payment_reference.as_deref().unwrap_or("").trim().is_empty(){return Err("Enter the M-Pesa transaction reference.".into());}
    let c=database.0.lock().map_err(|_|"Local database is busy".to_string())?;
    let shift:i64=c.query_row("SELECT COUNT(*) FROM pos_shifts WHERE id=?1 AND cashier_staff_id=?2 AND branch_id=?3 AND status='OPEN'",params![shift_id,actor_staff_id,branch_id],|r|r.get(0)).map_err(|e|e.to_string())?;
    if shift==0{return Err("Open a cashier shift for this branch before taking payment.".into());}
    let tx=c.unchecked_transaction().map_err(|e|e.to_string())?;
    let mut total=0.0f64;let mut lines=Vec::new();
    for item in &items{
        let pid=item["productId"].as_str().ok_or_else(||"A sale line is missing its product.".to_string())?;
        let qty=item["quantity"].as_f64().ok_or_else(||"Enter a valid sale quantity.".to_string())?;
        if !qty.is_finite()||qty<=0{return Err("Sale quantities must be greater than zero.".into());}
        let product:(String,String,f64,f64)=tx.query_row("SELECT name,unit,selling_price,buying_price FROM products WHERE id=?1 AND status='active'",[pid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?.ok_or_else(||"A selected product is no longer active.".to_string())?;
        let stock:f64=tx.query_row("SELECT COALESCE(SUM(CASE WHEN movement_type IN ('RECEIPT','RETURN') THEN quantity WHEN movement_type='SALE' THEN -quantity ELSE 0 END),0) FROM stock_movements WHERE product_id=?1 AND branch_id=?2",params![pid,branch_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let already:f64=lines.iter().filter(|x:&&serde_json::Value|x["productId"].as_str()==Some(pid)).map(|x|x["quantity"].as_f64().unwrap_or(0.0)).sum();
        if qty+already>stock+0.000001{return Err(format!("Insufficient stock for {}. Available: {}",product.0,(stock-already).max(0.0)));}
        let price=item["unitPrice"].as_f64().unwrap_or(product.2);
        if !price.is_finite()||price<0{return Err("Sale price cannot be negative.".into());}
        let line_total=(qty*price*100.0).round()/100.0;total+=line_total;
        let unit_cost=product.3;
        lines.push(serde_json::json!({"productId":pid,"name":product.0,"quantity":qty,"unitPrice":price,"unitCost":unit_cost,"lineTotal":line_total}));
    }
    total=(total*100.0).round()/100.0;
    let receipt=format!("HR-{}",Uuid::new_v4().simple().to_string().chars().take(12).collect::<String>().to_uppercase());
    let sale_id=Uuid::new_v4().to_string();
    tx.execute("INSERT INTO sales(id,receipt_number,branch_id,shift_id,cashier_staff_id,total,payment_method,payment_reference) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![sale_id,receipt,branch_id,shift_id,actor_staff_id,total,method,payment_reference]).map_err(|e|e.to_string())?;
    for line in &lines{
        let item_id=Uuid::new_v4().to_string();
        tx.execute("INSERT INTO sale_items(id,sale_id,product_id,product_name,quantity,unit_price,unit_cost,line_total) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![item_id,sale_id,line["productId"].as_str(),line["name"].as_str(),line["quantity"].as_f64(),line["unitPrice"].as_f64(),line["unitCost"].as_f64(),line["lineTotal"].as_f64()]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO stock_movements(id,product_id,branch_id,movement_type,quantity,unit_cost,total_cost,reference,actor_staff_id) VALUES(?1,?2,?3,'SALE',?4,?5,?6,?7,?8)",params![Uuid::new_v4().to_string(),line["productId"].as_str(),branch_id,line["quantity"].as_f64(),line["unitCost"].as_f64(),line["quantity"].as_f64().unwrap_or(0.0)*line["unitCost"].as_f64().unwrap_or(0.0),receipt,actor_staff_id]).map_err(|e|e.to_string())?;
    }
    tx.execute("INSERT INTO audit_events(id,actor_staff_id,event_type,entity_type,entity_id,details_json) VALUES(?1,?2,'POS_SALE_COMPLETED','sale',?3,?4)",params![Uuid::new_v4().to_string(),actor_staff_id,sale_id,serde_json::json!({"receiptNumber":receipt,"total":total,"paymentMethod":method}).to_string()]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e|e.to_string())?;
    Ok(serde_json::json!({"id":sale_id,"receiptNumber":receipt,"total":total,"paymentMethod":method,"items":lines}))
}


pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = database_path(app.handle()).map_err(std::io::Error::other)?;
            let connection = Connection::open(path).map_err(std::io::Error::other)?;
            initialize_schema(&connection).map_err(std::io::Error::other)?;
            app.manage(LocalDatabase(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_local_status,
            setup_owner,
            login_staff,
            get_business_profile,
            save_business_profile,
            list_branches,
            create_branch,
            list_staff,
            create_staff,
            list_devices,
            change_staff_password,
            get_device_sync_status,
            activate_desktop_licence,
            pair_desktop_device,
            generate_desktop_pairing_code,
            sync_desktop_workspace,
            get_pos_workspace,
            create_pos_product,
            receive_pos_stock,
            open_pos_shift,
            process_pos_sale
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hardware Retail Management System");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_schema_initialises_with_sync_and_staff_tables() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema should initialise");

        let device_id: String = connection
            .query_row("SELECT value FROM app_meta WHERE key = 'device_id'", [], |row| row.get(0))
            .expect("device identity should be generated");
        assert!(!device_id.is_empty());

        let outbox_table: i64 = connection
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sync_outbox'", [], |row| row.get(0))
            .expect("sync outbox table should exist");
        let accounts_table: i64 = connection
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='staff_accounts'", [], |row| row.get(0))
            .expect("staff accounts table should exist");
        assert_eq!(outbox_table, 1);
        assert_eq!(accounts_table, 1);
    }

    #[test]
    fn password_hash_is_salted_and_verifiable() {
        let hash = hash_password("a-long-test-password").expect("hash should be generated");
        assert_ne!(hash, "a-long-test-password");
        assert!(verify_password("a-long-test-password", &hash).expect("verification should run"));
        assert!(!verify_password("a-different-password", &hash).expect("verification should run"));
    }
}