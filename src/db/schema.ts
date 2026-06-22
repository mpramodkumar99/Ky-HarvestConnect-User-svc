import { pgTable, text, boolean, doublePrecision, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

// Mirrors types.ts exactly — see that file for field-level documentation.

export const users = pgTable('users', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  phone:         text('phone').notNull().unique(),
  email:         text('email'),
  type:          text('type').notNull(), // 'buyer' | 'seller'
  verified:      boolean('verified').notNull().default(false),
  walletBalance: integer('wallet_balance').notNull().default(0), // stored in paise
  referralCode:  text('referral_code').unique(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = pgTable('referrals', {
  id:                  text('id').primaryKey(),
  referrerId:          text('referrer_id').notNull(),  // user who owns/shared the code
  refereeId:           text('referee_id').notNull(),   // user who applied the code (unique — one referral per user)
  status:              text('status').notNull(),        // 'pending' | 'rewarded'
  rewardReferrerPaise: integer('reward_referrer_paise').notNull().default(10000), // ₹100
  rewardRefereePaise:  integer('reward_referee_paise').notNull().default(5000),   // ₹50
  orderId:             text('order_id'),               // set when first order triggers reward
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  type:        text('type').notNull(),        // 'credit' | 'debit'
  amount:      integer('amount').notNull(),   // paise, always positive
  balance:     integer('balance').notNull(),  // balance after this txn
  description: text('description').notNull(),
  source:      text('source'),               // 'upi' | 'card' | 'order' | 'refund'
  referenceId: text('reference_id'),         // paymentMethodId or orderId
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable('addresses', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  label:     text('label').notNull(),
  line1:     text('line1').notNull(),
  line2:     text('line2'),
  city:      text('city').notNull(),
  district:  text('district').notNull(),
  state:     text('state').notNull(),
  pincode:   text('pincode').notNull(),
  lat:       doublePrecision('lat').notNull(),
  lng:       doublePrecision('lng').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sellers = pgTable('sellers', {
  id:            text('id').primaryKey(),
  userId:        text('user_id'),
  name:          text('name').notNull(),
  type:          text('type').notNull(), // SellerType
  phone:         text('phone').notNull().unique(),
  email:         text('email'),
  description:   text('description'),
  imageUrl:      text('image_url'),
  location:      text('location').notNull(),
  pincode:       text('pincode').notNull(),
  lat:           doublePrecision('lat').notNull(),
  lng:           doublePrecision('lng').notNull(),
  deliveryZones: jsonb('delivery_zones').notNull().$type<string[]>(),
  fssaiNumber:   text('fssai_number'),
  verified:      boolean('verified').notNull().default(false),
  verifiedAt:    timestamp('verified_at', { withTimezone: true }),
  documentUrls:  jsonb('document_urls').notNull().$type<string[]>().default([]),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sellerMembers = pgTable('seller_members', {
  id:        text('id').primaryKey(),
  sellerId:  text('seller_id').notNull(),
  userId:    text('user_id'),
  name:      text('name').notNull(),
  phone:     text('phone').notNull(),
  role:      text('role').notNull(),   // SellerRole
  status:    text('status').notNull(), // MemberStatus
  invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  joinedAt:  timestamp('joined_at', { withTimezone: true }),
});

export const bankAccounts = pgTable('bank_accounts', {
  id:                text('id').primaryKey(),
  sellerId:          text('seller_id').notNull().unique(),
  accountHolderName: text('account_holder_name').notNull(),
  accountNumber:     text('account_number').notNull(),
  ifscCode:          text('ifsc_code').notNull(),
  bankName:          text('bank_name').notNull(),
  upiId:             text('upi_id'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const wishlistItems = pgTable('wishlist_items', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  productId: text('product_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  productId:   text('product_id').notNull(),
  productName: text('product_name').notNull(),
  vendorId:    text('vendor_id').notNull(),
  vendorName:  text('vendor_name').notNull(),
  quantity:    integer('quantity').notNull().default(1),
  unitPrice:   integer('unit_price').notNull(),
  image:       text('image'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
