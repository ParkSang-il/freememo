(function () {
    const T = {
        en: {
            // Sidebar
            bookmarks:          "Bookmarks",
            searchPlaceholder:  "Search bookmarks...",
            hintHtml:           "<kbd>Ctrl+B</kbd> Bookmark / <kbd>Ctrl+Shift+B</kbd> Section / <kbd>Ctrl+Shift+S</kbd> Star",
            markerSection:      "## Section",
            markerBookmark:     "@@ Bookmark",
            markerStar:         "★ Star",
            noBookmarks:        "(no bookmarks)",
            noSearchResults:    "(no results)",

            // Editor
            saving:             "Saving...",
            saved:              "Saved",

            // Tabs
            newTabName:         "New Memo",
            tabAddTitle:        "New Tab (Ctrl+T)",
            tabCloseTitle:      "Close (Ctrl+W)",
            closeTabConfirm:    (n) => `Close "${n}"?`,
            lastTabWarning:     "Cannot close the last tab.",
            otherTabLabel:      (n) => `↗ ${n}`,

            // Settings panel
            settingsFont:       "Font",
            settingsSize:       "Size",
            settingsLineHeight: "Line height",
            settingsColor:      "Color",
            settingsReset:      "Reset",
            settingsLanguage:   "Language",

            // Toasts
            bookmarksDetected:  (n) => `📌 ${n} bookmark(s) detected`,
            bookmarkHint:       "💡 Use Ctrl+B to add a bookmark",

            // Selection toolbar
            selBold:            "Bold",
            selBigger:          "Bigger",
            selSmaller:         "Smaller",
            selClear:           "Clear format",

            // License screen
            licenseDesc:        "A license key is required to use this software.",
            licenseInputPH:     "Enter license key (e.g. XXXX-XXXX-XXXX-XXXX)",
            licenseActivateBtn: "Activate",
            licenseActivating:  "Verifying...",
            licenseSuccess:     "✅ Activated!",
            licenseBuyBtn:      "🛒 Buy on Gumroad",
        },
        ko: {
            bookmarks:          "책갈피",
            searchPlaceholder:  "책갈피 검색...",
            hintHtml:           "<kbd>Ctrl+B</kbd> 책갈피 / <kbd>Ctrl+Shift+B</kbd> 섹션 / <kbd>Ctrl+Shift+S</kbd> 중요",
            markerSection:      "## 섹션",
            markerBookmark:     "@@ 책갈피",
            markerStar:         "★ 중요",
            noBookmarks:        "(책갈피 없음)",
            noSearchResults:    "(검색 결과 없음)",

            saving:             "저장 중...",
            saved:              "저장됨",

            newTabName:         "새 메모",
            tabAddTitle:        "새 탭 (Ctrl+T)",
            tabCloseTitle:      "닫기 (Ctrl+W)",
            closeTabConfirm:    (n) => `"${n}" 탭을 닫으시겠습니까?`,
            lastTabWarning:     "마지막 탭은 닫을 수 없습니다.",
            otherTabLabel:      (n) => `↗ ${n}`,

            settingsFont:       "폰트",
            settingsSize:       "크기",
            settingsLineHeight: "행간",
            settingsColor:      "글자색",
            settingsReset:      "초기화",
            settingsLanguage:   "언어",

            bookmarksDetected:  (n) => `📌 책갈피 ${n}개 자동 인식`,
            bookmarkHint:       "💡 Ctrl+B로 책갈피 추가",

            selBold:            "굵게",
            selBigger:          "크게",
            selSmaller:         "작게",
            selClear:           "서식 제거",

            licenseDesc:        "이 소프트웨어를 사용하려면 라이선스 키가 필요합니다.",
            licenseInputPH:     "라이선스 키 입력 (예: XXXX-XXXX-XXXX-XXXX)",
            licenseActivateBtn: "활성화",
            licenseActivating:  "확인 중...",
            licenseSuccess:     "✅ 활성화 완료!",
            licenseBuyBtn:      "🛒 Gumroad에서 구매하기",
        },
    };

    let lang = "en";

    window.i18n = {
        setLang(l) { lang = T[l] ? l : "en"; },
        getLang()  { return lang; },
        t(key, ...args) {
            const val = (T[lang] ?? T.en)[key] ?? T.en[key] ?? key;
            return typeof val === "function" ? val(...args) : val;
        },
        apply() {
            document.querySelectorAll("[data-i18n]").forEach(el => {
                el.textContent = this.t(el.dataset.i18n);
            });
            document.querySelectorAll("[data-i18n-html]").forEach(el => {
                el.innerHTML = this.t(el.dataset.i18nHtml);
            });
            document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
                el.placeholder = this.t(el.dataset.i18nPlaceholder);
            });
            document.querySelectorAll("[data-i18n-title]").forEach(el => {
                el.title = this.t(el.dataset.i18nTitle);
            });
        },
    };

    // 단축 함수
    window.t = (key, ...args) => window.i18n.t(key, ...args);
})();