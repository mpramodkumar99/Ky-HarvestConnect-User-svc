import { randomUUID } from 'node:crypto';
import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
  SellerMember, CreateSellerMemberInput, UpdateSellerMemberInput,
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
  GeoPoint,
  WishlistItem, CartItem, UpsertCartItemInput,
  WalletTransaction,
  Referral,
} from './types.js';

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I, O, 0, 1
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── UserRepository ────────────────────────────────────────────────────────────

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByReferralCode(code: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
  verify(id: string): Promise<User | null>;
}

export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  constructor() { this.seed(); }

  private seed() {
    const now = new Date().toISOString();
    const devUsers: User[] = [
      { id: 'user-b001', name: 'Dev Buyer 1',   phone: '+919000000001', type: 'buyer',  verified: true, walletBalance: 0, createdAt: now, updatedAt: now },
      { id: 'user-b002', name: 'Dev Buyer 2',   phone: '+919000000002', type: 'buyer',  verified: true, walletBalance: 0, createdAt: now, updatedAt: now },
      { id: 'user-s112', name: 'Desi Dairy',    phone: '+919000000112', type: 'seller', verified: true, walletBalance: 0, createdAt: now, updatedAt: now },
      { id: 'user-s113', name: 'Amma Kitchen',  phone: '+919000000113', type: 'seller', verified: true, walletBalance: 0, createdAt: now, updatedAt: now },
      { id: 'user-s105', name: 'Spice Route',   phone: '+919000000105', type: 'seller', verified: true, walletBalance: 0, createdAt: now, updatedAt: now },
    ];
    for (const u of devUsers) this.store.set(u.id, u);
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

  async findByReferralCode(code: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.referralCode === code) return user;
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      ...input,
      id:           randomUUID(),
      referralCode: generateReferralCode(),
      verified:     false,
      createdAt:    now,
      updatedAt:    now,
    };
    this.store.set(user.id, user);
    return user;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: User = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  async verify(id: string): Promise<User | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: User = { ...existing, verified: true, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
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
  private store = new Map<string, Seller>();

  constructor() { this.seed(); }

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
      ...input,
      ...coords,
      id:           randomUUID(),
      verified:     false,
      documentUrls: [],
      createdAt:    now,
      updatedAt:    now,
    };
    this.store.set(seller.id, seller);
    return seller;
  }

  async update(id: string, input: UpdateSellerInput): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Seller = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  async addDocument(id: string, url: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    if (existing.documentUrls.includes(url)) return existing; // idempotent
    const updated: Seller = {
      ...existing,
      documentUrls: [...existing.documentUrls, url],
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async removeDocument(id: string, url: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Seller = {
      ...existing,
      documentUrls: existing.documentUrls.filter(u => u !== url),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, updated);
    return updated;
  }

  async verify(id: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const verified: Seller = { ...existing, verified: true, verifiedAt: now, updatedAt: now };
    this.store.set(id, verified);
    return verified;
  }

  // ── Seed data ──────────────────────────────────────────────────────────────
  // Fixed IDs match catalog-svc seed data and the seller app's store-context so
  // inter-service lookups and UI store cards resolve correctly across restarts.
  private seed() {
    const now = new Date().toISOString();
    type SeedSeller = Seller;

    const sellers: SeedSeller[] = [
      {
        id: 'seller-101',
        name: 'Nizamabad Agri Co-op', type: 'farmer',
        phone: '+919000000101', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000101',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-103',
        name: 'Krishna Farms', type: 'farmer',
        phone: '+919000000103', location: 'Khammam, Telangana', pincode: '507001',
        lat: 17.245, lng: 80.152,
        deliveryZones: ['district', 'state'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-105',
        name: 'Spice Route Nizamabad', type: 'farmer',
        phone: '+919000000105', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000105',
        description: 'Organic turmeric, chillies and seasonal vegetables from Nizamabad district.',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-107',
        name: 'Adilabad Spice Farm', type: 'farmer',
        phone: '+919000000107', location: 'Adilabad, Telangana', pincode: '504001',
        lat: 19.668, lng: 78.531,
        deliveryZones: ['district', 'state'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-111',
        name: 'Godavari Aqua Farm', type: 'farmer',
        phone: '+919000000111', location: 'Bhadradri, Telangana', pincode: '507101',
        lat: 17.550, lng: 80.630,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000111',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-112',
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
        id: 'seller-113',
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
        id: 'seller-115',
        name: 'Village Mill Nizamabad', type: 'homefood',
        phone: '+919000000115', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000115',
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-124',
        name: 'Pochampally Weavers', type: 'artisan',
        phone: '+919000000124', location: 'Nalgonda, Telangana', pincode: '508284',
        lat: 17.362, lng: 79.058,
        deliveryZones: ['state', 'national'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-121',
        name: 'Nalgonda Building Supplies', type: 'artisan',
        phone: '+919000000121', location: 'Nalgonda, Telangana', pincode: '508001',
        lat: 17.166, lng: 79.261,
        deliveryZones: ['district', 'state'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-201',
        name: 'Quick Fix Electricals', type: 'trades',
        phone: '+919000000201', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['mandal'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-207',
        name: 'CoolTech Services', type: 'trades',
        phone: '+919000000207', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['mandal', 'district'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'seller-212',
        name: 'AutoCare Nizamabad', type: 'trades',
        phone: '+919000000212', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        deliveryZones: ['mandal', 'district'],
        verified: true, verifiedAt: now, documentUrls: [],
        createdAt: now, updatedAt: now,
      },
    ];

    for (const seller of sellers) {
      this.store.set(seller.id, seller);
    }
  }
}

// ── SellerMemberRepository ────────────────────────────────────────────────────

export interface SellerMemberRepository {
  findBySellerId(sellerId: string): Promise<SellerMember[]>;
  findById(id: string): Promise<SellerMember | null>;
  findBySellerAndPhone(sellerId: string, phone: string): Promise<SellerMember | null>;
  create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember>;
  update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null>;
  activate(id: string, userId: string): Promise<SellerMember | null>;
  delete(id: string): Promise<boolean>;
}

export class InMemorySellerMemberRepository implements SellerMemberRepository {
  private store = new Map<string, SellerMember>();

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

  async create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember> {
    const member: SellerMember = {
      ...input,
      id:         randomUUID(),
      sellerId,
      status:     'pending',
      invitedAt:  new Date().toISOString(),
    };
    this.store.set(member.id, member);
    return member;
  }

  async update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: SellerMember = { ...existing, ...input };
    this.store.set(id, updated);
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
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
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

// ── WishlistRepository ────────────────────────────────────────────────────────

export interface WishlistRepository {
  findByUserId(userId: string): Promise<WishlistItem[]>;
  add(userId: string, productId: string): Promise<WishlistItem>;
  remove(userId: string, productId: string): Promise<boolean>;
}

export class InMemoryWishlistRepository implements WishlistRepository {
  private store: WishlistItem[] = [];

  async findByUserId(userId: string): Promise<WishlistItem[]> {
    return this.store.filter(w => w.userId === userId);
  }

  async add(userId: string, productId: string): Promise<WishlistItem> {
    const existing = this.store.find(w => w.userId === userId && w.productId === productId);
    if (existing) return existing;
    const item: WishlistItem = { id: randomUUID(), userId, productId, createdAt: new Date().toISOString() };
    this.store.push(item);
    return item;
  }

  async remove(userId: string, productId: string): Promise<boolean> {
    const before = this.store.length;
    this.store = this.store.filter(w => !(w.userId === userId && w.productId === productId));
    return this.store.length < before;
  }
}

// ── CartRepository ────────────────────────────────────────────────────────────

export interface CartRepository {
  findByUserId(userId: string): Promise<CartItem[]>;
  upsert(userId: string, input: UpsertCartItemInput): Promise<CartItem>;
  remove(userId: string, productId: string): Promise<boolean>;
  clear(userId: string): Promise<void>;
}

export class InMemoryCartRepository implements CartRepository {
  private store: CartItem[] = [];

  async findByUserId(userId: string): Promise<CartItem[]> {
    return this.store.filter(c => c.userId === userId);
  }

  async upsert(userId: string, input: UpsertCartItemInput): Promise<CartItem> {
    const now = new Date().toISOString();
    const idx = this.store.findIndex(c => c.userId === userId && c.productId === input.productId);
    if (idx >= 0) {
      this.store[idx] = { ...this.store[idx]!, ...input, userId, updatedAt: now };
      return this.store[idx]!;
    }
    const item: CartItem = { id: randomUUID(), userId, ...input, createdAt: now, updatedAt: now };
    this.store.push(item);
    return item;
  }

  async remove(userId: string, productId: string): Promise<boolean> {
    const before = this.store.length;
    this.store = this.store.filter(c => !(c.userId === userId && c.productId === productId));
    return this.store.length < before;
  }

  async clear(userId: string): Promise<void> {
    this.store = this.store.filter(c => c.userId !== userId);
  }
}

// ── WalletRepository ──────────────────────────────────────────────────────────

export interface WalletRepository {
  getBalance(userId: string): Promise<number>;
  credit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction>;
  debit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction>;
  listTransactions(userId: string, limit?: number): Promise<WalletTransaction[]>;
}

export class InMemoryWalletRepository implements WalletRepository {
  private balances   = new Map<string, number>();
  private txns: WalletTransaction[] = [];

  async getBalance(userId: string): Promise<number> {
    return this.balances.get(userId) ?? 0;
  }

  async credit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction> {
    const current    = await this.getBalance(userId);
    const newBalance = current + amount;
    this.balances.set(userId, newBalance);
    const txn: WalletTransaction = {
      id: randomUUID(), userId, type: 'credit', amount,
      balance: newBalance, description,
      source, referenceId,
      createdAt: new Date().toISOString(),
    };
    this.txns.unshift(txn);
    return txn;
  }

  async debit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction> {
    const current = await this.getBalance(userId);
    if (current < amount) throw new Error('Insufficient wallet balance');
    const newBalance = current - amount;
    this.balances.set(userId, newBalance);
    const txn: WalletTransaction = {
      id: randomUUID(), userId, type: 'debit', amount,
      balance: newBalance, description,
      source, referenceId,
      createdAt: new Date().toISOString(),
    };
    this.txns.unshift(txn);
    return txn;
  }

  async listTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
    return this.txns.filter(t => t.userId === userId).slice(0, limit);
  }
}

// ── ReferralRepository ────────────────────────────────────────────────────────

export interface ReferralRepository {
  findByRefereeId(refereeId: string): Promise<Referral | null>;
  findByReferrerId(referrerId: string): Promise<Referral[]>;
  create(referrerId: string, refereeId: string): Promise<Referral>;
  markRewarded(refereeId: string, orderId: string): Promise<Referral | null>;
}

export class InMemoryReferralRepository implements ReferralRepository {
  private store: Referral[] = [];

  async findByRefereeId(refereeId: string): Promise<Referral | null> {
    return this.store.find(r => r.refereeId === refereeId) ?? null;
  }

  async findByReferrerId(referrerId: string): Promise<Referral[]> {
    return this.store.filter(r => r.referrerId === referrerId);
  }

  async create(referrerId: string, refereeId: string): Promise<Referral> {
    const now = new Date().toISOString();
    const referral: Referral = {
      id:                  randomUUID(),
      referrerId,
      refereeId,
      status:              'pending',
      rewardReferrerPaise: 10000,
      rewardRefereePaise:  5000,
      createdAt:           now,
      updatedAt:           now,
    };
    this.store.push(referral);
    return referral;
  }

  async markRewarded(refereeId: string, orderId: string): Promise<Referral | null> {
    const idx = this.store.findIndex(r => r.refereeId === refereeId);
    if (idx < 0) return null;
    const updated: Referral = {
      ...this.store[idx]!,
      status:    'rewarded',
      orderId,
      updatedAt: new Date().toISOString(),
    };
    this.store[idx] = updated;
    return updated;
  }
}
