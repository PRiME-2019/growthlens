// Lazy DuckDB-WASM singleton from vendored same-origin assets. ESM. Attaches to window.GL.
import * as duckdb from '../vendor/duckdb/duckdb-browser.mjs';

let _dbPromise = null;

async function instantiate() {
  const bundle = {
    mainModule: new URL('../vendor/duckdb/duckdb-eh.wasm', import.meta.url).href,
    mainWorker: new URL('../vendor/duckdb/duckdb-browser-eh.worker.js', import.meta.url).href,
  };
  const worker = new Worker(bundle.mainWorker);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  return db;
}

export function getDB() {
  if (!_dbPromise) {
    _dbPromise = instantiate().catch((err) => {
      _dbPromise = null; // don't cache a failed init — let the next upload retry instead of a page reload
      return Promise.reject(err);
    });
  }
  return _dbPromise;
}
let _connPromise = null;

export function getConnection() {
  // One shared connection — callers issue sequential queries, and opening a
  // fresh connection per call leaked them (nothing ever closed one).
  if (!_connPromise) {
    _connPromise = getDB().then((db) => db.connect()).catch((err) => {
      _connPromise = null; // same retry semantics as getDB
      return Promise.reject(err);
    });
  }
  return _connPromise;
}

window.GL = window.GL || {};
window.GL.getDB = getDB;
window.GL.getConnection = getConnection;
