import { randomUUID } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import type {
  UserRepository, AddressRepository,
  SellerRepository, SellerMemberRepository, BankAccountRepository,
  WishlistRepository, CartRepository, WalletRepository, ReferralRepository,
} from '../repository.js';
import { generateReferralCode } from '../repository.js';
import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
  SellerMember, CreateSellerMemberInput, UpdateSellerMemberInput,
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
  GeoPoint, ShipsTo,
  WishlistItem, CartItem, UpsertCartItemInput,
  WalletTransaction,
  Referral,
} from '../types.js';

type Db = NodePgDatabase<typeof schema>;

// ── Row → domain mappers ─────────────────────────────────────────────────────
// Drizzle returns Date objects / typed columns; domain types use ISO strings.

function toUser(row: typeof schema.users.$inferSelect): User {
  return {
    id:            row.id,
    name:          row.name,
    phone:         row.phone,
    email:         row.email ?? undefined,
    type:          row.type as User['type'],
    verified:      row.verified,
    walletBalance: row.walletBalance,
    referralCode:  row.referralCode ?? undefined,
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}

function toReferral(row: typeof schema.referrals.$inferSelect): Referral {
  return {
    id:                  row.id,
    referrerId:          row.referrerId,
    refereeId:           row.refereeId,
    status:              row.status as Referral['status'],
    rewardReferrerPaise: row.rewardReferrerPaise,
    rewardRefereePaise:  row.rewardRefereePaise,
    orderId:             row.orderId ?? undefined,
    createdAt:           row.createdAt.toISOString(),
    updatedAt:           row.updatedAt.toISOString(),
  };
}

function toWalletTxn(row: typeof schema.walletTransactions.$inferSelect): WalletTransaction {
  return {
    id:          row.id,
    userId:      row.userId,
    type:        row.type as WalletTransaction['type'],
    amount:      row.amount,
    balance:     row.balance,
    description: row.description,
    source:      row.source ?? undefined,
    referenceId: row.referenceId ?? undefined,
    createdAt:   row.createdAt.toISOString(),
  };
}

function toAddress(row: typeof schema.addresses.$inferSelect): Address {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    line1: row.line1,
    line2: row.line2 ?? undefined,
    city: row.city,
    district: row.district,
    state: row.state,
    pincode: row.pincode,
    lat: row.lat,
    lng: row.lng,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSeller(row: typeof schema.sellers.$inferSelect): Seller {
  return {
    id: row.id,
    userId: row.userId ?? undefined,
    name: row.name,
    type: row.type as Seller['type'],
    phone: row.phone,
    email: row.email ?? undefined,
    description: row.description ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    location: row.location,
    pincode: row.pincode,
    lat: row.lat,
    lng: row.lng,
    deliveryZones: row.deliveryZones as ShipsTo[],
    fssaiNumber: row.fssaiNumber ?? undefined,
    verified: row.verified,
    verifiedAt: row.verifiedAt?.toISOString(),
    documentUrls: row.documentUrls,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMember(row: typeof schema.sellerMembers.$inferSelect): SellerMember {
  return {
    id: row.id,
    sellerId: row.sellerId,
    userId: row.userId ?? undefined,
    name: row.name,
    phone: row.phone,
    role: row.role as SellerMember['role'],
    status: row.status as SellerMember['status'],
    invitedAt: row.invitedAt.toISOString(),
    joinedAt: row.joinedAt?.toISOString(),
  };
}

function toBankAccount(row: typeof schema.bankAccounts.$inferSelect): BankAccount {
  return {
    id: row.id,
    sellerId: row.sellerId,
    accountHolderName: row.accountHolderName,
    accountNumber: row.accountNumber,
    ifscCode: row.ifscCode,
    bankName: row.bankName,
    upiId: row.upiId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── PgUserRepository ──────────────────────────────────────────────────────────

export class PgUserRepository implements UserRepository {
  constructor(private db: Db) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
    return row ? toUser(row) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.phone, phone));
    return row ? toUser(row) : null;
  }

  async findByReferralCode(code: string): Promise<User | null> {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.referralCode, code));
    return row ? toUser(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const [row] = await this.db.insert(schema.users).values({
      id:           randomUUID(),
      name:         input.name,
      phone:        input.phone,
      email:        input.email,
      type:         input.type,
      referralCode: generateReferralCode(),
    }).returning();
    return toUser(row!);
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const [row] = await this.db.update(schema.users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return row ? toUser(row) : null;
  }

  async verify(id: string): Promise<User | null> {
    const [row] = await this.db.update(schema.users)
      .set({ verified: true, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return row ? toUser(row) : null;
  }
}

// ── PgAddressRepository ───────────────────────────────────────────────────────

export class PgAddressRepository implements AddressRepository {
  constructor(private db: Db) {}

  async findByUserId(userId: string): Promise<Address[]> {
    const rows = await this.db.select().from(schema.addresses).where(eq(schema.addresses.userId, userId));
    return rows.map(toAddress);
  }

  async findById(id: string): Promise<Address | null> {
    const [row] = await this.db.select().from(schema.addresses).where(eq(schema.addresses.id, id));
    return row ? toAddress(row) : null;
  }

  async clearDefaultForUser(userId: string): Promise<void> {
    await this.db.update(schema.addresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(schema.addresses.userId, userId), eq(schema.addresses.isDefault, true)));
  }

  async create(userId: string, input: CreateAddressInput, coords: GeoPoint): Promise<Address> {
    const [row] = await this.db.insert(schema.addresses).values({
      id: randomUUID(),
      userId,
      label: input.label,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      district: input.district,
      state: input.state,
      pincode: input.pincode,
      lat: coords.lat,
      lng: coords.lng,
      isDefault: input.isDefault,
    }).returning();
    return toAddress(row!);
  }

  async update(id: string, input: UpdateAddressInput & Partial<GeoPoint>): Promise<Address | null> {
    const [row] = await this.db.update(schema.addresses)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.addresses.id, id))
      .returning();
    return row ? toAddress(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.addresses).where(eq(schema.addresses.id, id)).returning();
    return rows.length > 0;
  }
}

// ── PgSellerRepository ────────────────────────────────────────────────────────

export class PgSellerRepository implements SellerRepository {
  constructor(private db: Db) {}

  async findAll(filters?: { type?: string; verified?: boolean; userId?: string; phone?: string }): Promise<Seller[]> {
    const conditions = [];
    if (filters?.type !== undefined)     conditions.push(eq(schema.sellers.type, filters.type));
    if (filters?.verified !== undefined) conditions.push(eq(schema.sellers.verified, filters.verified));
    if (filters?.userId !== undefined)   conditions.push(eq(schema.sellers.userId, filters.userId));
    if (filters?.phone !== undefined)    conditions.push(eq(schema.sellers.phone, filters.phone));

    const rows = conditions.length > 0
      ? await this.db.select().from(schema.sellers).where(and(...conditions))
      : await this.db.select().from(schema.sellers);
    return rows.map(toSeller);
  }

  async findById(id: string): Promise<Seller | null> {
    const [row] = await this.db.select().from(schema.sellers).where(eq(schema.sellers.id, id));
    return row ? toSeller(row) : null;
  }

  async findByPhone(phone: string): Promise<Seller | null> {
    const [row] = await this.db.select().from(schema.sellers).where(eq(schema.sellers.phone, phone));
    return row ? toSeller(row) : null;
  }

  async findByUserId(userId: string): Promise<Seller[]> {
    const rows = await this.db.select().from(schema.sellers).where(eq(schema.sellers.userId, userId));
    return rows.map(toSeller);
  }

  async create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller> {
    const [row] = await this.db.insert(schema.sellers).values({
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      type: input.type,
      phone: input.phone,
      email: input.email,
      description: input.description,
      imageUrl: input.imageUrl,
      location: input.location,
      pincode: input.pincode,
      lat: coords.lat,
      lng: coords.lng,
      deliveryZones: input.deliveryZones,
      fssaiNumber: input.fssaiNumber,
      documentUrls: [],
    }).returning();
    return toSeller(row!);
  }

  async update(id: string, input: UpdateSellerInput): Promise<Seller | null> {
    const [row] = await this.db.update(schema.sellers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.sellers.id, id))
      .returning();
    return row ? toSeller(row) : null;
  }

  async addDocument(id: string, url: string): Promise<Seller | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    if (existing.documentUrls.includes(url)) return existing; // idempotent
    const [row] = await this.db.update(schema.sellers)
      .set({ documentUrls: [...existing.documentUrls, url], updatedAt: new Date() })
      .where(eq(schema.sellers.id, id))
      .returning();
    return row ? toSeller(row) : null;
  }

  async removeDocument(id: string, url: string): Promise<Seller | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const [row] = await this.db.update(schema.sellers)
      .set({ documentUrls: existing.documentUrls.filter(u => u !== url), updatedAt: new Date() })
      .where(eq(schema.sellers.id, id))
      .returning();
    return row ? toSeller(row) : null;
  }

  async verify(id: string): Promise<Seller | null> {
    const now = new Date();
    const [row] = await this.db.update(schema.sellers)
      .set({ verified: true, verifiedAt: now, updatedAt: now })
      .where(eq(schema.sellers.id, id))
      .returning();
    return row ? toSeller(row) : null;
  }
}

// ── PgSellerMemberRepository ──────────────────────────────────────────────────

export class PgSellerMemberRepository implements SellerMemberRepository {
  constructor(private db: Db) {}

  async findBySellerId(sellerId: string): Promise<SellerMember[]> {
    const rows = await this.db.select().from(schema.sellerMembers).where(eq(schema.sellerMembers.sellerId, sellerId));
    return rows.map(toMember);
  }

  async findById(id: string): Promise<SellerMember | null> {
    const [row] = await this.db.select().from(schema.sellerMembers).where(eq(schema.sellerMembers.id, id));
    return row ? toMember(row) : null;
  }

  async findBySellerAndPhone(sellerId: string, phone: string): Promise<SellerMember | null> {
    const [row] = await this.db.select().from(schema.sellerMembers)
      .where(and(eq(schema.sellerMembers.sellerId, sellerId), eq(schema.sellerMembers.phone, phone)));
    return row ? toMember(row) : null;
  }

  async create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember> {
    const [row] = await this.db.insert(schema.sellerMembers).values({
      id: randomUUID(),
      sellerId,
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: 'pending',
    }).returning();
    return toMember(row!);
  }

  async update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null> {
    const [row] = await this.db.update(schema.sellerMembers)
      .set(input)
      .where(eq(schema.sellerMembers.id, id))
      .returning();
    return row ? toMember(row) : null;
  }

  async activate(id: string, userId: string): Promise<SellerMember | null> {
    const [row] = await this.db.update(schema.sellerMembers)
      .set({ userId, status: 'active', joinedAt: new Date() })
      .where(eq(schema.sellerMembers.id, id))
      .returning();
    return row ? toMember(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(schema.sellerMembers).where(eq(schema.sellerMembers.id, id)).returning();
    return rows.length > 0;
  }
}

// ── PgBankAccountRepository ───────────────────────────────────────────────────

export class PgBankAccountRepository implements BankAccountRepository {
  constructor(private db: Db) {}

  async findBySellerId(sellerId: string): Promise<BankAccount | null> {
    const [row] = await this.db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.sellerId, sellerId));
    return row ? toBankAccount(row) : null;
  }

  async upsert(sellerId: string, input: CreateBankAccountInput): Promise<BankAccount> {
    const existing = await this.findBySellerId(sellerId);
    const [row] = await this.db.insert(schema.bankAccounts).values({
      id: existing?.id ?? randomUUID(),
      sellerId,
      accountHolderName: input.accountHolderName,
      accountNumber: input.accountNumber,
      ifscCode: input.ifscCode,
      bankName: input.bankName,
      upiId: input.upiId,
    }).onConflictDoUpdate({
      target: schema.bankAccounts.sellerId,
      set: {
        accountHolderName: input.accountHolderName,
        accountNumber: input.accountNumber,
        ifscCode: input.ifscCode,
        bankName: input.bankName,
        upiId: input.upiId,
        updatedAt: new Date(),
      },
    }).returning();
    return toBankAccount(row!);
  }

  async update(sellerId: string, input: UpdateBankAccountInput): Promise<BankAccount | null> {
    const [row] = await this.db.update(schema.bankAccounts)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(schema.bankAccounts.sellerId, sellerId))
      .returning();
    return row ? toBankAccount(row) : null;
  }
}

// ── PgWishlistRepository ──────────────────────────────────────────────────────

function toWishlistItem(row: typeof schema.wishlistItems.$inferSelect): WishlistItem {
  return { id: row.id, userId: row.userId, productId: row.productId, createdAt: row.createdAt.toISOString() };
}

function toCartItem(row: typeof schema.cartItems.$inferSelect): CartItem {
  return {
    id: row.id, userId: row.userId, productId: row.productId,
    productName: row.productName, vendorId: row.vendorId, vendorName: row.vendorName,
    quantity: row.quantity, unitPrice: row.unitPrice, image: row.image ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export class PgWishlistRepository implements WishlistRepository {
  constructor(private db: Db) {}

  async findByUserId(userId: string): Promise<WishlistItem[]> {
    const rows = await this.db.select().from(schema.wishlistItems).where(eq(schema.wishlistItems.userId, userId));
    return rows.map(toWishlistItem);
  }

  async add(userId: string, productId: string): Promise<WishlistItem> {
    const existing = await this.db.select().from(schema.wishlistItems)
      .where(and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.productId, productId)));
    if (existing[0]) return toWishlistItem(existing[0]);
    const [row] = await this.db.insert(schema.wishlistItems)
      .values({ id: randomUUID(), userId, productId })
      .returning();
    return toWishlistItem(row!);
  }

  async remove(userId: string, productId: string): Promise<boolean> {
    const rows = await this.db.delete(schema.wishlistItems)
      .where(and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.productId, productId)))
      .returning();
    return rows.length > 0;
  }
}

// ── PgCartRepository ──────────────────────────────────────────────────────────

export class PgCartRepository implements CartRepository {
  constructor(private db: Db) {}

  async findByUserId(userId: string): Promise<CartItem[]> {
    const rows = await this.db.select().from(schema.cartItems).where(eq(schema.cartItems.userId, userId));
    return rows.map(toCartItem);
  }

  async upsert(userId: string, input: UpsertCartItemInput): Promise<CartItem> {
    const existing = await this.db.select().from(schema.cartItems)
      .where(and(eq(schema.cartItems.userId, userId), eq(schema.cartItems.productId, input.productId)));
    if (existing[0]) {
      const [row] = await this.db.update(schema.cartItems)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(schema.cartItems.id, existing[0].id))
        .returning();
      return toCartItem(row!);
    }
    const [row] = await this.db.insert(schema.cartItems)
      .values({ id: randomUUID(), userId, ...input })
      .returning();
    return toCartItem(row!);
  }

  async remove(userId: string, productId: string): Promise<boolean> {
    const rows = await this.db.delete(schema.cartItems)
      .where(and(eq(schema.cartItems.userId, userId), eq(schema.cartItems.productId, productId)))
      .returning();
    return rows.length > 0;
  }

  async clear(userId: string): Promise<void> {
    await this.db.delete(schema.cartItems).where(eq(schema.cartItems.userId, userId));
  }
}

// ── PgWalletRepository ────────────────────────────────────────────────────────

export class PgWalletRepository implements WalletRepository {
  constructor(private db: Db) {}

  async getBalance(userId: string): Promise<number> {
    const [row] = await this.db.select({ walletBalance: schema.users.walletBalance })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return row?.walletBalance ?? 0;
  }

  async credit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction> {
    const currentBalance = await this.getBalance(userId);
    const newBalance = currentBalance + amount;
    await this.db.update(schema.users)
      .set({ walletBalance: newBalance, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    const [row] = await this.db.insert(schema.walletTransactions).values({
      id:          randomUUID(),
      userId,
      type:        'credit',
      amount,
      balance:     newBalance,
      description,
      source:      source ?? null,
      referenceId: referenceId ?? null,
    }).returning();
    return toWalletTxn(row!);
  }

  async debit(userId: string, amount: number, description: string, source?: string, referenceId?: string): Promise<WalletTransaction> {
    const currentBalance = await this.getBalance(userId);
    if (currentBalance < amount) throw new Error('Insufficient wallet balance');
    const newBalance = currentBalance - amount;
    await this.db.update(schema.users)
      .set({ walletBalance: newBalance, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    const [row] = await this.db.insert(schema.walletTransactions).values({
      id:          randomUUID(),
      userId,
      type:        'debit',
      amount,
      balance:     newBalance,
      description,
      source:      source ?? null,
      referenceId: referenceId ?? null,
    }).returning();
    return toWalletTxn(row!);
  }

  async listTransactions(userId: string, limit = 20): Promise<WalletTransaction[]> {
    const rows = await this.db.select().from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.userId, userId))
      .orderBy(desc(schema.walletTransactions.createdAt))
      .limit(limit);
    return rows.map(toWalletTxn);
  }
}

// ── PgReferralRepository ──────────────────────────────────────────────────────

export class PgReferralRepository implements ReferralRepository {
  constructor(private db: Db) {}

  async findByRefereeId(refereeId: string): Promise<Referral | null> {
    const [row] = await this.db.select().from(schema.referrals)
      .where(eq(schema.referrals.refereeId, refereeId));
    return row ? toReferral(row) : null;
  }

  async findByReferrerId(referrerId: string): Promise<Referral[]> {
    const rows = await this.db.select().from(schema.referrals)
      .where(eq(schema.referrals.referrerId, referrerId))
      .orderBy(desc(schema.referrals.createdAt));
    return rows.map(toReferral);
  }

  async create(referrerId: string, refereeId: string): Promise<Referral> {
    const [row] = await this.db.insert(schema.referrals).values({
      id:         randomUUID(),
      referrerId,
      refereeId,
      status:     'pending',
    }).returning();
    return toReferral(row!);
  }

  async markRewarded(refereeId: string, orderId: string): Promise<Referral | null> {
    const [row] = await this.db.update(schema.referrals)
      .set({ status: 'rewarded', orderId, updatedAt: new Date() })
      .where(eq(schema.referrals.refereeId, refereeId))
      .returning();
    return row ? toReferral(row) : null;
  }
}
