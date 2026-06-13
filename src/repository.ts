import { randomUUID } from 'node:crypto';
import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
  GeoPoint,
} from './types.js';

// ── UserRepository ────────────────────────────────────────────────────────────

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}

export class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.phone === phone) return user;
    }
    return null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const user: User = {
      ...input,
      id:        randomUUID(),
      verified:  false, // always server-managed; never trust the caller
      createdAt: now,
      updatedAt: now,
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

  // Unsets isDefault on every address owned by the user.
  // Called before creating/updating a new default so there is at most one at a time.
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
  findAll(filters?: { type?: string; verified?: boolean }): Promise<Seller[]>;
  findById(id: string): Promise<Seller | null>;
  findByPhone(phone: string): Promise<Seller | null>;
  create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller>;
  update(id: string, input: UpdateSellerInput): Promise<Seller | null>;
  verify(id: string): Promise<Seller | null>;
}

export class InMemorySellerRepository implements SellerRepository {
  private store = new Map<string, Seller>();

  constructor() { this.seed(); }

  async findAll(filters?: { type?: string; verified?: boolean }): Promise<Seller[]> {
    let results = [...this.store.values()];
    if (filters?.type     !== undefined) results = results.filter(s => s.type     === filters.type);
    if (filters?.verified !== undefined) results = results.filter(s => s.verified === filters.verified);
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

  async create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller> {
    const now = new Date().toISOString();
    const seller: Seller = {
      ...input,
      ...coords,
      id:           randomUUID(),
      verified:     false,  // always false on create — admin-only flip
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

  // Sets verified:true and records the timestamp. Only this method may set these fields.
  async verify(id: string): Promise<Seller | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const verified: Seller = { ...existing, verified: true, verifiedAt: now, updatedAt: now };
    this.store.set(id, verified);
    return verified;
  }

  // ── Seed data ──────────────────────────────────────────────────────────────
  // Mirrors the seller IDs used in catalog-svc seed data so the inter-service
  // verification check resolves correctly during local development.
  private seed() {
    const now = new Date().toISOString();

    type SeedSeller = Omit<Seller, 'id' | 'createdAt' | 'updatedAt'>;

    const sellers: SeedSeller[] = [
      {
        name: 'Nizamabad Agri Co-op', type: 'farmer',
        phone: '+919000000101', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000101',
      },
      {
        name: 'Krishna Farms', type: 'farmer',
        phone: '+919000000103', location: 'Khammam, Telangana', pincode: '507001',
        lat: 17.245, lng: 80.152,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'Spice Route Nizamabad', type: 'farmer',
        phone: '+919000000105', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000105',
      },
      {
        name: 'Adilabad Spice Farm', type: 'farmer',
        phone: '+919000000107', location: 'Adilabad, Telangana', pincode: '504001',
        lat: 19.668, lng: 78.531,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'Godavari Aqua Farm', type: 'farmer',
        phone: '+919000000111', location: 'Bhadradri, Telangana', pincode: '507101',
        lat: 17.550, lng: 80.630,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000111',
      },
      {
        name: 'Desi Dairy Armoor', type: 'dairy',
        phone: '+919000000112', location: 'Armoor, Nizamabad', pincode: '503111',
        lat: 18.435, lng: 78.330,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000112',
      },
      {
        name: 'Amma Kitchen', type: 'homefood',
        phone: '+919000000113', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000113',
      },
      {
        name: 'Village Mill Nizamabad', type: 'homefood',
        phone: '+919000000115', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
        fssaiNumber: '10019042000115',
      },
      {
        name: 'Pochampally Weavers', type: 'artisan',
        phone: '+919000000124', location: 'Nalgonda, Telangana', pincode: '508284',
        lat: 17.362, lng: 79.058,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'Nalgonda Building Supplies', type: 'artisan',
        phone: '+919000000121', location: 'Nalgonda, Telangana', pincode: '508001',
        lat: 17.166, lng: 79.261,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'Quick Fix Electricals', type: 'artisan',
        phone: '+919000000201', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'CoolTech Services', type: 'artisan',
        phone: '+919000000207', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
      },
      {
        name: 'AutoCare Nizamabad', type: 'artisan',
        phone: '+919000000212', location: 'Nizamabad, Telangana', pincode: '503001',
        lat: 18.672, lng: 78.098,
        verified: true, verifiedAt: now, documentUrls: [],
      },
    ];

    for (const s of sellers) {
      const seller: Seller = { ...s, id: randomUUID(), createdAt: now, updatedAt: now };
      this.store.set(seller.id, seller);
    }
  }
}
