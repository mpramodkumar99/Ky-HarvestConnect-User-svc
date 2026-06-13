// ── User ──────────────────────────────────────────────────────────────────────

export type UserType = 'buyer' | 'seller';

export interface User {
  id: string;
  name: string;
  phone: string;       // E.164 format: +919876543210
  email?: string;
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

export type SellerType = 'farmer' | 'artisan' | 'dairy' | 'homefood';

export interface Seller {
  id: string;
  userId?: string;        // optional link to a User account (same person)
  name: string;
  type: SellerType;
  phone: string;          // E.164, natural unique key
  email?: string;
  location: string;       // display string e.g. "Nizamabad, Telangana"
  pincode: string;        // stored so re-geocoding is possible on location updates
  lat: number;            // from GeocodePort
  lng: number;            // from GeocodePort
  fssaiNumber?: string;
  verified: boolean;      // always false on create; admin-only flip
  verifiedAt?: string;    // ISO timestamp set at the moment of verification
  documentUrls: string[]; // uploaded via StoragePort (FSSAI scan, Aadhaar etc.)
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
export type UpdateSellerInput = Partial<Omit<CreateSellerInput, 'phone'>>;

// ── Shared ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}
