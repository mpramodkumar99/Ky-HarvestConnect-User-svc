# Building `user-svc` — HarvestConnect User Service

**Port:** `3002` · **ClickUp tasks:** UC-USR-01, UC-USR-02, UC-USR-03

This service is the second in the HarvestConnect microservices build order. It owns everything about people on the platform: buyer profiles, delivery addresses, seller onboarding, seller team management, KYC documents, and payment details. It also exposes the inter-service verification contract that `catalog-svc` calls before allowing a seller to publish a product.

---

## What this service owns

| Domain | Responsibility |
|--------|---------------|
| **Users (buyers)** | Profile creation, phone uniqueness, profile updates |
| **Addresses** | Multi-address per buyer, single-default rule, geocoded lat/lng |
| **Sellers** | Onboarding, type classification, profile (name, photo, description, delivery zones), verification state machine |
| **Seller documents** | Self-submitted KYC document URLs (FSSAI scan, Aadhaar) — pending admin verification |
| **Seller team** | Invite/role/activate/remove team members (owner / manager / staff) |
| **Bank accounts** | Payout details per seller — upsert, masked on read |
| **Inter-service contract** | `GET /v1/sellers/:id` — catalog-svc calls this to check `verified` |

---

## Endpoints

### Users
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `POST` | `/v1/users` | 201, 400, 409 | Create buyer/seller user profile (UC-USR-01) |
| `GET` | `/v1/users/:id` | 200, 404 | Fetch user by ID |
| `PATCH` | `/v1/users/:id` | 200, 400, 404 | Update name / email / type |

### Addresses
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `GET` | `/v1/users/:id/addresses` | 200, 404 | List all addresses for a user |
| `POST` | `/v1/users/:id/addresses` | 201, 400, 404 | Add address; geocodes pincode internally |
| `PATCH` | `/v1/users/:id/addresses/:addrId` | 200, 400, 403, 404 | Update address; re-geocodes if pincode changes |
| `DELETE` | `/v1/users/:id/addresses/:addrId` | 204, 403, 404 | Delete address |

### Sellers
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `POST` | `/v1/sellers` | 201, 400, 409 | Create seller; always starts unverified |
| `GET` | `/v1/sellers` | 200 | List sellers — filters: `type`, `verified`, `userId`, `phone` |
| `GET` | `/v1/sellers/:id` | 200, 404 | Fetch seller by ID (inter-service contract) |
| `PATCH` | `/v1/sellers/:id` | 200, 400, 404 | Update seller profile |
| `PATCH` | `/v1/sellers/:id/verify` | 200, 403, 404 | Admin-only: mark seller verified |

### Seller documents
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `POST` | `/v1/sellers/:id/documents` | 201, 400, 404 | Seller self-submits a document URL for KYC |
| `DELETE` | `/v1/sellers/:id/documents` | 200, 400, 404 | Remove a document URL from the list |

### Seller team members
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `GET` | `/v1/sellers/:id/members` | 200, 404 | List team members |
| `POST` | `/v1/sellers/:id/members` | 201, 400, 404, 409 | Invite a new team member |
| `PATCH` | `/v1/sellers/:id/members/:memberId` | 200, 400, 403, 404 | Change member role |
| `PATCH` | `/v1/sellers/:id/members/:memberId/activate` | 200, 401, 403, 404, 409 | Accept invite (requires `X-User-Id` header) |
| `DELETE` | `/v1/sellers/:id/members/:memberId` | 204, 403, 404 | Remove member |

### Seller bank account
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `GET` | `/v1/sellers/:id/bank-account` | 200, 404 | Get bank account (account number masked to last 4) |
| `POST` | `/v1/sellers/:id/bank-account` | 201, 400, 404 | Create or replace bank account (upsert) |
| `PATCH` | `/v1/sellers/:id/bank-account` | 200, 400, 404 | Partial update |

### Cross-resource
| Method | Path | Status codes | Description |
|--------|------|--------------|-------------|
| `GET` | `/v1/users/:id/sellers` | 200 | All seller accounts linked to a user (for multi-store switcher) |

---

## File structure

```
src/
  types.ts        — User, Address, Seller, SellerMember, BankAccount interfaces + derived input types
  schemas.ts      — Zod schemas for all create/update/document operations
  ports.ts        — GeocodePort + StoragePort interfaces + Fake/Local implementations
  repository.ts   — All repository interfaces + InMemory implementations
  service.ts      — UserService + SellerService (all business rules live here)
  routes.ts       — All HTTP handlers; maps HTTP ↔ service calls
  server.ts       — Fastify setup, dependency wiring, health check
```

---

## New concepts introduced (vs catalog-svc)

### 1. Port / adapter pattern — real vendor isolation

`catalog-svc` had no external dependencies. `user-svc` needs:
- **Geocoding** — converting a pincode to lat/lng (Google Maps later, fake table now)
- **File storage** — seller document uploads (S3 later, local disk now)

The pattern: define a TypeScript **interface** (the port), write a **fake implementation** for development, write the **real implementation** later. The service only ever sees the interface — it has no idea whether it's talking to Google or a lookup table.

```
GeocodePort (interface)
  ├── FakeGeocoder    ← used now  (pincode → fixed coords from a lookup table)
  └── GoogleGeocoder  ← swap in later (pincode → real lat/lng via Maps API)
```

**Swap cost:** one line in `server.ts`. Zero changes to service, routes, or tests.

### 2. Domain error classes

Instead of scattering `if (!x) return reply.status(404)` across route handlers, the service throws typed errors (`NotFoundError`, `ConflictError`, `ForbiddenError`). Routes catch them once with a shared `handleError` function and map to HTTP status codes. This keeps business logic out of the HTTP layer.

```
service throws NotFoundError  →  handleError →  reply 404
service throws ConflictError  →  handleError →  reply 409
service throws ForbiddenError →  handleError →  reply 403
```

### 3. Single-default-address rule

A buyer can have many addresses but only one default. When `POST /addresses` is called with `isDefault: true`, the service must first unset the current default, then create the new one. This is a business rule — it lives in the service layer.

```
addAddress(userId, input) {
  if (input.isDefault) {
    await addresses.clearDefaultForUser(userId)  ← atomically unsets all defaults
  }
  return addresses.create(userId, input, coords)
}
```

### 4. Phone as the natural unique key

Both buyers and sellers are identified by their Indian phone number in E.164 format (`+91XXXXXXXXXX`). On `POST /v1/users` and `POST /v1/sellers`, the service calls `findByPhone` before inserting — duplicate phone → `ConflictError` → 409. The phone number is **immutable after creation** — excluded from all update schemas.

### 5. Verification state machine

Sellers start with `verified: false`. An admin flips it via `PATCH /v1/sellers/:id/verify` using the `X-Admin-Key` header (dev placeholder until auth-svc is built). Sellers cannot self-verify.

```
POST /v1/sellers          → verified: false  (always; repository hardcodes this)
PATCH /sellers/:id/verify → verified: true   (admin-only, X-Admin-Key header)
GET  /sellers/:id         → { verified: true/false } ← catalog-svc reads this
```

### 6. Inter-service contract

`catalog-svc` calls `GET /v1/sellers/:id` before allowing `createProduct`. The response shape is stable and lean:

```json
{
  "success": true,
  "data": {
    "id": "...",
    "verified": true,
    "type": "farmer",
    ...
  }
}
```

This endpoint is a machine-to-machine contract. Build it to be stable.

### 7. Team member invite flow (new)

Seller team membership follows a pending → active lifecycle:

```
POST /v1/sellers/:id/members     → status: 'pending', joinedAt: undefined
PATCH .../activate (X-User-Id)   → status: 'active',  joinedAt: <now>
```

The invite stores the member's phone number. When the invitee logs into the seller app, their phone is matched to any pending invite across all sellers, and the `activate` endpoint transitions them to `active`. The `userId` field on `SellerMember` is set at activation time, linking the team record back to the User account.

### 8. Sensitive data masking on read (new)

Bank account numbers are stored in full but never returned in full to the client. Every bank account read path (GET, POST response, PATCH response) masks `accountNumber` to the last 4 digits before sending:

```typescript
// In routes.ts — applied on all three bank account read paths
data: { ...account, accountNumber: `···${account.accountNumber.slice(-4)}` }
```

The full number is only ever in the in-memory store (and will be in the database later). This is the correct pattern regardless of whether the transport is HTTPS — defence in depth means you don't leak it even in logs or accidental response leaks.

### 9. Document self-upload via URL submission (new)

The `documentUrls` field on `Seller` is not part of the regular PATCH schema. Sellers manage documents through dedicated endpoints:
- `POST /v1/sellers/:id/documents` with `{ url }` — appends a URL (idempotent if the URL already exists)
- `DELETE /v1/sellers/:id/documents` with `{ url }` — removes the specific URL

The actual file upload to storage (S3 or local disk) is a separate step handled client-side. The seller app uploads the file first, receives a URL, then calls this endpoint to register it. This decouples file storage from the profile record and allows the admin to review uploaded URLs before verification.

---

## Domain types

### User
```typescript
interface User {
  id: string;
  name: string;
  phone: string;       // E.164: +919876543210; immutable after creation
  email?: string;
  type: 'buyer' | 'seller';
  verified: boolean;   // reserved for future email/KYC — always false for now
  createdAt: string;
  updatedAt: string;
}
```

### Address
```typescript
interface Address {
  id: string;
  userId: string;      // owner — foreign key to User
  label: string;       // 'Home', 'Work', 'Other', or custom
  line1: string;
  line2?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;     // 6-digit Indian pincode, used for geocoding
  lat: number;         // from GeocodePort — never trust the client
  lng: number;
  isDefault: boolean;  // at most one true per userId; single-default rule
  createdAt: string;
  updatedAt: string;
}
```

### Seller
```typescript
type SellerType = 'farmer' | 'artisan' | 'dairy' | 'homefood' | 'trades';
type ShipsTo    = 'mandal' | 'district' | 'state' | 'national';

interface Seller {
  id: string;
  userId?: string;           // optional link to a User account
  name: string;
  type: SellerType;
  phone: string;             // E.164; immutable after creation
  email?: string;
  description?: string;      // store description — shown in Store Settings
  imageUrl?: string;         // store logo / photo URL
  location: string;          // display string: "Nizamabad, Telangana"
  pincode: string;           // stored for re-geocoding on location updates
  lat: number;               // from GeocodePort
  lng: number;
  deliveryZones: ShipsTo[];  // seller-level coverage; individual products may narrow this
  fssaiNumber?: string;
  verified: boolean;         // always false on create; admin-only flip
  verifiedAt?: string;       // ISO timestamp set when verified
  documentUrls: string[];    // managed via /documents endpoint; not in regular PATCH
  createdAt: string;
  updatedAt: string;
}
```

Key rules baked in:
- `verified` → hardcoded `false` on create regardless of caller input
- `documentUrls` → excluded from `UpdateSellerInput`; managed via dedicated endpoints
- `lat`/`lng` → always from `GeocodePort.fromPincode(pincode)`; re-derived when `pincode` changes on PATCH
- `SellerType` now includes `'trades'` to cover service providers (electricians, mechanics, plumbers)
- `deliveryZones` defaults to `[]` if omitted at creation

### SellerMember
```typescript
type SellerRole   = 'owner' | 'manager' | 'staff';
type MemberStatus = 'active' | 'pending';

interface SellerMember {
  id: string;
  sellerId: string;
  userId?: string;      // set at activation — links to the User account
  name: string;         // denormalized for display without extra User lookup
  phone: string;        // used to match the pending invite when invitee logs in
  role: SellerRole;
  status: MemberStatus; // 'pending' on invite → 'active' on accept
  invitedAt: string;
  joinedAt?: string;    // set at activation
}
```

### BankAccount
```typescript
interface BankAccount {
  id: string;
  sellerId: string;
  accountHolderName: string;
  accountNumber: string;   // stored in full; always masked (last 4) in API responses
  ifscCode: string;
  bankName: string;
  upiId?: string;
  createdAt: string;
  updatedAt: string;
}
```

At most one per seller. Use `POST /v1/sellers/:id/bank-account` to create or replace (upsert semantics).

---

## Port interfaces

### GeocodePort
```typescript
interface GeocodePort {
  fromPincode(pincode: string): Promise<{ lat: number; lng: number }>;
}
```
**FakeGeocoder** — lookup table of ~20 Telangana/AP pincodes. Unknown pincodes fall back to Hyderabad city centre so the service never throws during development.

**GoogleGeocoder** (future) — Maps Geocoding API with the pincode as query string.

### StoragePort
```typescript
interface StoragePort {
  save(filename: string, data: Buffer): Promise<string>;  // returns URL
  delete(url: string): Promise<void>;
}
```
**LocalDiskStorage** — writes to `./uploads/` relative to the process; returns `/uploads/filename`.

**S3Storage** (future) — `PutObjectCommand` to a bucket; returns CloudFront or S3 URL.

---

## Repository interfaces

### UserRepository
```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
}
```

### AddressRepository
```typescript
interface AddressRepository {
  findByUserId(userId: string): Promise<Address[]>;
  findById(id: string): Promise<Address | null>;
  clearDefaultForUser(userId: string): Promise<void>;
  create(userId: string, input: CreateAddressInput, coords: GeoPoint): Promise<Address>;
  update(id: string, input: UpdateAddressInput & Partial<GeoPoint>): Promise<Address | null>;
  delete(id: string): Promise<boolean>;
}
```
`clearDefaultForUser` is the atomic "unset all defaults" operation the single-default rule depends on.

### SellerRepository
```typescript
interface SellerRepository {
  findAll(filters?: {
    type?: string;
    verified?: boolean;
    userId?: string;   // ← new: find all sellers linked to a user
    phone?: string;    // ← new: phone-based lookup for login flow
  }): Promise<Seller[]>;
  findById(id: string): Promise<Seller | null>;
  findByPhone(phone: string): Promise<Seller | null>;
  findByUserId(userId: string): Promise<Seller[]>;  // ← new: backs GET /v1/users/:id/sellers
  create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller>;
  update(id: string, input: UpdateSellerInput): Promise<Seller | null>;
  addDocument(id: string, url: string): Promise<Seller | null>;     // ← new
  removeDocument(id: string, url: string): Promise<Seller | null>;  // ← new
  verify(id: string): Promise<Seller | null>;
}
```

### SellerMemberRepository (new)
```typescript
interface SellerMemberRepository {
  findBySellerId(sellerId: string): Promise<SellerMember[]>;
  findById(id: string): Promise<SellerMember | null>;
  findBySellerAndPhone(sellerId: string, phone: string): Promise<SellerMember | null>;
  create(sellerId: string, input: CreateSellerMemberInput): Promise<SellerMember>;
  update(id: string, input: UpdateSellerMemberInput): Promise<SellerMember | null>;
  activate(id: string, userId: string): Promise<SellerMember | null>;
  delete(id: string): Promise<boolean>;
}
```

### BankAccountRepository (new)
```typescript
interface BankAccountRepository {
  findBySellerId(sellerId: string): Promise<BankAccount | null>;
  upsert(sellerId: string, input: CreateBankAccountInput): Promise<BankAccount>;
  update(sellerId: string, input: UpdateBankAccountInput): Promise<BankAccount | null>;
}
```
Keyed by `sellerId` — at most one record per seller. `upsert` creates if absent, replaces if present.

---

## Service layer — where business rules live

### UserService rules
| Rule | Where enforced |
|------|---------------|
| Phone must be unique across users | `createUser` — calls `findByPhone` before insert |
| Phone is immutable | `UpdateUserInput` excludes phone via `Omit` |
| Address belongs to the requesting user | `updateAddress` / `deleteAddress` — checks `address.userId === userId` |
| Only one default address per user | `addAddress` / `updateAddress` — calls `clearDefaultForUser` when `isDefault: true` |
| Geocoding is always server-side | `addAddress` / `updateAddress` — calls `GeocodePort`; never trusts caller-supplied coords |

### SellerService rules
| Rule | Where enforced |
|------|---------------|
| Phone must be unique across sellers | `createSeller` — calls `findByPhone` before insert |
| Seller always starts unverified | `repository.create` hardcodes `verified: false` |
| `verifiedAt` set only by the verify operation | `repository.verify` sets both `verified` and `verifiedAt` |
| Geocoding on create; re-geocodes when pincode changes | Service calls `GeocodePort` in `createSeller` and `updateSeller` |
| Document URLs managed separately | `addDocument` / `removeDocument` service methods; `documentUrls` excluded from `UpdateSellerInput` |
| Team member phone unique per seller | `inviteMember` calls `findBySellerAndPhone` before insert → 409 if duplicate |
| Member belongs to this seller account | `updateMemberRole` / `activateMember` / `removeMember` check `member.sellerId === sellerId` |
| Bank account masked on all reads | Routes apply `···{last4}` mask before sending in all three bank account responses |
| At most one bank account per seller | `BankAccountRepository.upsert` keyed by `sellerId` |
| Seller must exist before member/bank operations | Service calls `getSeller(id)` at the start of all sub-resource operations |

---

## Validation schemas (key points)

### createSellerSchema
```typescript
z.object({
  userId:        z.string().uuid().optional(),
  name:          z.string().min(1).max(120),
  type:          z.enum(['farmer', 'artisan', 'dairy', 'homefood', 'trades']),
  phone:         phoneSchema,                           // +91[6-9]XXXXXXXXX
  email:         z.string().email().optional(),
  description:   z.string().max(500).optional(),
  imageUrl:      z.string().url().optional(),
  location:      z.string().min(1).max(120),
  pincode:       pincodeSchema,                         // /^\d{6}$/
  deliveryZones: z.array(z.enum(['mandal','district','state','national'])).default([]),
  fssaiNumber:   z.string().max(14).optional(),
})
```

### createBankAccountSchema
```typescript
z.object({
  accountHolderName: z.string().min(1).max(120),
  accountNumber:     z.string().regex(/^\d{9,18}$/),           // 9–18 digit number
  ifscCode:          z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/), // e.g. HDFC0001234
  bankName:          z.string().min(1).max(100),
  upiId:             z.string().max(50).optional(),
})
```

---

## Error handling pattern

```typescript
// Typed domain errors thrown by service
export class NotFoundError  extends Error { ... }
export class ConflictError  extends Error { ... }
export class ForbiddenError extends Error { ... }

// Single shared handler in routes — catches domain errors; re-throws unexpected ones
function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof NotFoundError)  return reply.status(404).send({ ... });
  if (err instanceof ConflictError)  return reply.status(409).send({ ... });
  if (err instanceof ForbiddenError) return reply.status(403).send({ ... });
  throw err;  // let Fastify handle truly unexpected errors
}

// Every route handler follows the same pattern
try {
  const result = await service.someMethod(data);
  return reply.status(201).send({ success: true, data: result });
} catch (err) {
  return handleError(err, reply);
}
```

---

## Running the service

```bash
npm install
npm run dev
# → user-svc running on http://localhost:3002
```

### Test with curl

```bash
# ── User ─────────────────────────────────────────────────────────────────────

# Create a buyer
curl -X POST http://localhost:3002/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Arjun Reddy","phone":"+919876543210","type":"buyer"}'

# Duplicate phone → 409
curl -X POST http://localhost:3002/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Another","phone":"+919876543210","type":"buyer"}'

# ── Address ───────────────────────────────────────────────────────────────────

# Add an address (geocoder called internally)
curl -X POST http://localhost:3002/v1/users/USER_ID/addresses \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Home",
    "line1": "12-3-456, Gandhi Nagar",
    "city": "Nizamabad",
    "district": "Nizamabad",
    "state": "Telangana",
    "pincode": "503001",
    "isDefault": true
  }'

# ── Seller ────────────────────────────────────────────────────────────────────

# Create a seller (starts unverified)
curl -X POST http://localhost:3002/v1/sellers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ravi Organic Farm",
    "type": "farmer",
    "phone": "+919000001001",
    "location": "Nizamabad, Telangana",
    "pincode": "503001",
    "description": "Fresh organic vegetables direct from the farm",
    "deliveryZones": ["mandal", "district"],
    "fssaiNumber": "10019042000999"
  }'

# Look up a seller by phone (for login flow)
curl "http://localhost:3002/v1/sellers?phone=+919000001001"

# Get all sellers linked to a user (for multi-store switcher)
curl http://localhost:3002/v1/users/USER_ID/sellers

# Filter by type
curl "http://localhost:3002/v1/sellers?type=farmer&verified=true"

# Admin verifies a seller
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID/verify \
  -H "X-Admin-Key: dev-admin-key"

# Try verify without admin key → 403
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID/verify

# Inter-service call (as catalog-svc would make it)
curl http://localhost:3002/v1/sellers/SELLER_ID
# → { success: true, data: { id: "...", verified: true, type: "farmer", ... } }

# Update seller profile (store photo + description)
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Award-winning organic turmeric from Nizamabad",
    "imageUrl": "https://example.com/store-photo.jpg",
    "deliveryZones": ["mandal", "district", "state"]
  }'

# ── Documents (KYC) ───────────────────────────────────────────────────────────

# Seller submits a document URL for KYC review
curl -X POST http://localhost:3002/v1/sellers/SELLER_ID/documents \
  -H "Content-Type: application/json" \
  -d '{"url":"https://storage.example.com/fssai-scan.pdf"}'

# Remove a document
curl -X DELETE http://localhost:3002/v1/sellers/SELLER_ID/documents \
  -H "Content-Type: application/json" \
  -d '{"url":"https://storage.example.com/fssai-scan.pdf"}'

# ── Team members ──────────────────────────────────────────────────────────────

# Invite a manager
curl -X POST http://localhost:3002/v1/sellers/SELLER_ID/members \
  -H "Content-Type: application/json" \
  -d '{"name":"Ramesh Kumar","phone":"+919111111111","role":"manager"}'

# List team — shows pending + active
curl http://localhost:3002/v1/sellers/SELLER_ID/members

# Change a member's role
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID/members/MEMBER_ID \
  -H "Content-Type: application/json" \
  -d '{"role":"staff"}'

# Accept a pending invite (the invited user calls this when they log in)
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID/members/MEMBER_ID/activate \
  -H "X-User-Id: USER_ID"

# Remove a member
curl -X DELETE http://localhost:3002/v1/sellers/SELLER_ID/members/MEMBER_ID

# ── Bank account ──────────────────────────────────────────────────────────────

# Set bank account (upsert — safe to call again to update)
curl -X POST http://localhost:3002/v1/sellers/SELLER_ID/bank-account \
  -H "Content-Type: application/json" \
  -d '{
    "accountHolderName": "Ravi Kumar",
    "accountNumber": "123456789012",
    "ifscCode": "HDFC0001234",
    "bankName": "HDFC Bank",
    "upiId": "ravi@hdfcbank"
  }'

# Fetch bank account — account number masked to last 4
curl http://localhost:3002/v1/sellers/SELLER_ID/bank-account
# → { data: { accountNumber: "···9012", bankName: "HDFC Bank", ... } }

# Partial update (e.g. add UPI ID)
curl -X PATCH http://localhost:3002/v1/sellers/SELLER_ID/bank-account \
  -H "Content-Type: application/json" \
  -d '{"upiId":"ravi@paytm"}'

# Try bank account on unknown seller → 404
curl http://localhost:3002/v1/sellers/unknown-id/bank-account
```

---

## How catalog-svc connects to this service

When the seller verification guard is added to `catalog-svc`, the check will look like:

```typescript
// In catalog-svc service.ts — createProduct business rule
async createProduct(input: CreateProductInput) {
  const res = await fetch(`http://localhost:3002/v1/sellers/${input.sellerId}`);
  const body = await res.json();

  if (!body.success || !body.data.verified) {
    throw new ForbiddenError('Seller is not verified. Products cannot be listed until verification is complete.');
  }

  return this.repo.create(input);
}
```

This is why `GET /v1/sellers/:id` is a first-class endpoint — catalog-svc is its primary consumer, not the seller app UI.

---

## Seller seed data

The in-memory repository seeds 13 sellers that mirror the `sellerId` values used in catalog-svc seed data. This means product queries using seller IDs resolve correctly during local development without needing the services to share a database.

| Seller | Type | Phone | Delivery zones |
|--------|------|-------|----------------|
| Nizamabad Agri Co-op | farmer | +919000000101 | state, national |
| Spice Route Nizamabad | farmer | +919000000105 | state, national |
| Desi Dairy Armoor | dairy | +919000000112 | mandal, district |
| Amma Kitchen | homefood | +919000000113 | mandal, district, state |
| Village Mill Nizamabad | homefood | +919000000115 | state, national |
| Pochampally Weavers | artisan | +919000000124 | state, national |
| Quick Fix Electricals | trades | +919000000201 | mandal |
| CoolTech Services | trades | +919000000207 | mandal, district |
| AutoCare Nizamabad | trades | +919000000212 | mandal, district |
| … and 4 more | | | |

---

## Vendor swap reference

| Port | Now (dev) | Later (prod) | Swap cost |
|------|-----------|--------------|-----------|
| `GeocodePort` | `FakeGeocoder` — pincode lookup table | `GoogleGeocoder` — Maps Geocoding API | 1 adapter file + API key |
| `StoragePort` | `LocalDiskStorage` — `./uploads/` dir | `S3Storage` — S3 bucket + CloudFront | 1 adapter file + bucket config |

---

## Next service in build order

After `user-svc`, the ClickUp order moves to **`order-svc`** (UC-ORD-01 through UC-ORD-04):
- Cart management
- Checkout and order placement
- Pre-order slot system
- Cancel and refund

`order-svc` will make synchronous calls to both `catalog-svc` (fetch current price/stock) and `user-svc` (fetch delivery address, verify seller) — both services must be running before order-svc can function.

---

## Checklist — UC-XCUT-00 (applied to this service)

- [x] Response envelope: `{ success, data, meta? }` on all 2xx; `{ success: false, error: { type, title, status, detail? } }` on all errors
- [x] Validation: Zod schemas at every POST/PATCH boundary; invalid input → 400 with issue details
- [x] No client-trusted coords: `lat`/`lng` always from `GeocodePort`, never from request body
- [x] Ports not vendors: `GeocodePort` + `StoragePort` interfaces only in service; adapters only in `ports.ts`
- [x] Health check: `GET /health` → `{ status: 'ok', service: 'user-svc' }`
- [x] Structured logs: Fastify logger enabled; `requestId` on every request
- [x] Phone immutable: excluded from all update schemas (`updateUserSchema`, `updateSellerSchema`)
- [x] `verified` server-managed: hardcoded `false` on seller create; only `verify` endpoint sets it
- [x] Bank account number masked: `···{last4}` applied on all three read paths in routes
- [x] `documentUrls` not in regular PATCH: managed exclusively via `/documents` endpoint
- [x] Team member ownership checked: `member.sellerId === sellerId` before all member mutations
- [x] Seller existence checked before sub-resource operations: all member/bank/document methods call `getSeller(id)` first
- [x] Single bank account per seller: `BankAccountRepository` keyed by `sellerId`; `upsert` semantics
- [x] IFSC regex validated: `^[A-Z]{4}0[A-Z0-9]{6}$` in `createBankAccountSchema`
