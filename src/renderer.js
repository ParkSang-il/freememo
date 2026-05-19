// DOM
const bookmarkList  = document.getElementById("bookmark-list");
const bookmarkCount = document.getElementById("bookmark-count");
const searchInput   = document.getElementById("search-input");
const status        = document.getElementById("status");
const charCount     = document.getElementById("char-count");
const toast         = document.getElementById("toast");
const tabListEl     = document.getElementById("tab-list");
const tabAddBtn     = document.getElementById("tab-add");

// 상태
let tabs        = [];   // [{id, name, content, sort_order}]
let activeTabId = null;
let tabContents = {};   // {id: string} 인메모리 캐시
let tabStylesCache = {}; // {id: [{from,to,css}]} 직렬화된 마크
let dividerWidgets  = [];
let prevDividerKey  = "";
let saveTimers  = {};
let toastTimer  = null;

// ── CodeMirror 초기화 ──────────────────────────────────────────
const editor = CodeMirror(document.getElementById("editor-container"), {
    lineNumbers:   true,
    lineWrapping:  true,
    indentWithTabs: false,
    tabSize:       2,
    extraKeys: {
        "Ctrl-B":         () => insertMarkerAtCurrentLine("@@ "),
        "Ctrl-Shift-B":   () => insertMarkerAtCurrentLine("## "),
        "Ctrl-Shift-S":   () => insertMarkerAtCurrentLine("★ "),
        "Tab":            (cm) => cm.replaceSelection("  "),
        "Ctrl-T":         () => createNewTab(),
        "Ctrl-W":         () => closeActiveTab(),
        "Ctrl-Tab":       () => switchRelativeTab(1),
        "Ctrl-Shift-Tab": () => switchRelativeTab(-1),
    },
});

// ── 인라인 서식 (마크) ────────────────────────────────────────
function posToOffset(pos) {
    const text = editor.getValue();
    const lines = text.split("\n");
    let off = 0;
    for (let i = 0; i < pos.line; i++) off += lines[i].length + 1;
    return off + pos.ch;
}

function offsetToPos(offset) {
    const text = editor.getValue();
    const lines = text.split("\n");
    let rem = offset;
    for (let i = 0; i < lines.length; i++) {
        if (rem <= lines[i].length) return { line: i, ch: rem };
        rem -= lines[i].length + 1;
    }
    return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

function serializeMarks() {
    return editor.getAllMarks()
        .filter(m => m.__css)
        .map(m => {
            const pos = m.find();
            if (!pos) return null;
            return { from: posToOffset(pos.from), to: posToOffset(pos.to), css: m.__css };
        })
        .filter(Boolean);
}

function applySerializedMarks(marksData) {
    if (!marksData?.length) return;
    marksData.forEach(({ from, to, css }) => {
        if (from >= to) return;
        try {
            const mark = editor.markText(offsetToPos(from), offsetToPos(to),
                { css, inclusiveLeft: false, inclusiveRight: false });
            mark.__css = css;
        } catch (_) {}
    });
}

function clearEditorMarks() {
    editor.getAllMarks().filter(m => m.__css).forEach(m => m.clear());
}

async function loadTabStyles(tabId) {
    if (tabStylesCache[tabId]) {
        applySerializedMarks(tabStylesCache[tabId]);
        return;
    }
    const raw = await window.api.getState(`tab_styles_${tabId}`);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            tabStylesCache[tabId] = data;
            applySerializedMarks(data);
        } catch (_) {}
    }
}

async function saveTabStyles(tabId) {
    const marks = serializeMarks();
    tabStylesCache[tabId] = marks;
    await window.api.setState(`tab_styles_${tabId}`, JSON.stringify(marks));
}

// ── 책갈피 추출 ───────────────────────────────────────────────
function extractBookmarks(text) {
    const result = [];
    text.split("\n").forEach((line, index) => {
        const t = line.trim();
        if (!t) return;
        const sec = t.match(/^##\s*(.+)$/);
        if (sec)  { result.push({ line: index, type: "manual-section", icon: "📑", label: sec[1].slice(0, 50) }); return; }
        const bm  = t.match(/^@@\s*(.+)$/);
        if (bm)   { result.push({ line: index, type: "manual",         icon: "🔖", label: bm[1].slice(0, 50) }); return; }
        const str = t.match(/^★\s*(.+)$/);
        if (str)  { result.push({ line: index, type: "manual-star",    icon: "⭐", label: str[1].slice(0, 50) }); }
    });
    return result;
}

// ── 분단 구분선 ───────────────────────────────────────────────
function updateDividers() {
    const bms = extractBookmarks(editor.getValue());
    const key = bms.map(b => `${b.line}:${b.type}`).join("|");
    if (key === prevDividerKey) return;
    prevDividerKey = key;

    dividerWidgets.forEach(w => w.clear());
    dividerWidgets = [];

    bms.forEach(b => {
        const wrap = document.createElement("div");
        wrap.className = `bookmark-divider bookmark-divider-${b.type}`;
        wrap.appendChild(document.createElement("hr"));
        dividerWidgets.push(editor.addLineWidget(b.line, wrap, { above: true, noHScroll: true }));
    });
}

// ── 책갈피 사이드바 (전체 탭) ─────────────────────────────────
function renderBookmarks() {
    const filter = searchInput.value.trim().toLowerCase();
    bookmarkList.innerHTML = "";
    let total = 0;

    tabs.forEach(tab => {
        const content = tab.id === activeTabId
            ? editor.getValue()
            : (tabContents[tab.id] ?? tab.content);
        const bms = extractBookmarks(content);
        const filtered = filter ? bms.filter(b => b.label.toLowerCase().includes(filter)) : bms;
        if (!filtered.length) return;
        total += filtered.length;

        const isCurrent = tab.id === activeTabId;
        filtered.forEach(b => {
            const li = document.createElement("li");
            li.className = `type-${b.type}`;
            const tabTag = isCurrent
                ? `<span class="bm-tab-cur">${escapeHtml(tab.name)}</span>`
                : `<span class="bm-tab-other">↗ ${escapeHtml(tab.name)}</span>`;
            li.innerHTML = `<span class="icon">${b.icon}</span><span class="label">${escapeHtml(b.label)}</span>${tabTag}`;
            li.title = `[${tab.name}] ${b.label}`;
            li.addEventListener("click", () => {
                if (!isCurrent) {
                    switchToTab(tab.id);
                    setTimeout(() => jumpToLine(b.line), 60);
                } else {
                    jumpToLine(b.line);
                }
            });
            bookmarkList.appendChild(li);
        });
    });

    if (total === 0) {
        const empty = document.createElement("li");
        empty.textContent = filter ? "(검색 결과 없음)" : "(책갈피 없음)";
        empty.style.cssText = "color:#555;cursor:default";
        bookmarkList.appendChild(empty);
    }
    bookmarkCount.textContent = String(total);
}

// ── 탭 바 렌더링 ──────────────────────────────────────────────
function renderTabs() {
    tabListEl.innerHTML = "";
    tabs.forEach(tab => {
        const div = document.createElement("div");
        div.className = "tab" + (tab.id === activeTabId ? " active" : "");
        div.dataset.id = tab.id;

        const nameSpan = document.createElement("span");
        nameSpan.className = "tab-name";
        nameSpan.textContent = tab.name;

        const closeBtn = document.createElement("button");
        closeBtn.className = "tab-close";
        closeBtn.textContent = "×";
        closeBtn.title = "닫기 (Ctrl+W)";
        closeBtn.addEventListener("click", e => { e.stopPropagation(); closeTab(tab.id); });

        div.append(nameSpan, closeBtn);
        div.addEventListener("click", () => switchToTab(tab.id));
        div.addEventListener("dblclick", e => { e.stopPropagation(); startRenaming(tab.id, div, nameSpan); });
        tabListEl.appendChild(div);
    });

    // 활성 탭이 보이도록 스크롤
    const activeEl = tabListEl.querySelector(".tab.active");
    if (activeEl) activeEl.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ── 탭 이름 변경 ──────────────────────────────────────────────
function startRenaming(tabId, tabDiv, nameSpan) {
    const original = tabs.find(t => t.id === tabId)?.name || "";
    const input = document.createElement("input");
    input.className = "tab-rename-input";
    input.value = original;
    tabDiv.replaceChild(input, nameSpan);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
        if (done) return;
        done = true;
        const newName = input.value.trim() || original;
        nameSpan.textContent = newName;
        tabDiv.replaceChild(nameSpan, input);
        if (save && newName !== original) {
            const tab = tabs.find(t => t.id === tabId);
            if (tab) tab.name = newName;
            await window.api.renameTab(tabId, newName);
            renderBookmarks();
        }
    };

    input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
}

// ── 탭 전환 ───────────────────────────────────────────────────
function switchToTab(tabId) {
    if (activeTabId === tabId) return;

    // 현재 탭 내용·마크 캐시
    if (activeTabId !== null) {
        tabContents[activeTabId] = editor.getValue();
        tabStylesCache[activeTabId] = serializeMarks();
    }

    activeTabId = tabId;
    const content = tabContents[tabId] ?? (tabs.find(t => t.id === tabId)?.content || "");

    clearEditorMarks();
    editor.setValue(content);
    editor.clearHistory();
    prevDividerKey = "";
    loadTabStyles(tabId);
    updateDividers();
    renderTabs();
    renderBookmarks();
    charCount.textContent = `${content.length}자`;
    status.textContent = "저장됨";
    status.style.color = "#4ec9b0";

    window.api.setState("activeTabId", String(tabId));
    editor.focus();
}

// ── 이전/다음 탭 ──────────────────────────────────────────────
function switchRelativeTab(delta) {
    const idx = tabs.findIndex(t => t.id === activeTabId);
    if (idx === -1 || tabs.length < 2) return;
    switchToTab(tabs[(idx + delta + tabs.length) % tabs.length].id);
}

// ── 새 탭 생성 ────────────────────────────────────────────────
async function createNewTab() {
    const newId = await window.api.createTab("새 메모");
    tabs.push({ id: newId, name: "새 메모", content: "", sort_order: tabs.length });
    tabContents[newId] = "";
    switchToTab(newId);
}

// ── 탭 닫기 ───────────────────────────────────────────────────
async function closeTab(tabId) {
    if (tabs.length <= 1) { showToast("마지막 탭은 닫을 수 없습니다."); return; }
    const tab = tabs.find(t => t.id === tabId);
    if (!confirm(`"${tab?.name}" 탭을 닫으시겠습니까?`)) return;

    const idx = tabs.findIndex(t => t.id === tabId);
    const nextTab = tabs[idx + 1] || tabs[idx - 1];

    await window.api.deleteTab(tabId);
    tabs = tabs.filter(t => t.id !== tabId);
    delete tabContents[tabId];
    clearTimeout(saveTimers[tabId]);
    delete saveTimers[tabId];

    if (tabId === activeTabId) {
        activeTabId = null;
        switchToTab(nextTab.id);
    } else {
        renderTabs();
        renderBookmarks();
    }
}

function closeActiveTab() {
    if (activeTabId !== null) closeTab(activeTabId);
}

// ── 점프 ──────────────────────────────────────────────────────
function jumpToLine(lineIndex) {
    const margin = editor.getScrollerElement().clientHeight / 3;
    editor.scrollIntoView({ line: lineIndex, ch: 0 }, margin);
    editor.setCursor({ line: lineIndex, ch: 0 });
    editor.focus();
    editor.addLineClass(lineIndex, "wrap", "highlight-line");
    setTimeout(() => editor.removeLineClass(lineIndex, "wrap", "highlight-line"), 1000);
}

// ── 마커 삽입 ─────────────────────────────────────────────────
function insertMarkerAtCurrentLine(marker) {
    const cur = editor.getCursor();
    const line = editor.getLine(cur.line) || "";
    const clean = line.replace(/^(##|@@|★)\s*/, "");
    editor.replaceRange(marker + clean, { line: cur.line, ch: 0 }, { line: cur.line, ch: line.length });
    editor.setCursor({ line: cur.line, ch: marker.length });
    editor.focus();
    onEditorChange();
}

function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

// ── 토스트 ────────────────────────────────────────────────────
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

// ── 자동 저장 ─────────────────────────────────────────────────
function scheduleAutoSave() {
    if (activeTabId === null) return;
    const tabId = activeTabId;
    tabContents[tabId] = editor.getValue();     // 즉시 캐시 갱신
    status.textContent = "저장 중...";
    status.style.color = "#dcdcaa";
    clearTimeout(saveTimers[tabId]);
    tabStylesCache[tabId] = serializeMarks();
    saveTimers[tabId] = setTimeout(async () => {
        await window.api.saveTab(tabId, tabContents[tabId] ?? "");
        await window.api.setState(`tab_styles_${tabId}`, JSON.stringify(tabStylesCache[tabId] ?? []));
        if (activeTabId === tabId) {
            status.textContent = "저장됨";
            status.style.color = "#4ec9b0";
        }
    }, 500);
}

// ── 에디터 변경 공통 처리 ─────────────────────────────────────
function onEditorChange() {
    updateDividers();
    renderBookmarks();
    charCount.textContent = `${editor.getValue().length}자`;
    scheduleAutoSave();
}

// 붙여넣기 감지
let bmCountBeforePaste = 0;
editor.on("beforeChange", (cm, change) => {
    if (change.origin === "paste") {
        bmCountBeforePaste = extractBookmarks(cm.getValue()).length;
    }
});

editor.on("change", (_, change) => {
    onEditorChange();
    if (change.origin === "paste") {
        setTimeout(() => {
            const added = extractBookmarks(editor.getValue()).length - bmCountBeforePaste;
            if (added > 0) showToast(`📌 책갈피 ${added}개 자동 인식 — Ctrl+B로 추가 가능`);
            else if (change.text?.length > 1) showToast("💡 책갈피가 필요하면 Ctrl+B");
        }, 0);
    }
});

// ── 글로벌 단축키 (에디터 포커스 밖) ─────────────────────────
document.addEventListener("keydown", e => {
    if (e.ctrlKey && !e.shiftKey && e.key === "t")   { e.preventDefault(); createNewTab(); }
    if (e.ctrlKey && !e.shiftKey && e.key === "w")   { e.preventDefault(); closeActiveTab(); }
    if (e.ctrlKey && !e.shiftKey && e.key === "Tab") { e.preventDefault(); switchRelativeTab(1); }
    if (e.ctrlKey && e.shiftKey  && e.key === "Tab") { e.preventDefault(); switchRelativeTab(-1); }
});

searchInput.addEventListener("input", renderBookmarks);
tabAddBtn.addEventListener("click", createNewTab);

// ── 선택 영역 서식 툴바 ───────────────────────────────────────
const selToolbar = document.getElementById("sel-toolbar");
let selRange = null; // 툴바 클릭 전 저장된 선택 범위

// 툴바 mousedown: 버튼 클릭 시 에디터 포커스/선택 유지
selToolbar.addEventListener("mousedown", e => {
    if (e.target.type !== "color") e.preventDefault();
    if (editor.somethingSelected()) {
        selRange = { from: editor.getCursor("from"), to: editor.getCursor("to") };
    }
});

function getSelRange() {
    if (editor.somethingSelected()) {
        return { from: editor.getCursor("from"), to: editor.getCursor("to") };
    }
    return selRange;
}

function addMark(css) {
    const r = getSelRange();
    if (!r) return;
    const mark = editor.markText(r.from, r.to,
        { css, inclusiveLeft: false, inclusiveRight: false });
    mark.__css = css;
    scheduleAutoSave();
}

// 선택 시 툴바 위치 갱신
editor.on("cursorActivity", () => {
    if (editor.somethingSelected()) {
        positionSelToolbar();
        selToolbar.classList.remove("hidden");
    } else {
        selToolbar.classList.add("hidden");
        selRange = null;
    }
});

function positionSelToolbar() {
    const coords = editor.charCoords(editor.getCursor("to"), "window");
    const tbH = selToolbar.offsetHeight || 34;
    let top  = coords.top - tbH - 8;
    let left = coords.left;
    if (top < 4) top = coords.bottom + 4;
    const maxLeft = window.innerWidth - (selToolbar.offsetWidth || 220) - 4;
    left = Math.max(4, Math.min(left, maxLeft));
    selToolbar.style.top  = `${top}px`;
    selToolbar.style.left = `${left}px`;
}

// 글자색
const selColorInput = document.getElementById("sel-color");
selColorInput.addEventListener("mousedown", () => {
    if (editor.somethingSelected()) {
        selRange = { from: editor.getCursor("from"), to: editor.getCursor("to") };
    }
});
selColorInput.addEventListener("input", e => {
    const r = selRange ?? getSelRange();
    if (!r) return;
    editor.setSelection(r.from, r.to);
    addMark(`color:${e.target.value}`);
});

// 굵게
document.getElementById("sel-bold").addEventListener("click", () => addMark("font-weight:700"));

// 크게 (1.3em)
document.getElementById("sel-size-up").addEventListener("click", () => addMark("font-size:1.3em"));

// 작게 (0.8em)
document.getElementById("sel-size-down").addEventListener("click", () => addMark("font-size:0.8em"));

// 서식 제거
document.getElementById("sel-clear").addEventListener("click", () => {
    const r = getSelRange();
    if (!r) return;
    editor.findMarks(r.from, r.to).filter(m => m.__css).forEach(m => m.clear());
    scheduleAutoSave();
});

// ── 편집기 설정 ───────────────────────────────────────────────
const SETTING_DEFAULTS = { fontFamily: "Consolas,'D2Coding',monospace", fontSize: 13, lineHeight: 1.65, fontColor: "#d4d4d4" };
let editorSettings = { ...SETTING_DEFAULTS };

function applyEditorSettings() {
    const wrap = editor.getWrapperElement();
    wrap.style.fontFamily = editorSettings.fontFamily;
    wrap.style.fontSize   = `${editorSettings.fontSize}px`;
    wrap.style.lineHeight = String(editorSettings.lineHeight);
    wrap.style.color      = editorSettings.fontColor;
    editor.refresh();
}

function saveEditorSettings() {
    window.api.setState("editorSettings", JSON.stringify(editorSettings));
}

async function loadEditorSettings() {
    const raw = await window.api.getState("editorSettings");
    if (raw) {
        try { editorSettings = { ...SETTING_DEFAULTS, ...JSON.parse(raw) }; } catch (_) {}
    }
    // UI 동기화
    document.getElementById("font-family").value     = editorSettings.fontFamily;
    document.getElementById("font-size-val").textContent = editorSettings.fontSize;
    document.getElementById("line-height").value     = editorSettings.lineHeight;
    document.getElementById("line-height-val").textContent = editorSettings.lineHeight.toFixed(2);
    document.getElementById("font-color").value      = editorSettings.fontColor;
    applyEditorSettings();
}

// 설정 패널 토글
document.getElementById("settings-btn").addEventListener("click", () => {
    document.getElementById("settings-panel").classList.toggle("hidden");
});

// 폰트 패밀리
document.getElementById("font-family").addEventListener("change", e => {
    editorSettings.fontFamily = e.target.value;
    applyEditorSettings(); saveEditorSettings();
});

// 폰트 크기
document.getElementById("font-size-up").addEventListener("click", () => {
    if (editorSettings.fontSize >= 24) return;
    editorSettings.fontSize++;
    document.getElementById("font-size-val").textContent = editorSettings.fontSize;
    applyEditorSettings(); saveEditorSettings();
});
document.getElementById("font-size-down").addEventListener("click", () => {
    if (editorSettings.fontSize <= 10) return;
    editorSettings.fontSize--;
    document.getElementById("font-size-val").textContent = editorSettings.fontSize;
    applyEditorSettings(); saveEditorSettings();
});

// 행간
document.getElementById("line-height").addEventListener("input", e => {
    editorSettings.lineHeight = parseFloat(e.target.value);
    document.getElementById("line-height-val").textContent = editorSettings.lineHeight.toFixed(2);
    applyEditorSettings(); saveEditorSettings();
});

// 글자색
document.getElementById("font-color").addEventListener("input", e => {
    editorSettings.fontColor = e.target.value;
    applyEditorSettings(); saveEditorSettings();
});

// 초기화
document.getElementById("settings-reset").addEventListener("click", () => {
    editorSettings = { ...SETTING_DEFAULTS };
    document.getElementById("font-family").value             = SETTING_DEFAULTS.fontFamily;
    document.getElementById("font-size-val").textContent     = SETTING_DEFAULTS.fontSize;
    document.getElementById("line-height").value             = SETTING_DEFAULTS.lineHeight;
    document.getElementById("line-height-val").textContent   = SETTING_DEFAULTS.lineHeight.toFixed(2);
    document.getElementById("font-color").value              = SETTING_DEFAULTS.fontColor;
    applyEditorSettings(); saveEditorSettings();
});

// ── 초기화 ────────────────────────────────────────────────────
(async function init() {
    await loadEditorSettings();
    tabs = await window.api.loadTabs();
    tabs.forEach(tab => { tabContents[tab.id] = tab.content; });

    // 마지막 활성 탭 복원
    const savedId  = await window.api.getState("activeTabId");
    const savedNum = savedId ? parseInt(savedId, 10) : null;
    const target   = savedNum ? tabs.find(t => t.id === savedNum) : null;
    activeTabId    = target ? target.id : (tabs[0]?.id ?? null);

    if (activeTabId !== null) {
        const content = tabContents[activeTabId] || "";
        editor.setValue(content);
        editor.clearHistory();
        updateDividers();
        await loadTabStyles(activeTabId);
        charCount.textContent = `${content.length}자`;
    }

    renderTabs();
    renderBookmarks();
    editor.focus();
})();