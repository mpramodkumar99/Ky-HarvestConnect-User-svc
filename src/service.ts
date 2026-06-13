import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
} from './types.js';
import type {
  UserRepository, AddressRepository, SellerRepository,
} from './repository.js';
import type { GeocodePort } from './ports.js';

// ── Domain errors ─────────────────────────────────────────────────────────────
// Thrown by services; caught by route handlers and mapped to HTTP status codes.
// Keeping error classification out of the HTTP layer means business logic is
// testable without spinning up a server.

export class NotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}

export class ConflictError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ConflictError'; }
}

export class ForbiddenError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ForbiddenError'; }
}

// ── UserService ───────────────────────────────────────────────────────────────

export class UserService {
  constructor(
    private users: UserRepository,
    private addresses: AddressRepository,
    private geocoder: GeocodePort,
  ) {}

  // ── User operations ──────────────────────────────────────────────────────

  async createUser(input: CreateUserInput): Promise<User> {
    const existing = await this.users.findByPhone(input.phone);
    if (existing) throw new ConflictError('Phone number is already registered');
    return this.users.create(input);
  }

  async getUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const updated = await this.users.update(id, input);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  // ── Address operations ───────────────────────────────────────────────────

  async listAddresses(userId: string): Promise<Address[]> {
    await this.getUser(userId); // validates user exists before querying addresses
    return this.addresses.findByUserId(userId);
  }

  async addAddress(userId: string, input: CreateAddressInput): Promise<Address> {
    await this.getUser(userId);

    const coords = await this.geocoder.fromPincode(input.pincode);

    // Single-default rule: unset the current default before setting the new one.
    // clearDefaultForUser must run before create so there is never a window
    // where two addresses are simultaneously marked as default.
    if (input.isDefault) {
      await this.addresses.clearDefaultForUser(userId);
    }

    return this.addresses.create(userId, input, coords);
  }

  async updateAddress(
    userId: string,
    addrId: string,
    input: UpdateAddressInput,
  ): Promise<Address> {
    const existing = await this.addresses.findById(addrId);
    if (!existing) throw new NotFoundError('Address not found');

    // Ownership check — an address belongs to one user; another user may not edit it
    if (existing.userId !== userId) throw new ForbiddenError('Address does not belong to this user');

    // Re-geocode only when the pincode changes; avoids an unnecessary network call
    let coordPatch: { lat?: number; lng?: number } = {};
    if (input.pincode && input.pincode !== existing.pincode) {
      const coords = await this.geocoder.fromPincode(input.pincode);
      coordPatch = coords;
    }

    // Single-default rule applies to updates too
    if (input.isDefault) {
      await this.addresses.clearDefaultForUser(userId);
    }

    const updated = await this.addresses.update(addrId, { ...input, ...coordPatch });
    return updated!;
  }

  async deleteAddress(userId: string, addrId: string): Promise<void> {
    const existing = await this.addresses.findById(addrId);
    if (!existing) throw new NotFoundError('Address not found');
    if (existing.userId !== userId) throw new ForbiddenError('Address does not belong to this user');
    await this.addresses.delete(addrId);
  }
}

// ── SellerService ─────────────────────────────────────────────────────────────

export class SellerService {
  constructor(
    private sellers: SellerRepository,
    private geocoder: GeocodePort,
  ) {}

  async listSellers(filters?: { type?: string; verified?: boolean }): Promise<Seller[]> {
    return this.sellers.findAll(filters);
  }

  async createSeller(input: CreateSellerInput): Promise<Seller> {
    const existing = await this.sellers.findByPhone(input.phone);
    if (existing) throw new ConflictError('Phone number is already registered as a seller');
    const coords = await this.geocoder.fromPincode(input.pincode);
    return this.sellers.create(input, coords);
  }

  async getSeller(id: string): Promise<Seller> {
    const seller = await this.sellers.findById(id);
    if (!seller) throw new NotFoundError('Seller not found');
    return seller;
  }

  async updateSeller(id: string, input: UpdateSellerInput): Promise<Seller> {
    const existing = await this.sellers.findById(id);
    if (!existing) throw new NotFoundError('Seller not found');

    // Re-geocode when pincode changes (seller moved their operation to a new location)
    let coordPatch: { lat?: number; lng?: number } = {};
    if (input.pincode && input.pincode !== existing.pincode) {
      const coords = await this.geocoder.fromPincode(input.pincode);
      coordPatch = coords;
    }

    const updated = await this.sellers.update(id, { ...input, ...coordPatch });
    return updated!;
  }

  // Admin-only operation — sets verified:true and records verifiedAt timestamp.
  // The route enforces the X-Admin-Key header check; the service is auth-agnostic.
  async verifySeller(id: string): Promise<Seller> {
    const updated = await this.sellers.verify(id);
    if (!updated) throw new NotFoundError('Seller not found');
    return updated;
  }
}
