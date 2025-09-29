const { getDb } = require('./database');

let dbInstance = null;

function initializeDb() {
  if (!dbInstance) {
    dbInstance = getDb();
  }
  return dbInstance;
}

module.exports = { initializeDb };