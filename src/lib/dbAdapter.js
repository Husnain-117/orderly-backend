import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';

// Decide if we should use in-memory DB (Vercel runtime has read-only filesystem)
export function shouldUseMemoryDb() {
  // Allow override via env; default to memory on Vercel
  if (String(process.env.USE_MEMORY_DB || '').toLowerCase() === 'true') return true;
  if (process.env.VERCEL === '1') return true;
  // If explicitly marked read-only
  if (String(process.env.READONLY_FS || '').toLowerCase() === 'true') return true;
  return false;
}

export async function createDb(filePath, defaultData) {
  const useMemory = shouldUseMemoryDb();
  let db;
  if (useMemory) {
    // Lazy import Memory adapter to avoid ESM issues
    const { Memory } = await import('lowdb');
    const adapter = new Memory();
    db = new Low(adapter, defaultData);
    await db.read();
    if (!db.data) {
      // Try to seed from bundled JSON file if present (multiple fallbacks for serverless bundles)
      const candidates = [
        filePath,
        path.resolve(process.cwd(), 'data', path.basename(filePath)),
        path.resolve(process.cwd(), 'data', 'db.json'),
      ];
      let seeded = false;
      for (const p of candidates) {
        try {
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8');
            const seed = JSON.parse(raw);
            db.data = { ...defaultData, ...seed };
            seeded = true;
            break;
          }
        } catch {
          // continue to next candidate
        }
      }
      if (!seeded) {
        db.data = { ...defaultData };
      }
    }
    return { db, useMemory };
  } else {
    // Persistent JSON file for local/dev
    try {
      const dir = filePath.substring(0, filePath.lastIndexOf('/')) || filePath.substring(0, filePath.lastIndexOf('\\'));
      if (dir) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    const adapter = new JSONFile(filePath);
    db = new Low(adapter, defaultData);
    await db.read();
    db.data ||= { ...defaultData };
    await db.write();
    return { db, useMemory };
  }
}
