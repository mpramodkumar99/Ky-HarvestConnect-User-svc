import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput, SellerRole,
  SellerMember, CreateSellerMemberInput, UpdateSellerMemberInput,
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
  Agent, AgentStatus, AgentBank, AgentKyc, StoreOnboardingRequest,
} from './types.js';
import type {
  UserRepository, AddressRepository,
  SellerRepository, SellerMemberRepository, BankAccountRepository,
  AgentRepository, AgentBankRepository, AgentKycRepository, OnboardingRepository,
} from './repository.js';
import type { GeocodePort } from './ports.js';

// ── Domain errors ─────────────────────────────────────────────────────────────
// Thrown by services; caught by route handlers and mapped to HTTP status codes.

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
    const existing = await this.users.findByPhoneAndType(input.phone, input.type ?? 'buyer');
    if (existing) throw new ConflictError(`Phone number is already registered as ${input.type ?? 'buyer'}`);
    return this.users.create(input);
  }

  async getUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | null> {
    return this.users.findByPhone(phone);
  }

  async getUserByPhoneAndType(phone: string, type: string): Promise<User | null> {
    return this.users.findByPhoneAndType(phone, type);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const updated = await this.users.update(id, input);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  // ── Address operations ───────────────────────────────────────────────────

  async listAddresses(userId: string): Promise<Address[]> {
    await this.getUser(userId);
    return this.addresses.findByUserId(userId);
  }

  async addAddress(userId: string, input: CreateAddressInput): Promise<Address> {
    await this.getUser(userId);
    const coords = await this.geocoder.fromPincode(input.pincode);
    if (input.isDefault) await this.addresses.clearDefaultForUser(userId);
    return this.addresses.create(userId, input, coords);
  }

  async updateAddress(
    userId: string,
    addrId: string,
    input: UpdateAddressInput,
  ): Promise<Address> {
    const existing = await this.addresses.findById(addrId);
    if (!existing) throw new NotFoundError('Address not found');
    if (existing.userId !== userId) throw new ForbiddenError('Address does not belong to this user');

    let coordPatch: { lat?: number; lng?: number } = {};
    if (input.pincode && input.pincode !== existing.pincode) {
      coordPatch = await this.geocoder.fromPincode(input.pincode);
    }

    if (input.isDefault) await this.addresses.clearDefaultForUser(userId);
    return (await this.addresses.update(addrId, { ...input, ...coordPatch }))!;
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
    private members: SellerMemberRepository,
    private bankAccounts: BankAccountRepository,
    private geocoder: GeocodePort,
    private users: UserRepository,
  ) {}

  // ── Seller operations ────────────────────────────────────────────────────

  async listSellers(filters?: {
    type?: string;
    verified?: boolean;
    userId?: string;
    phone?: string;
  }): Promise<Seller[]> {
    return this.sellers.findAll(filters);
  }

  async listSellersByUser(userId: string): Promise<Array<Seller & { memberRole: SellerRole }>> {
    // Owned stores — always loaded first; membership lookup is additive
    const ownedSellers = await this.sellers.findByUserId(userId);
    const owned = ownedSellers.map(s => ({ ...s, memberRole: 'owner' as SellerRole }));

    // Stores where user is an active team member (invited + accepted)
    // Wrapped in try-catch so a failure here never hides the user's owned stores
    try {
      const memberships = await this.members.findActiveByUserId(userId);
      const memberSellers = await Promise.all(
        memberships
          .filter(m => !ownedSellers.some(o => o.id === m.sellerId)) // dedupe
          .map(async m => {
            const seller = await this.sellers.findById(m.sellerId);
            if (!seller) return null;
            return { ...seller, memberRole: m.role };
          }),
      );
      return [...owned, ...(memberSellers.filter(Boolean) as Array<Seller & { memberRole: SellerRole }>)];
    } catch {
      return owned;
    }
  }

  async getPendingInvites(phone: string): Promise<Array<{ id: string; sellerId: string; sellerName: string; role: SellerRole; invitedAt: string }>> {
    const members = await this.members.findPendingByPhone(phone);
    const results = await Promise.all(
      members.map(async m => {
        const seller = await this.sellers.findById(m.sellerId);
        if (!seller) return null;
        return { id: m.id, sellerId: m.sellerId, sellerName: seller.name, role: m.role, invitedAt: m.invitedAt };
      }),
    );
    return results.filter(Boolean) as Array<{ id: string; sellerId: string; sellerName: string; role: SellerRole; invitedAt: string }>;
  }

  async createSeller(input: CreateSellerInput): Promise<Seller> {
    const allForPhone = await this.sellers.findAll({ phone: input.phone });
    const dupType = allForPhone.find(s => s.type === input.type);
    if (dupType) {
      throw new ConflictError(`You already have a ${input.type} store registered with this phone number`);
    }
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

    let coordPatch: { lat?: number; lng?: number } = {};
    if (input.pincode && input.pincode !== existing.pincode) {
      coordPatch = await this.geocoder.fromPincode(input.pincode);
    }

    return (await this.sellers.update(id, { ...input, ...coordPatch }))!;
  }

  async verifySeller(id: string): Promise<Seller> {
    const updated = await this.sellers.verify(id);
    if (!updated) throw new NotFoundError('Seller not found');
    return updated;
  }

  // ── Document operations ──────────────────────────────────────────────────

  async addDocument(sellerId: string, url: string): Promise<Seller> {
    const existing = await this.sellers.findById(sellerId);
    if (!existing) throw new NotFoundError('Seller not found');
    return (await this.sellers.addDocument(sellerId, url))!;
  }

  async removeDocument(sellerId: string, url: string): Promise<Seller> {
    const existing = await this.sellers.findById(sellerId);
    if (!existing) throw new NotFoundError('Seller not found');
    return (await this.sellers.removeDocument(sellerId, url))!;
  }

  // ── Team member operations ───────────────────────────────────────────────

  async listMembers(sellerId: string): Promise<SellerMember[]> {
    const seller = await this.getSeller(sellerId);
    const members = await this.members.findBySellerId(sellerId);

    // Freshen denormalized names and profile photos from User records
    const enriched = await Promise.all(members.map(async m => {
      if (!m.userId) return m;
      try {
        const user = await this.users.findById(m.userId);
        if (user) return { ...m, name: user.name, imageUrl: user.imageUrl };
      } catch { /* user not found — keep stored values */ }
      return m;
    }));

    // Prepend a synthetic owner entry so the owner always appears first
    if (seller.userId) {
      try {
        const owner = await this.users.findById(seller.userId);
        if (owner) {
          const ownerMember: SellerMember = {
            id:        `owner-${sellerId}`,
            sellerId,
            userId:    seller.userId,
            name:      owner.name,
            phone:     owner.phone,
            role:      'owner',
            status:    'active',
            imageUrl:  owner.imageUrl,
            invitedAt: seller.createdAt,
            joinedAt:  seller.createdAt,
          };
          return [ownerMember, ...enriched];
        }
      } catch { /* owner user not found — fall through */ }
    }

    return enriched;
  }

  async inviteMember(
    sellerId: string,
    input: CreateSellerMemberInput,
  ): Promise<SellerMember> {
    await this.getSeller(sellerId);
    const existing = await this.members.findBySellerAndPhone(sellerId, input.phone);
    if (existing) throw new ConflictError('This phone number is already a member of this seller account');
    return this.members.create(sellerId, input);
  }

  async updateMemberRole(
    sellerId: string,
    memberId: string,
    input: UpdateSellerMemberInput,
  ): Promise<SellerMember> {
    const member = await this.members.findById(memberId);
    if (!member) throw new NotFoundError('Member not found');
    if (member.sellerId !== sellerId) throw new ForbiddenError('Member does not belong to this seller account');
    return (await this.members.update(memberId, input))!;
  }

  async activateMember(sellerId: string, memberId: string, userId: string): Promise<SellerMember> {
    const member = await this.members.findById(memberId);
    if (!member) throw new NotFoundError('Member not found');
    if (member.sellerId !== sellerId) throw new ForbiddenError('Member does not belong to this seller account');
    if (member.status === 'active') throw new ConflictError('Member is already active');
    return (await this.members.activate(memberId, userId))!;
  }

  async removeMember(sellerId: string, memberId: string): Promise<void> {
    const member = await this.members.findById(memberId);
    if (!member) throw new NotFoundError('Member not found');
    if (member.sellerId !== sellerId) throw new ForbiddenError('Member does not belong to this seller account');
    await this.members.delete(memberId);
  }

  // ── Bank account operations ──────────────────────────────────────────────

  async getBankAccount(sellerId: string): Promise<BankAccount> {
    await this.getSeller(sellerId);
    const account = await this.bankAccounts.findBySellerId(sellerId);
    if (!account) throw new NotFoundError('No bank account found for this seller');
    return account;
  }

  async setBankAccount(sellerId: string, input: CreateBankAccountInput): Promise<BankAccount> {
    await this.getSeller(sellerId);
    return this.bankAccounts.upsert(sellerId, input);
  }

  async updateBankAccount(sellerId: string, input: UpdateBankAccountInput): Promise<BankAccount> {
    await this.getSeller(sellerId);
    const updated = await this.bankAccounts.update(sellerId, input);
    if (!updated) throw new NotFoundError('No bank account found for this seller');
    return updated;
  }
}

// ── AgentService ──────────────────────────────────────────────────────────────

export class AgentService {
  constructor(
    private agents:     AgentRepository,
    private banks:      AgentBankRepository,
    private kycs:       AgentKycRepository,
    private onboarding: OnboardingRepository,
  ) {}

  async getAgent(userId: string): Promise<Agent> {
    const agent = await this.agents.findByUserId(userId);
    if (!agent) throw new NotFoundError(`Agent profile not found for user ${userId}`);
    return agent;
  }

  async upsertAgent(userId: string, input: Partial<Omit<Agent, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'totalDeliveries' | 'rating' | 'kycVerified' | 'bankLinked'>>): Promise<Agent> {
    return this.agents.upsert(userId, input);
  }

  async updateStatus(userId: string, status: AgentStatus): Promise<Agent> {
    const agent = await this.agents.upsert(userId, { status });
    return agent;
  }

  async setBank(userId: string, input: Omit<AgentBank, 'agentId' | 'updatedAt'>): Promise<void> {
    await this.banks.upsert(userId, input);
    await this.agents.upsert(userId, { bankLinked: true });
  }

  async setKyc(userId: string, input: Omit<AgentKyc, 'agentId' | 'updatedAt'>): Promise<void> {
    await this.kycs.upsert(userId, input);
    await this.agents.upsert(userId, { kycVerified: true });
  }

  async listOnboarding(): Promise<StoreOnboardingRequest[]> {
    return this.onboarding.list();
  }

  async reviewOnboarding(id: string, status: 'approved' | 'rejected', notes?: string, agentId?: string): Promise<StoreOnboardingRequest> {
    const updated = await this.onboarding.review(id, status, notes, agentId);
    if (!updated) throw new NotFoundError(`Onboarding request ${id} not found`);
    return updated;
  }
}
