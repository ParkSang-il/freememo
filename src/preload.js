const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    loadNotepad: () => ipcRenderer.invoke("notepad:load"),
    saveNotepad: (content) => ipcRenderer.invoke("notepad:save", content),
});