import { randomUUID } from 'node:crypto';
import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
  SellerMember, CreateSellerMemberInput, UpdateSellerMemberInput,
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
  Agent, AgentStatus, AgentBank, AgentKyc, StoreOnboardingRequest,
  GeoPoint,
} from './types.js';
import { loadDevData, persistUsers, persistSellers, persistMembers, persistAgents, persistAgentBanks, persistAgentKycs, persistOnboarding } from './dev-persistence.js';

// ── UserRepository ────────────────────────────────────────────────────────────

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByPhoneAndType(phone: string, type: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}

// Base dev seed users — overridden by dev-data.json if it exists
const SEED_USERS: User[] = [
  { id: 'user-s112', name: 'Seller 112', phone: '+919000000112', type: 'seller', verified: true,  createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'user-s113', name: 'Seller 113', phone: '+919000000113', type: 'seller', verified: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
  { id: 'user-s105', name: 'Seller 105', phone: '+919000000105', type: 'seller', verified: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

export class InMemoryUserRepository implements UserRepository {
  private store: Map<string, User>;

  constructor() {
    const saved = loadDevData();
    const users = saved?.users?.length ? saved.users : SEED_USERS;
    this.store = new Map(users.map(u => [u.id, u]));
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.phone === phone) return user;
    }
    return null;
  }

  async findByPhoneAndType(phone: string, type: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.phone === phone && user.type === type) return user;
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const user: User = { ...input, id: randomUUID(), verified: false, createdAt: now, updatedAt: now };
    this.store.set(user.id, user);
    persistUsers([...this.store.values()]);
    return user;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: User = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    persistUsers([...this.store.values()]);
    return updated;
  }
}

// ── AddressRepository ─────────────────────────────────────────────────────────

export interface AddressRepository {
  findByUserId(userId: string): Promise<Address[]>;
  findById(id: string): Promise<Address | null>;
  clearDefaultForUser(userId: string): Promise<void>;
  create(userId: string, input: CreateAddressInput, coords: GeoPoint): Promise<Address>;
  update(id: string, input: UpdateAddressInput & Partial<GeoPoint>): Promise<Address | null>;
  delete(id: string): Promise<boolean>;
}

export class InMemoryAddressRepository implements AddressRepository {
  private store = new Map<string, Address>();

  async findByUserId(userId: string): Promise<Address[]> {
    return [...this.store.values()].filter(a => a.userId === userId);
  }

  async findById(id: string): Promise<Address | null> {
    return this.store.get(id) ?? null;
  }

  async clearDefaultForUser(userId: string): Promise<void> {
    for (const address of this.store.values()) {
      if (address.userId === userId && address.isDefault) {
        this.store.set(address.id, { ...address, isDefault: false, updatedAt: new Date().toISOString() });
      }
    }
  }

  async create(userId: string, input: CreateAddressInput, coords: GeoPoint): Promise<Address> {
    const now = new Date().toISOString();
    const address: Address = {
      ...input,
      ...coords,
      id:        randomUUID(),
      userId,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(address.id, address);
    return address;
  }

  async update(id: string, input: UpdateAddressInput & Partial<GeoPoint>): Promise<Address | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Address = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }
}

// ── SellerRepository ──────────────────────────────────────────────────────────

export interface SellerRepository {
  findAll(filters?: {
    type?: string;
    verified?: boolean;
    userId?: string;
    phone?: string;
  }): Promise<Seller[]>;
  findById(id: string): Promise<Seller | null>;
  findByPhone(phone: string): Promise<Seller | null>;
  findByUserId(userId: string): Promise<Seller[]>;
  create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller>;
  update(id: string, input: UpdateSellerInput): Promise<Seller | null>;
  addDocument(id: string, url: string): Promise<Seller | null>;
  removeDocument(id: string, url: string): Promise<Seller | null>;
  verify(id: string): Promise<Seller | null>;
}

export class InMemorySellerRepository implements SellerRepository {
  private store: Map<string, Seller>;

  constructor() {
    const saved = loadDevData();
    if (saved?.sellers?.length) {
      this.store = new Map(saved.sellers.map(s => [s.id, s]));
    } else {
      this.store = new Map<string, Seller>();
      this.seed();
    }
  }

  async findAll(filters?: {
    type?: string;
    verified?: boolean;
    userId?: string;
    phone?: string;
  }): Promise<Seller[]> {
    let results = [...this.store.values()];
    if (filters?.type     !== undefined) results = results.filter(s => s.type     === filters.type);
    if (filters?.verified !== undefined) results = results.filter(s => s.verified === filters.verified);
    if (filters?.userId   !== undefined) results = results.filter(s => s.userId   === filters.userId);
    if (filters?.phone    !== undefined) results = results.filter(s => s.phone    === filters.phone);
    return results;
  }

  async findById(id: string): Promise<Seller | null> {
    return this.store.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<Seller | null> {
    for (const seller of this.store.values()) {
      if (seller.phone === phone) return seller;
    }
    return null;
  }

  async findByUserId(userId: string): Promise<Seller[]> {
    return [...this.store.values()].filter(s => s.userId === userId);
  }

  async create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller> {
    const now = new Date().toISOString();
    const seller: Seller = {
      ...input, ...coords,
      id: randomUUID(), verified: false, documentUrls: [], createdAt: now, updatedAt: now,
    };
    this.store.set(seller.id, seller);
    persistSellers([...this.store.values()]);
    return seller;
  }

  async update(id: string, input: UpdateSellerInput): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Seller = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    persistSellers([...this.store.values()]);
    return updated;
  }

  async addDocument(id: string, url: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    if (existing.documentUrls.includes(url)) return existing;
    const updated: Seller = { ...existing, documentUrls: [...existing.documentUrls, url], updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    persistSellers([...this.store.values()]);
    return updated;
  }

  async removeDocument(id: string, url: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Seller = { ...existing, documentUrls: existing.documentUrls.filter(u => u !== url), updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    persistSellers([...this.store.values()]);
    return updated;
  }

  async verify(id: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const verified: Seller = { ...existing, verified: true, verifiedAt: now, updatedAt: now };
    this.store.set(id, verified);
    persistSellers([...this.store.values()]);
    return verified;
  }

  // ── Seed data ──────────────────────────────────────────────────────────────
  // Only sellers linked to a dev user account are seeded. Unlinked sellers
  // were removed — they have no login path and pollute catalog lookups.
  private seed() {
    const now = new Date().toISOString();

    const sellers: Seller[] = [
      {
        id: 'seller-112', userId: 'user-s112',
        name: 'Desi Dairy Armoor', type: 'dairy',
        phone: '+919000000112', location: 'Armoor, Nizamabad', pincode: '503111',
        lat: 18.435, lng: 78.330,
        deliveryZones: ['mandal', 'district'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000112',
        description: 'Fresh milk, curd and paneer sourced directly from our Armoor farm.',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-113', userId: 'user-s113',
        name: 'Amma Kitchen', type: 'homefood',
        phone: '+919000000113', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['mandal', 'district', 'state'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000113',
        description: 'Traditional Telangana pickles and home-made snacks made with love.',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-105', userId: 'user-s105',
        name: 'Spice Route Nizamabad', type: 'farmer',
        phone: '+919000000105', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000105',
        description: 'Organic turmeric, chillies and seasonal vegetables from Nizamabad district.',
        createdAt: now, updatedAt: now,
      },
    ];

    for (const seller of sellers) {
      this.store.set(seller.id, seller);
    }
    persistSellers([...this.store.values()]);
  }
}

// ── SellerMemberRepository ────────────────────────────────────────────────────

export interface SellerMemberRepository {
  findBySellerId(sellerId: string): Promise<SellerMember[]>;
  findById(id: string): Promise<SellerMember | null>;
  findBySellerAndPhone(sellerId: string, phone: string): Promise<SellerMember | null>;
  findActiveByUserId(userId: string): Promise<SellerMember[]>;
  findPendingByPhone(phone: string): Promise<SellerMember[]>;
  create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember>;
  update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null>;
  activate(id: string, userId: string): Promise<SellerMember | null>;
  delete(id: string): Promise<boolean>;
}

export class InMemorySellerMemberRepository implements SellerMemberRepository {
  private store: Map<string, SellerMember>;

  constructor() {
    const saved = loadDevData();
    const members = saved?.members ?? [];
    this.store = new Map(members.map(m => [m.id, m]));
  }

  async findBySellerId(sellerId: string): Promise<SellerMember[]> {
    return [...this.store.values()].filter(m => m.sellerId === sellerId);
  }

  async findById(id: string): Promise<SellerMember | null> {
    return this.store.get(id) ?? null;
  }

  async findBySellerAndPhone(sellerId: string, phone: string): Promise<SellerMember | null> {
    for (const m of this.store.values()) {
      if (m.sellerId === sellerId && m.phone === phone) return m;
    }
    return null;
  }

  async findActiveByUserId(userId: string): Promise<SellerMember[]> {
    return [...this.store.values()].filter(m => m.userId === userId && m.status === 'active');
  }

  async findPendingByPhone(phone: string): Promise<SellerMember[]> {
    return [...this.store.values()].filter(m => m.phone === phone && m.status === 'pending');
  }

  async create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember> {
    const member: SellerMember = {
      ...input,
      id:         randomUUID(),
      sellerId,
      status:     'pending',
      invitedAt:  new Date().toISOString(),
    };
    this.store.set(member.id, member);
    persistMembers([...this.store.values()]);
    return member;
  }

  async update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: SellerMember = { ...existing, ...input };
    this.store.set(id, updated);
    persistMembers([...this.store.values()]);
    return updated;
  }

  async activate(id: string, userId: string): Promise<SellerMember | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: SellerMember = {
      ...existing,
      userId,
      status:   'active',
      joinedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    persistMembers([...this.store.values()]);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.store.delete(id);
    if (deleted) persistMembers([...this.store.values()]);
    return deleted;
  }
}

// ── BankAccountRepository ─────────────────────────────────────────────────────

export interface BankAccountRepository {
  findBySellerId(sellerId: string): Promise<BankAccount | null>;
  upsert(sellerId: string, input: CreateBankAccountInput): Promise<BankAccount>;
  update(sellerId: string, input: UpdateBankAccountInput): Promise<BankAccount | null>;
}

export class InMemoryBankAccountRepository implements BankAccountRepository {
  private store = new Map<string, BankAccount>(); // keyed by sellerId

  async findBySellerId(sellerId: string): Promise<BankAccount | null> {
    return this.store.get(sellerId) ?? null;
  }

  async upsert(sellerId: string, input: CreateBankAccountInput): Promise<BankAccount> {
    const now = new Date().toISOString();
    const existing = this.store.get(sellerId);
    const account: BankAccount = {
      ...input,
      id:        existing?.id ?? randomUUID(),
      sellerId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.set(sellerId, account);
    return account;
  }

  async update(sellerId: string, input: UpdateBankAccountInput): Promise<BankAccount | null> {
    const existing = this.store.get(sellerId);
    if (!existing) return null;
    const updated: BankAccount = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(sellerId, updated);
    return updated;
  }
}

// ── AgentRepository ───────────────────────────────────────────────────────────

export interface AgentRepository {
  findByUserId(userId: string): Promise<Agent | null>;
  upsert(userId: string, input: Partial<Omit<Agent, 'id' | 'userId' | 'createdAt'>>): Promise<Agent>;
}

// Charset excludes visually confusable characters: 0/O, 1/I
const AGT_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateAgentId(existingIds: Set<string>): string {
  let id: string;
  do {
    let code = '';
    for (let i = 0; i < 6; i++) code += AGT_CHARS[Math.floor(Math.random() * AGT_CHARS.length)];
    id = `AGT-${code}`;
  } while (existingIds.has(id));
  return id;
}

const SEED_AGENTS: Agent[] = [
  { id: 'AGT-DEV001', userId: 'agent-001', name: 'Dev Agent', phone: '+919000000099', zone: 'Hyderabad', status: 'available', totalDeliveries: 0, rating: 5.0, kycVerified: false, bankLinked: false, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
];

export class InMemoryAgentRepository implements AgentRepository {
  private store: Map<string, Agent>;   // keyed by userId

  constructor() {
    const saved  = loadDevData();
    const agents = saved?.agents?.length ? saved.agents : SEED_AGENTS;
    this.store   = new Map(agents.map(a => [a.userId, a]));
  }

  async findByUserId(userId: string): Promise<Agent | null> {
    return this.store.get(userId) ?? null;
  }

  async upsert(userId: string, input: Partial<Omit<Agent, 'id' | 'userId' | 'createdAt'>>): Promise<Agent> {
    const now      = new Date().toISOString();
    const existing = this.store.get(userId);
    const agent: Agent = existing
      ? { ...existing, ...input, updatedAt: now }
      : {
          id: generateAgentId(new Set([...this.store.values()].map(a => a.id))),
          userId, name: '', phone: '', zone: '', status: 'available' as AgentStatus,
          totalDeliveries: 0, rating: 5.0, kycVerified: false, bankLinked: false,
          createdAt: now, updatedAt: now, ...input,
        };
    this.store.set(userId, agent);
    persistAgents([...this.store.values()]);
    return agent;
  }
}

// ── AgentBankRepository ───────────────────────────────────────────────────────

export interface AgentBankRepository {
  upsert(agentId: string, input: Omit<AgentBank, 'agentId' | 'updatedAt'>): Promise<AgentBank>;
}

export class InMemoryAgentBankRepository implements AgentBankRepository {
  private store: Map<string, AgentBank>;

  constructor() {
    const saved = loadDevData();
    this.store  = new Map((saved?.agentBanks ?? []).map(b => [b.agentId, b]));
  }

  async upsert(agentId: string, input: Omit<AgentBank, 'agentId' | 'updatedAt'>): Promise<AgentBank> {
    const record: AgentBank = { ...input, agentId, updatedAt: new Date().toISOString() };
    this.store.set(agentId, record);
    persistAgentBanks([...this.store.values()]);
    return record;
  }
}

// ── AgentKycRepository ────────────────────────────────────────────────────────

export interface AgentKycRepository {
  upsert(agentId: string, input: Omit<AgentKyc, 'agentId' | 'updatedAt'>): Promise<AgentKyc>;
}

export class InMemoryAgentKycRepository implements AgentKycRepository {
  private store: Map<string, AgentKyc>;

  constructor() {
    const saved = loadDevData();
    this.store  = new Map((saved?.agentKycs ?? []).map(k => [k.agentId, k]));
  }

  async upsert(agentId: string, input: Omit<AgentKyc, 'agentId' | 'updatedAt'>): Promise<AgentKyc> {
    const record: AgentKyc = { ...input, agentId, updatedAt: new Date().toISOString() };
    this.store.set(agentId, record);
    persistAgentKycs([...this.store.values()]);
    return record;
  }
}

// ── OnboardingRepository ──────────────────────────────────────────────────────

export interface OnboardingRepository {
  list(): Promise<StoreOnboardingRequest[]>;
  review(id: string, status: 'approved' | 'rejected', notes?: string, agentId?: string): Promise<StoreOnboardingRequest | null>;
}

const SEED_ONBOARDING: StoreOnboardingRequest[] = [
  { id: 'onb-001', storeName: 'Ramaiah Vegetables', ownerName: 'Ramaiah', phone: '+919876543210', location: 'Kondapur, Hyderabad', pincode: '500084', storeType: 'farmer', status: 'pending', submittedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'onb-002', storeName: 'Lakshmi Dairy',      ownerName: 'Lakshmi Devi', phone: '+919876543211', location: 'Kukatpally, Hyderabad', pincode: '500072', storeType: 'dairy',  status: 'pending', submittedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'onb-003', storeName: 'Srinivas Kirana',    ownerName: 'Srinivas Rao', phone: '+919876543212', location: 'LB Nagar, Hyderabad',  pincode: '500074', storeType: 'kirana', status: 'approved', submittedAt: new Date(Date.now() - 5 * 86400000).toISOString(), notes: 'Documents verified' },
];

export class InMemoryOnboardingRepository implements OnboardingRepository {
  private store: Map<string, StoreOnboardingRequest>;

  constructor() {
    const saved = loadDevData();
    const data  = saved?.onboarding?.length ? saved.onboarding : SEED_ONBOARDING;
    this.store  = new Map(data.map(r => [r.id, r]));
  }

  async list(): Promise<StoreOnboardingRequest[]> {
    return [...this.store.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async review(id: string, status: 'approved' | 'rejected', notes?: string, agentId?: string): Promise<StoreOnboardingRequest | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: StoreOnboardingRequest = { ...existing, status, ...(notes ? { notes } : {}), ...(agentId ? { reviewedByAgentId: agentId } : {}) };
    this.store.set(id, updated);
    persistOnboarding([...this.store.values()]);
    return updated;
  }
}
