import type {
  User, CreateUserInput, UpdateUserInput,
  Address, CreateAddressInput, UpdateAddressInput,
  Seller, CreateSellerInput, UpdateSellerInput,
  SellerMember, CreateSellerMemberInput, UpdateSellerMemberInput,
  BankAccount, CreateBankAccountInput, UpdateBankAccountInput,
  WishlistItem, CartItem, UpsertCartItemInput,
  WalletTransaction,
  Referral, ReferralStats,
} from './types.js';
import type {
  UserRepository, AddressRepository,
  SellerRepository, SellerMemberRepository, BankAccountRepository,
  WishlistRepository, CartRepository, WalletRepository, ReferralRepository,
} from './repository.js';
import { generateReferralCode } from './repository.js';
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

export class BadRequestError extends Error {
  constructor(msg: string) { super(msg); this.name = 'BadRequestError'; }
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

  async getUserByPhone(phone: string): Promise<User | null> {
    return this.users.findByPhone(phone);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const updated = await this.users.update(id, input);
    if (!updated) throw new NotFoundError('User not found');
    return updated;
  }

  async verifyUser(id: string): Promise<User> {
    const updated = await this.users.verify(id);
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

  async listSellersByUser(userId: string): Promise<Seller[]> {
    return this.sellers.findByUserId(userId);
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
    await this.getSeller(sellerId); // validates seller exists
    return this.members.findBySellerId(sellerId);
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

// ── WishlistService ───────────────────────────────────────────────────────────

export class WishlistService {
  constructor(private repo: WishlistRepository) {}

  async list(userId: string): Promise<WishlistItem[]> {
    return this.repo.findByUserId(userId);
  }

  async add(userId: string, productId: string): Promise<WishlistItem> {
    return this.repo.add(userId, productId);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.repo.remove(userId, productId);
  }
}

// ── CartService ───────────────────────────────────────────────────────────────

export class CartService {
  constructor(private repo: CartRepository) {}

  async list(userId: string): Promise<CartItem[]> {
    return this.repo.findByUserId(userId);
  }

  async upsert(userId: string, input: UpsertCartItemInput): Promise<CartItem> {
    return this.repo.upsert(userId, input);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.repo.remove(userId, productId);
  }

  async clear(userId: string): Promise<void> {
    await this.repo.clear(userId);
  }
}

// ── WalletService ─────────────────────────────────────────────────────────────

export class WalletService {
  constructor(private repo: WalletRepository) {}

  async getWallet(userId: string): Promise<{ balance: number; transactions: WalletTransaction[] }> {
    const [balance, transactions] = await Promise.all([
      this.repo.getBalance(userId),
      this.repo.listTransactions(userId, 20),
    ]);
    return { balance, transactions };
  }

  async topup(userId: string, amountPaise: number, paymentMethod: string, paymentMethodId?: string): Promise<{ balance: number; transaction: WalletTransaction }> {
    if (amountPaise < 100) throw new Error('Minimum top-up is ₹1');
    if (amountPaise > 1000000) throw new Error('Maximum single top-up is ₹10,000');
    const description = `Added ₹${amountPaise / 100} via ${paymentMethod}`;
    const transaction = await this.repo.credit(userId, amountPaise, description, paymentMethod, paymentMethodId);
    return { balance: transaction.balance, transaction };
  }

  async debit(userId: string, amountPaise: number, orderId: string): Promise<{ balance: number; transaction: WalletTransaction }> {
    const description = `Payment for order #${orderId.slice(-6).toUpperCase()}`;
    const transaction = await this.repo.debit(userId, amountPaise, description, 'order', orderId);
    return { balance: transaction.balance, transaction };
  }
}

// ── ReferralService ───────────────────────────────────────────────────────────

const REFERRER_REWARD_PAISE = 10000; // ₹100
const REFEREE_REWARD_PAISE  = 5000;  // ₹50

export class ReferralService {
  constructor(
    private referrals: ReferralRepository,
    private users:     UserRepository,
    private wallet:    WalletRepository,
  ) {}

  async getStats(userId: string): Promise<ReferralStats & { referrals: Referral[] }> {
    let user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    // Lazy-generate code for existing users that pre-date the referral system
    if (!user.referralCode) {
      const code = generateReferralCode();
      user = (await this.users.update(userId, { referralCode: code })) ?? user;
    }

    const all = await this.referrals.findByReferrerId(userId);
    const pending  = all.filter(r => r.status === 'pending').length;
    const rewarded = all.filter(r => r.status === 'rewarded').length;
    const totalEarnedPaise = rewarded * REFERRER_REWARD_PAISE;

    return {
      code:              user.referralCode!,
      totalReferrals:    all.length,
      pendingReferrals:  pending,
      rewardedReferrals: rewarded,
      totalEarnedPaise,
      referrals:         all,
    };
  }

  async applyCode(refereeId: string, code: string): Promise<void> {
    const referee = await this.users.findById(refereeId);
    if (!referee) throw new NotFoundError('User not found');

    // One referral per user — idempotent
    const existing = await this.referrals.findByRefereeId(refereeId);
    if (existing) throw new BadRequestError('You have already used a referral code');

    const referrer = await this.users.findByReferralCode(code.toUpperCase());
    if (!referrer) throw new NotFoundError('Referral code not found');
    if (referrer.id === refereeId) throw new BadRequestError('You cannot use your own referral code');

    // Create the referral record
    await this.referrals.create(referrer.id, refereeId);

    // Credit the referee immediately (₹50 welcome bonus)
    await this.wallet.credit(
      refereeId,
      REFEREE_REWARD_PAISE,
      `Welcome bonus — referred by ${referrer.name}`,
      'referral',
      referrer.id,
    );
  }

  async rewardReferrer(refereeId: string, orderId: string): Promise<void> {
    const referral = await this.referrals.findByRefereeId(refereeId);
    if (!referral || referral.status === 'rewarded') return; // already rewarded or no referral

    await this.referrals.markRewarded(refereeId, orderId);
    await this.wallet.credit(
      referral.referrerId,
      REFERRER_REWARD_PAISE,
      `Referral reward — your friend placed their first order`,
      'referral',
      refereeId,
    );
  }
}
