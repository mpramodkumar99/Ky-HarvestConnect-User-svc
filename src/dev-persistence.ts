/**
 * Dev-only JSON file persistence.
 * Repositories call the persist* helpers after every mutation so that
 * users, stores, and invites survive a process restart during development.
 * In production this file is never imported.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User, Seller, SellerMember } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);
const DATA_FILE  = resolve(__dir, '..', 'dev-data.json');

export interface DevData {
  users:   User[];
  sellers: Seller[];
  members: SellerMember[];
}

// Shared snapshot — each repository owns its slice; flush writes them all together
const snapshot: DevData = { users: [], sellers: [], members: [] };

export function loadDevData(): DevData | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    const raw = readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) as DevData;
  } catch {
    return null;
  }
}

export function persistUsers(users: User[]): void {
  snapshot.users = users;
  flush();
}

export function persistSellers(sellers: Seller[]): void {
  snapshot.sellers = sellers;
  flush();
}

export function persistMembers(members: SellerMember[]): void {
  snapshot.members = members;
  flush();
}

function flush(): void {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}
