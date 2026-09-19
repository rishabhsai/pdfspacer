/* PDF bytes and layout share one database and an atomic document replacement. */
class SpacerStorage {
    constructor() { this.queue = Promise.resolve(); }
    async transaction(action, mode = 'readonly') {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('pdfspacer', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('kv');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kv', mode);
            let result;
            tx.oncomplete = () => { db.close(); resolve(result); };
            tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Session storage failed.')); };
            action(tx.objectStore('kv'), value => { result = value; });
        });
    }
    read() {
        return this.transaction((store, done) => {
            const pdf = store.get('currentPDF');
            const layout = store.get('layout');
            layout.onsuccess = () => done({ pdf: pdf.result, layout: layout.result });
        });
    }
    write(pdf, layout) {
        const operation = this.queue.catch(() => {}).then(() => this.transaction(store => {
            if (pdf) store.put(pdf, 'currentPDF');
            store.put(layout, 'layout');
        }, 'readwrite'));
        this.queue = operation;
        return operation;
    }
    clear() {
        const operation = this.queue.catch(() => {}).then(() => this.transaction(store => {
            store.delete('currentPDF');
            store.delete('layout');
        }, 'readwrite'));
        this.queue = operation;
        return operation;
    }
}
