import { z } from 'zod';

// Indian phone number in E.164 format: +91 followed by a 10-digit mobile number.
// First digit after +91 must be 6–9 (valid Indian mobile prefixes).
const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian mobile number in +91XXXXXXXXXX format');

// 6-digit Indian pincode
const pincodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Pincode must be exactly 6 digits');

const shipsToValues = ['mandal', 'district', 'state', 'national'] as const;

// ── User schemas ──────────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  name:  z.string().min(1).max(100),
  phone: phoneSchema,
  email: z.string().email().optional(),
  type:  z.enum(['buyer', 'seller']).default('buyer'),
});

// phone is immutable — excluded entirely from updates
export const updateUserSchema = createUserSchema
  .omit({ phone: true })
  .partial();

// ── Address schemas ───────────────────────────────────────────────────────────

export const createAddressSchema = z.object({
  label:     z.string().min(1).max(30).default('Home'),
  line1:     z.string().min(1).max(200),
  line2:     z.string().max(200).optional(),
  city:      z.string().min(1).max(100),
  district:  z.string().min(1).max(100),
  state:     z.string().min(1).max(100),
  pincode:   pincodeSchema,
  isDefault: z.boolean().default(false),
});

// Every field optional on PATCH — service re-geocodes only when pincode changes
export const updateAddressSchema = createAddressSchema.partial();

// ── Seller schemas ────────────────────────────────────────────────────────────

export const createSellerSchema = z.object({
  userId:        z.string().uuid().optional(),
  name:          z.string().min(1).max(120),
  type:          z.enum(['farmer', 'artisan', 'dairy', 'homefood', 'trades']),
  phone:         phoneSchema,
  email:         z.string().email().optional(),
  description:   z.string().max(500).optional(),
  imageUrl:      z.string().url().optional(),
  location:      z.string().min(1).max(120),
  pincode:       pincodeSchema,
  deliveryZones: z.array(z.enum(shipsToValues)).default([]),
  fssaiNumber:   z.string().max(14).optional(),
});

// phone immutable — excluded from seller updates as well
// documentUrls managed via dedicated /documents endpoint
export const updateSellerSchema = createSellerSchema
  .omit({ phone: true })
  .partial()
  .extend({
    vacationMode:  z.boolean().optional(),
    vacationUntil: z.string().optional(),
  });

// ── SellerMember schemas ──────────────────────────────────────────────────────

export const createSellerMemberSchema = z.object({
  userId: z.string().uuid().optional(),
  name:   z.string().min(1).max(100),
  phone:  phoneSchema,
  role:   z.enum(['owner', 'manager', 'staff']),
});

export const updateSellerMemberSchema = z.object({
  role: z.enum(['owner', 'manager', 'staff']),
});

// ── BankAccount schemas ───────────────────────────────────────────────────────

export const createBankAccountSchema = z.object({
  accountHolderName: z.string().min(1).max(120),
  accountNumber:     z.string().regex(/^\d{9,18}$/, 'Must be a 9–18 digit account number'),
  ifscCode:          z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Must be a valid IFSC code'),
  bankName:          z.string().min(1).max(100),
  upiId:             z.string().max(50).optional(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

// ── Document schemas ──────────────────────────────────────────────────────────

export const addDocumentSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

export const removeDocumentSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});
