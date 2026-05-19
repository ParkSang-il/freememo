const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const initSqlJs = require("sql.js");

if (require("electron-squirrel-startup")) app.quit();

const dbPath = path.join(app.getPath("userData"), "memos.db");
let db;

function saveDatabase() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

function dbRows(sql, params = []) {
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map(row =>
        Object.fromEntries(cols.map((c, i) => [c, row[i]]))
    );
}

async function initDatabase() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        db = new SQL.Database(fs.readFileSync(dbPath));
    } else {
        db = new SQL.Database();
    }

    db.run(`CREATE TABLE IF NOT EXISTS notepad (
        id INTEGER PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '메모',
        content TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);

    // 기존 notepad → 첫 번째 탭으로 마이그레이션
    const tabCount = db.exec("SELECT COUNT(*) FROM tabs")[0].values[0][0];
    if (tabCount === 0) {
        let oldContent = "";
        try {
            const r = db.exec("SELECT content FROM notepad WHERE id = 1");
            if (r.length > 0 && r[0].values.length > 0) oldContent = r[0].values[0][0] || "";
        } catch (_) {}
        db.run(
            "INSERT INTO tabs (name, content, sort_order, created_at, updated_at) VALUES ('메모', ?, 0, ?, ?)",
            [oldContent, Date.now(), Date.now()]
        );
    }

    saveDatabase();
}

app.whenReady().then(async () => {
    await initDatabase();

    ipcMain.handle("tabs:load", () =>
        dbRows("SELECT id, name, content, sort_order FROM tabs ORDER BY sort_order ASC, id ASC")
    );

    ipcMain.handle("tabs:save", (_, { id, content }) => {
        db.run("UPDATE tabs SET content=?, updated_at=? WHERE id=?", [content, Date.now(), id]);
        saveDatabase();
        return true;
    });

    ipcMain.handle("tabs:create", (_, { name }) => {
        const maxOrd = db.exec("SELECT COALESCE(MAX(sort_order), 0) FROM tabs")[0].values[0][0];
        db.run(
            "INSERT INTO tabs (name, content, sort_order, created_at, updated_at) VALUES (?, '', ?, ?, ?)",
            [name || "새 메모", maxOrd + 1, Date.now(), Date.now()]
        );
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        saveDatabase();
        return newId;
    });

    ipcMain.handle("tabs:rename", (_, { id, name }) => {
        db.run("UPDATE tabs SET name=?, updated_at=? WHERE id=?", [name, Date.now(), id]);
        saveDatabase();
        return true;
    });

    ipcMain.handle("tabs:delete", (_, { id }) => {
        db.run("DELETE FROM tabs WHERE id=?", [id]);
        const count = db.exec("SELECT COUNT(*) FROM tabs")[0].values[0][0];
        if (count === 0) {
            db.run(
                "INSERT INTO tabs (name, content, sort_order, created_at, updated_at) VALUES ('메모', '', 0, ?, ?)",
                [Date.now(), Date.now()]
            );
        }
        saveDatabase();
        return true;
    });

    ipcMain.handle("state:get", (_, key) => {
        const r = db.exec("SELECT value FROM app_state WHERE key=?", [key]);
        return r.length && r[0].values.length ? r[0].values[0][0] : null;
    });

    ipcMain.handle("state:set", (_, { key, value }) => {
        db.run("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)", [key, String(value)]);
        saveDatabase();
        return true;
    });

    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: { preload: path.join(__dirname, "preload.js") },
    });
    mainWindow.loadFile(path.join(__dirname, "index.html"));

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            new BrowserWindow({
                width: 1200, height: 800,
                webPreferences: { preload: path.join(__dirname, "preload.js") },
            }).loadFile(path.join(__dirname, "index.html"));
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});