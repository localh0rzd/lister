import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

// jsdom has no IndexedDB. Assigned explicitly: a bare `fake-indexeddb/auto` import is dropped by
// the bundler as side-effect free.
Object.assign(globalThis, { indexedDB: new IDBFactory(), IDBKeyRange });
