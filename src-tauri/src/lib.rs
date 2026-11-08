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

    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let business_id = Uuid::new_v4().to_string();
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
            change_staff_password
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
