const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    loadTabs:  ()           => ipcRenderer.invoke("tabs:load"),
    saveTab:   (id, content)=> ipcRenderer.invoke("tabs:save",   { id, content }),
    createTab: (name)       => ipcRenderer.invoke("tabs:create", { name }),
    renameTab: (id, name)   => ipcRenderer.invoke("tabs:rename", { id, name }),
    deleteTab: (id)         => ipcRenderer.invoke("tabs:delete", { id }),
    getState:  (key)        => ipcRenderer.invoke("state:get",   key),
    setState:  (key, value) => ipcRenderer.invoke("state:set",   { key, value }),
});