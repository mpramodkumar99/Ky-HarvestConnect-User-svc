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
  name:     z.string().min(1).max(100),
  phone:    phoneSchema,
  email:    z.string().email().optional(),
  imageUrl: z.string().optional(),
  type:     z.enum(['buyer', 'seller', 'agent']).default('buyer'),
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
  type:          z.enum(['farmer', 'artisan', 'dairy', 'homefood', 'trades', 'kirana']),
  businessType:  z.enum(['retail', 'wholesale']).optional(),
  phone:         phoneSchema,
  email:         z.string().email().optional(),
  description:   z.string().max(500).optional(),
  imageUrl:      z.string().optional(),
  bannerUrl:     z.string().optional(),
  address:       z.string().max(300).optional(),
  socialHandles: z.object({
    instagram: z.string().max(100).optional(),
    facebook:  z.string().max(200).optional(),
    whatsapp:  z.string().max(20).optional(),
    website:   z.string().max(200).optional(),
    youtube:   z.string().max(200).optional(),
  }).optional(),
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
    status:        z.enum(['live', 'offline', 'vacation']).optional(),
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

// ── Agent schemas ─────────────────────────────────────────────────────────────

export const updateAgentSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  email:         z.string().email().optional(),
  vehicleType:   z.string().max(30).optional(),
  vehicleNumber: z.string().max(20).optional(),
  zone:          z.string().max(120).optional(),
});

export const updateAgentStatusSchema = z.object({
  status: z.enum(['available', 'on_delivery', 'offline']),
});

export const agentBankSchema = z.object({
  accountHolderName: z.string().min(1).max(120),
  accountNumber:     z.string().regex(/^\d{9,18}$/, 'Must be a 9–18 digit account number'),
  ifscCode:          z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Must be a valid IFSC code'),
  bankName:          z.string().min(1).max(100),
  upiId:             z.string().max(50).optional(),
});

export const agentKycSchema = z.object({
  aadhaarNumber:         z.string().regex(/^\d{12}$/, 'Must be 12 digits'),
  panNumber:             z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'),
  drivingLicenseNumber:  z.string().min(5).max(20),
  vehicleRcNumber:       z.string().min(5).max(20),
  insurancePolicyNumber: z.string().max(30).optional(),
});

export const reviewOnboardingSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  notes:  z.string().max(500).optional(),
});

// ── Document schemas ──────────────────────────────────────────────────────────

export const addDocumentSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

export const removeDocumentSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});
