/**
 * Dev-only JSON file persistence.
 * Repositories call the persist* helpers after every mutation so that
 * users, stores, and invites survive a process restart during development.
 * In production this file is never imported.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User, Seller, SellerMember, Agent, AgentBank, AgentKyc, StoreOnboardingRequest } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);
const DATA_FILE  = resolve(__dir, '..', 'dev-data.json');

export interface DevData {
  users:       User[];
  sellers:     Seller[];
  members:     SellerMember[];
  agents:      Agent[];
  agentBanks:  AgentBank[];
  agentKycs:   AgentKyc[];
  onboarding:  StoreOnboardingRequest[];
}

const _initial = loadDevData();
const snapshot: DevData = {
  users:      _initial?.users      ?? [],
  sellers:    _initial?.sellers    ?? [],
  members:    _initial?.members    ?? [],
  agents:     _initial?.agents     ?? [],
  agentBanks: _initial?.agentBanks ?? [],
  agentKycs:  _initial?.agentKycs  ?? [],
  onboarding: _initial?.onboarding ?? [],
};

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

export function persistAgents(agents: Agent[]): void {
  snapshot.agents = agents;
  flush();
}

export function persistAgentBanks(agentBanks: AgentBank[]): void {
  snapshot.agentBanks = agentBanks;
  flush();
}

export function persistAgentKycs(agentKycs: AgentKyc[]): void {
  snapshot.agentKycs = agentKycs;
  flush();
}

export function persistOnboarding(onboarding: StoreOnboardingRequest[]): void {
  snapshot.onboarding = onboarding;
  flush();
}

function flush(): void {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}
