// ── Shared ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Delivery coverage tiers — mirrors catalog-svc definition
export type ShipsTo = 'mandal' | 'district' | 'state' | 'national';

// ── User ──────────────────────────────────────────────────────────────────────

export type UserType = 'buyer' | 'seller' | 'agent';

export interface User {
  id: string;
  name: string;
  phone: string;       // E.164 format: +919876543210
  email?: string;
  imageUrl?: string;   // user profile photo URL
  type: UserType;
  verified: boolean;   // reserved for future KYC / email verification
  createdAt: string;   // ISO timestamp, write-once
  updatedAt: string;   // ISO timestamp, set on every write
}

// phone excluded — immutable after creation
// verified, id, timestamps are server-managed
export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'verified'>;
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'phone'>>;

// ── Address ───────────────────────────────────────────────────────────────────

export interface Address {
  id: string;
  userId: string;      // owner — links back to User.id
  label: string;       // 'Home' | 'Work' | 'Other' | custom string
  line1: string;
  line2?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;     // 6-digit Indian pincode; used to derive lat/lng
  lat: number;         // always from GeocodePort — never from the caller
  lng: number;         // always from GeocodePort — never from the caller
  isDefault: boolean;  // at most ONE true per userId (enforced in service layer)
  createdAt: string;
  updatedAt: string;
}

// lat/lng omitted — derived server-side from pincode via GeocodePort
// userId omitted — taken from the URL param, not the body
// id, timestamps are server-managed
export type CreateAddressInput = Omit<Address, 'id' | 'userId' | 'lat' | 'lng' | 'createdAt' | 'updatedAt'>;

// When pincode changes, service re-geocodes — lat/lng may be patched internally
export type UpdateAddressInput = Partial<CreateAddressInput>;

// ── Seller ────────────────────────────────────────────────────────────────────

export type SellerType = 'farmer' | 'artisan' | 'dairy' | 'homefood' | 'trades' | 'kirana';
export type BusinessType = 'retail' | 'wholesale';

export interface Seller {
  id: string;
  userId?: string;           // optional link to a User account (same person)
  name: string;
  type: SellerType;
  phone: string;             // E.164, natural unique key
  email?: string;
  description?: string;      // store description shown in Store Settings
  imageUrl?: string;         // store logo / profile icon URL
  bannerUrl?: string;        // wide banner image shown behind store header
  location: string;          // display string e.g. "Nizamabad, Telangana"
  pincode: string;           // stored so re-geocoding is possible on location updates
  lat: number;               // from GeocodePort
  lng: number;               // from GeocodePort
  deliveryZones: ShipsTo[];  // seller-level coverage; individual products may narrow this
  fssaiNumber?: string;
  businessType?: BusinessType; // kirana only — retail or wholesale
  address?: string;          // full street / area address displayed on store profile
  socialHandles?: {
    instagram?: string;
    facebook?:  string;
    whatsapp?:  string;
    website?:   string;
    youtube?:   string;
  };
  verified: boolean;         // always false on create; admin-only flip
  verifiedAt?: string;       // ISO timestamp set at the moment of verification
  documentUrls: string[];    // uploaded via StoragePort (FSSAI scan, Aadhaar etc.)
  vacationMode?: boolean;    // when true, new order intake is paused
  vacationUntil?: string;    // optional ISO date — informational; not auto-enforced
  createdAt: string;
  updatedAt: string;
}

// lat/lng omitted — derived from pincode via GeocodePort
// verified, verifiedAt, documentUrls, id, timestamps are server-managed
export type CreateSellerInput = Omit<
  Seller,
  'id' | 'lat' | 'lng' | 'verified' | 'verifiedAt' | 'documentUrls' | 'createdAt' | 'updatedAt'
>;

// phone immutable after creation
// documentUrls managed via dedicated /documents endpoint — not patchable here
export type UpdateSellerInput = Partial<Omit<CreateSellerInput, 'phone'>>;

// ── SellerMember ──────────────────────────────────────────────────────────────
// Links a user (by phone) to a seller account with a role.
// Invites are created by an owner/admin; status starts as 'pending' until the
// invited user logs in and accepts.

export type SellerRole = 'owner' | 'manager' | 'staff';
export type MemberStatus = 'active' | 'pending';

export interface SellerMember {
  id: string;
  sellerId: string;
  userId?: string;      // set once the invited person has a User account
  name: string;         // denormalized — avoids a User lookup on every team list
  phone: string;        // used to match the invite when the invitee logs in
  role: SellerRole;
  status: MemberStatus;
  imageUrl?: string;    // user's profile photo — enriched at query time, not stored
  invitedAt: string;    // ISO timestamp
  joinedAt?: string;    // set when status transitions to 'active'
}

export type CreateSellerMemberInput = Omit<
  SellerMember, 'id' | 'sellerId' | 'status' | 'invitedAt' | 'joinedAt'
>;

export type UpdateSellerMemberInput = Pick<SellerMember, 'role'>;

// ── Agent ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'available' | 'on_delivery' | 'offline';

export interface Agent {
  id:               string;   // same as userId for simplicity
  userId:           string;
  name:             string;
  phone:            string;
  email?:           string;
  vehicleType?:     string;
  vehicleNumber?:   string;
  zone:             string;
  status:           AgentStatus;
  totalDeliveries:  number;
  rating:           number;
  kycVerified:      boolean;
  bankLinked:       boolean;
  createdAt:        string;
  updatedAt:        string;
}

export interface AgentBank {
  agentId:           string;
  accountHolderName: string;
  accountNumber:     string;
  ifscCode:          string;
  bankName:          string;
  upiId?:            string;
  updatedAt:         string;
}

export interface AgentKyc {
  agentId:               string;
  aadhaarNumber:         string;
  panNumber:             string;
  drivingLicenseNumber:  string;
  vehicleRcNumber:       string;
  insurancePolicyNumber?: string;
  updatedAt:             string;
}

export interface StoreOnboardingRequest {
  id:                  string;
  storeName:           string;
  ownerName:           string;
  phone:               string;
  location:            string;
  pincode:             string;
  storeType:           string;
  kycDocUrl?:          string;
  status:              'pending' | 'approved' | 'rejected';
  submittedAt:         string;
  notes?:              string;
  reviewedByAgentId?:  string;
}

// ── BankAccount ───────────────────────────────────────────────────────────────
// Payment details for a seller. At most one per seller (upsert semantics).

export interface BankAccount {
  id: string;
  sellerId: string;
  accountHolderName: string;
  accountNumber: string;     // stored in full; serve masked (last 4) to the UI
  ifscCode: string;
  bankName: string;
  upiId?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateBankAccountInput = Omit<BankAccount, 'id' | 'sellerId' | 'createdAt' | 'updatedAt'>;
export type UpdateBankAccountInput = Partial<CreateBankAccountInput>;
