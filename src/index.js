const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const initSqlJs = require("sql.js");
// Squirrel 이벤트 처리 (설치/업데이트/제거 시 깜빡임 방지)
if (require("electron-squirrel-startup")) {
    app.quit();
}

const dbPath = path.join(app.getPath("userData"), "memos.db");
let db;
let SQL;

function saveDatabase() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initDatabase() {
    SQL = await initSqlJs();

    if (fs.existsSync(dbPath)) {
        const filebuffer = fs.readFileSync(dbPath);
        db = new SQL.Database(filebuffer);
    } else {
        db = new SQL.Database();
    }

    // 단일 행만 쓰는 테이블 (id=1에 모든 내용 저장)
    db.run(`
        CREATE TABLE IF NOT EXISTS notepad (
                                               id INTEGER PRIMARY KEY,
                                               content TEXT NOT NULL,
                                               updated_at INTEGER NOT NULL
        )
    `);

    // 초기 행이 없으면 만들기
    const result = db.exec("SELECT COUNT(*) FROM notepad");
    if (result[0].values[0][0] === 0) {
        db.run("INSERT INTO notepad (id, content, updated_at) VALUES (1, '', ?)", [
            Date.now(),
        ]);
    }

    saveDatabase();
    console.log("DB 초기화 완료:", dbPath);
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
    });

    mainWindow.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(async () => {
    await initDatabase();

    // 메모 전체 내용 가져오기
    ipcMain.handle("notepad:load", () => {
        const result = db.exec("SELECT content FROM notepad WHERE id = 1");
        if (result.length === 0) return "";
        return result[0].values[0][0] || "";
    });

    // 메모 전체 내용 저장
    ipcMain.handle("notepad:save", (event, content) => {
        db.run("UPDATE notepad SET content = ?, updated_at = ? WHERE id = 1", [
            content,
            Date.now(),
        ]);
        saveDatabase();
        return true;
    });

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});