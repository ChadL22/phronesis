#!/usr/bin/env node

/**
 * Phronesis Newsletter — Sync subscribers from Cloudflare KV to local SQLite
 * 
 * Usage: node sync-subscribers.js
 * 
 * Creates/updates subscribers.db in the same directory.
 * Open with DB Browser for SQLite to browse.
 */

const NEWSLETTER_API = 'https://phronesis-newsletter.sclanga315.workers.dev/subscribers';
const DB_PATH = __dirname + '/subscribers.db';

async function main() {
  // 1. Fetch subscribers from the newsletter Worker
  console.log('Fetching subscribers from Cloudflare KV...');
  const res = await fetch(NEWSLETTER_API);
  if (!res.ok) {
    console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();
  console.log(`Found ${data.count} subscriber(s).`);

  // 2. Set up SQLite
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      email TEXT PRIMARY KEY,
      subscribed_at TEXT,
      source TEXT
    )
  `);

  // 3. Insert/update subscribers
  const upsert = db.prepare(`
    INSERT INTO subscribers (email, subscribed_at, source)
    VALUES (@email, @subscribed_at, @source)
    ON CONFLICT(email) DO UPDATE SET
      subscribed_at = @subscribed_at,
      source = @source
  `);

  const insertMany = db.transaction((subscribers) => {
    for (const sub of subscribers) {
      upsert.run({
        email: sub.email,
        subscribed_at: sub.subscribedAt || '',
        source: sub.source || '',
      });
    }
  });

  insertMany(data.subscribers);

  // 4. Verify
  const count = db.prepare('SELECT COUNT(*) as n FROM subscribers').get();
  console.log(`SQLite database updated: ${count.n} subscriber(s) in ${DB_PATH}`);
  console.log('Open with DB Browser for SQLite to browse.');

  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
