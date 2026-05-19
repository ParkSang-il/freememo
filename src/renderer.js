const memoInput = document.getElementById("memo-input");
const bookmarkList = document.getElementById("bookmark-list");
const bookmarkCount = document.getElementById("bookmark-count");
const searchInput = document.getElementById("search-input");
const status = document.getElementById("status");
const charCount = document.getElementById("char-count");
const toast = document.getElementById("toast");

let bookmarks = [];
let saveTimer = null;
let toastTimer = null;

// === 책갈피 추출 ===
// === 책갈피 추출 (수동 마커만) ===
function extractBookmarks(text) {
    const lines = text.split("\n");
    const result = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // ## 섹션
        const sectionMatch = trimmed.match(/^##\s*(.+)$/);
        if (sectionMatch) {
            result.push({
                line: index,
                type: "manual-section",
                icon: "📑",
                label: sectionMatch[1].slice(0, 50),
            });
            return;
        }

        // @@ 일반 책갈피
        const bookmarkMatch = trimmed.match(/^@@\s*(.+)$/);
        if (bookmarkMatch) {
            result.push({
                line: index,
                type: "manual",
                icon: "🔖",
                label: bookmarkMatch[1].slice(0, 50),
            });
            return;
        }

        // ★ 중요
        const starMatch = trimmed.match(/^★\s*(.+)$/);
        if (starMatch) {
            result.push({
                line: index,
                type: "manual-star",
                icon: "⭐",
                label: starMatch[1].slice(0, 50),
            });
            return;
        }
    });

    return result;
}

// === 렌더링 ===
function renderBookmarks() {
    const filter = searchInput.value.trim().toLowerCase();
    const filtered = filter
        ? bookmarks.filter((b) => b.label.toLowerCase().includes(filter))
        : bookmarks;

    bookmarkList.innerHTML = "";
    bookmarkCount.textContent = filtered.length;

    if (filtered.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = filter ? "(검색 결과 없음)" : "(책갈피 없음)";
        empty.style.color = "#555";
        empty.style.cursor = "default";
        bookmarkList.appendChild(empty);
        return;
    }

    filtered.forEach((bookmark) => {
        const li = document.createElement("li");
        li.className = `type-${bookmark.type}`;
        li.innerHTML = `
      <span class="icon">${bookmark.icon}</span>
      <span class="label">${escapeHtml(bookmark.label)}</span>
    `;
        li.title = bookmark.label;

        li.addEventListener("click", () => {
            jumpToLine(bookmark.line);
        });

        bookmarkList.appendChild(li);
    });
}

// === 점프 ===
// === 점프 (정확한 위치 계산) ===
function jumpToLine(lineIndex) {
    const text = memoInput.value;
    const lines = text.split("\n");

    // 해당 줄의 시작 위치 (문자 인덱스)
    let pos = 0;
    for (let i = 0; i < lineIndex; i++) {
        pos += lines[i].length + 1;
    }
    const lineLength = lines[lineIndex]?.length || 0;

    memoInput.focus();
    memoInput.setSelectionRange(pos, pos + lineLength);

    // 미러 div로 정확한 Y 좌표 계산
    const mirror = createMirror(memoInput);
    mirror.textContent = text.slice(0, pos);

    // 마커 span을 추가해서 해당 위치의 좌표 측정
    const marker = document.createElement("span");
    marker.textContent = "\u200B"; // zero-width space
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const targetY = marker.offsetTop;
    document.body.removeChild(mirror);

    // 화면 가운데쯤 오도록 스크롤
    const viewportHeight = memoInput.clientHeight;
    memoInput.scrollTop = targetY - viewportHeight / 3;

    // 하이라이트
    memoInput.classList.remove("highlight");
    void memoInput.offsetWidth;
    memoInput.classList.add("highlight");
}

// === 미러 div 만들기 (textarea와 동일한 스타일) ===
function createMirror(textarea) {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");

    // textarea와 동일한 렌더링 환경 복제
    const propsToCopy = [
        "boxSizing",
        "width",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "letterSpacing",
        "textTransform",
        "wordSpacing",
        "lineHeight",
        "padding",
        "border",
        "whiteSpace",
        "wordWrap",
        "wordBreak",
        "tabSize",
    ];

    propsToCopy.forEach((prop) => {
        mirror.style[prop] = style[prop];
    });

    // 화면 밖에 숨기되 측정은 가능하도록
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    mirror.style.overflow = "hidden";
    mirror.style.height = "auto";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";

    return mirror;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// === 토스트 ===
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

// === 자동 저장 ===
function scheduleAutoSave() {
    status.textContent = "저장 중...";
    status.style.color = "#dcdcaa";

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        await window.api.saveNotepad(memoInput.value);
        status.textContent = "저장됨";
        status.style.color = "#4ec9b0";
    }, 500);
}

// === 현재 줄 시작 위치 찾기 ===
function getCurrentLineStart() {
    const pos = memoInput.selectionStart;
    const text = memoInput.value;
    let lineStart = pos;
    while (lineStart > 0 && text[lineStart - 1] !== "\n") {
        lineStart--;
    }
    return lineStart;
}

// === 현재 줄에 마커 삽입 ===
function insertMarkerAtCurrentLine(marker) {
    const lineStart = getCurrentLineStart();
    const text = memoInput.value;

    // 줄 시작에 이미 다른 마커가 있으면 교체
    const lineEnd = text.indexOf("\n", lineStart);
    const currentLine = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const cleanedLine = currentLine.replace(/^(##|@@|★)\s*/, "");

    const before = text.slice(0, lineStart);
    const after = text.slice(lineEnd === -1 ? text.length : lineEnd);
    const newText = before + marker + cleanedLine + after;

    memoInput.value = newText;

    // 커서를 마커 다음으로 이동
    const newCursorPos = lineStart + marker.length;
    memoInput.setSelectionRange(newCursorPos, newCursorPos);
    memoInput.focus();

    // 책갈피 재계산
    bookmarks = extractBookmarks(memoInput.value);
    renderBookmarks();
    charCount.textContent = `${memoInput.value.length}자`;
    scheduleAutoSave();
}

// === 입력 이벤트 ===
memoInput.addEventListener("input", () => {
    bookmarks = extractBookmarks(memoInput.value);
    renderBookmarks();
    charCount.textContent = `${memoInput.value.length}자`;
    scheduleAutoSave();
});

// === 단축키 ===
memoInput.addEventListener("keydown", (e) => {
    // Ctrl+Shift+B → ## 섹션
    if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        insertMarkerAtCurrentLine("## ");
        return;
    }

    // Ctrl+Shift+S → ★ 중요
    if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        insertMarkerAtCurrentLine("★ ");
        return;
    }

    // Ctrl+B → @@ 책갈피
    if (e.ctrlKey && !e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        insertMarkerAtCurrentLine("@@ ");
        return;
    }
});

// === 붙여넣기 감지 + 제안 ===
memoInput.addEventListener("paste", (e) => {
    const clipboardText = e.clipboardData.getData("text");
    if (!clipboardText) return;

    // 붙여넣을 텍스트에서 자동 인식 가능한 책갈피 카운트
    const beforeCount = bookmarks.length;

    // setTimeout으로 paste 적용 후 분석
    setTimeout(() => {
        const newBookmarks = extractBookmarks(memoInput.value);
        const addedCount = newBookmarks.length - beforeCount;

        if (addedCount > 0) {
            showToast(
                `📌 책갈피 ${addedCount}개 자동 인식 — 더 추가하려면 Ctrl+B`
            );
        } else if (clipboardText.split("\n").length > 1) {
            // 여러 줄 붙여넣었는데 책갈피가 안 잡혔으면 안내
            showToast(`💡 책갈피가 필요하면 Ctrl+B (현재 줄에 @@ 추가)`);
        }
    }, 100);
});

// === 검색 ===
searchInput.addEventListener("input", renderBookmarks);

// === 초기화 ===
(async function init() {
    const content = await window.api.loadNotepad();
    memoInput.value = content;
    bookmarks = extractBookmarks(content);
    renderBookmarks();
    charCount.textContent = `${content.length}자`;
    memoInput.focus();
})();