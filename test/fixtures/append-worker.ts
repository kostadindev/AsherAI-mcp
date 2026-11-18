/** Appends N events to a session log from its own process: used by the cross-process state test. */
import { SessionStore } from '../../src/state.js';

const [path, count, id] = process.argv.slice(2);
if (!path || !count || !id) throw new Error('usage: append-worker <log path> <count> <id>');
const store = new SessionStore(path);
for (let i = 0; i < Number(count); i++) store.append({ type: 'ai-open', fileId: `${id}-${String(i)}` }, { type: 'check-text', note: id });
