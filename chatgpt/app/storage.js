/* Inside ChatGPT the PDF belongs to the host, so the editor keeps no session of its own. */
class SpacerStorage {
    read() { return Promise.resolve({}); }
    write() { return Promise.resolve(); }
    clear() { return Promise.resolve(); }
}
