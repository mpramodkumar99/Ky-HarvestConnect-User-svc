# Building `user-svc` — HarvestConnect User Service

**Port:** `3002` · **ClickUp tasks:** UC-USR-01, UC-USR-02, UC-USR-03

This service is the second in the HarvestConnect microservices build order. It owns everything about people on the platform: buyer profiles, delivery addresses, and seller onboarding. It also exposes the inter-service verification contract that `catalog-svc` calls before allowing a seller to publish a product.

---

## What this service owns

| Domain | Responsibility |
|--------|---------------|
| **Users (buyers)** | Profile creation, phone uniqueness, profile updates |
| **Addresses** | Multi-address per buyer, single-default rule, geocoded lat/lng |
| **Sellers** | Onboarding, type classification, verification state machine |
| **Inter-service contract** | `GET /v1/sellers/:id` — catalog-svc calls this to check `verified` |

---

## Endpoints

### Users
| Method | Path | Status codes | UC |
|--------|------|--------------|----|
| `POST` | `/v1/users` | 201, 400, 409 | UC-USR-01 |
| `GET` | `/v1/users/:id` | 200, 404 | UC-USR-01 |
| `PATCH` | `/v1/users/:id` | 200, 400, 404 | UC-USR-01 |

### Addresses
| Method | Path | Status codes | UC |
|--------|------|--------------|----|
| `GET` | `/v1/users/:id/addresses` | 200, 404 | UC-USR-02 |
| `POST` | `/v1/users/:id/addresses` | 201, 400, 404 | UC-USR-02 |
| `PATCH` | `/v1/users/:id/addresses/:addrId` | 200, 400, 403, 404 | UC-USR-02 |
| `DELETE` | `/v1/users/:id/addresses/:addrId` | 204, 403, 404 | UC-USR-02 |

### Sellers
| Method | Path | Status codes | UC |
|--------|------|--------------|----|
| `POST` | `/v1/sellers` | 201, 400, 409 | UC-USR-03 |
| `GET` | `/v1/sellers/:id` | 200, 404 | UC-USR-03 (inter-service) |
| `GET` | `/v1/sellers` | 200 | UC-USR-03 |
| `PATCH` | `/v1/sellers/:id` | 200, 400, 404 | UC-USR-03 |
| `PATCH` | `/v1/sellers/:id/verify` | 200, 403, 404 | UC-USR-03 |

---

## File structure

```
src/
  types.ts        — User, Address, Seller interfaces + derived input types
  schemas.ts      — Zod schemas for all create/update operations
  ports.ts        — GeocodePort + StoragePort interfaces + Fake implementations
  repository.ts   — UserRepo, AddressRepo, SellerRepo interfaces + InMemory implementations
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

Instead of scattering `if (!x) return reply.status(404)` across route handlers, the service throws typed errors (`NotFoundError`, `ConflictError`). Routes catch them once with a shared error handler and map to HTTP status codes. This keeps business logic out of the HTTP layer.

```
service throws NotFoundError  →  route catches →  reply 404
service throws ConflictError  →  route catches →  reply 409
```

### 3. Single-default-address rule

A buyer can have many addresses but only one default. When `POST /addresses` is called with `isDefault: true`, the service must first unset the current default, then create the new one. This is a business rule — it lives in the service layer, not the repository and not the route.

```
addAddress(userId, input) {
  if (input.isDefault) {
    await addresses.clearDefaultForUser(userId)  ← atomically unsets all defaults
  }
  return addresses.create(userId, input, coords)
}
```

### 4. Phone as the natural unique key

Both buyers and sellers are identified by their Indian phone number in E.164 format (`+91XXXXXXXXXX`). On `POST /v1/users`, the service calls `findByPhone` before inserting. If a record exists, it throws `ConflictError` → 409. The phone number is **immutable after creation** — excluded from update schemas.

### 5. Verification state machine

Sellers start with `verified: false`. The platform verifies them out-of-band (documents, FSSAI check). An admin flips `verified: true` via `PATCH /v1/sellers/:id/verify`. There is no self-service verification.

```
POST /v1/sellers          → verified: false  (always)
PATCH /sellers/:id/verify → verified: true   (admin-only, X-Admin-Key header)
GET  /sellers/:id         → { verified: true/false } ← catalog-svc reads this
```

Auth middleware is not built yet. The `verify` endpoint uses an `X-Admin-Key` header as a placeholder — a hardcoded dev key in env. When `auth-svc` (UC-AUTH-01) is built, this becomes a proper role check.

### 6. Inter-service contract

`catalog-svc` will call `GET /v1/sellers/:id` before allowing `createProduct`. The response shape is deliberate:

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

This endpoint is not just for the admin UI — it is a machine-to-machine contract. Build it to be stable and lean.

---

## Domain types (overview)

### User
```typescript
interface User {
  id: string;
  name: string;
  phone: string;       // E.164: +919876543210
  email?: string;
  type: 'buyer' | 'seller';
  verified: boolean;   // reserved for future email/KYC verification
  createdAt: string;
  updatedAt: string;
}
```
- `phone` → natural unique key, immutable after creation
- `verified` → defaults false, separate admin flow (not yet implemented)

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
  lng: number;         // from GeocodePort — never trust the client
  isDefault: boolean;  // at most one true per userId
  createdAt: string;
  updatedAt: string;
}
```
- `lat`/`lng` → always derived from `pincode` via `GeocodePort`, never from caller
- `isDefault` → single-default rule enforced in service layer

### Seller
```typescript
interface Seller {
  id: string;
  userId?: string;        // optional link to a User account
  name: string;
  type: SellerType;       // 'farmer' | 'artisan' | 'dairy' | 'homefood'
  phone: string;          // E.164, natural unique key
  email?: string;
  location: string;       // display string: "Nizamabad, Telangana"
  pincode: string;        // stored for re-geocoding on updates
  lat: number;            // from GeocodePort
  lng: number;            // from GeocodePort
  fssaiNumber?: string;
  verified: boolean;      // false on create; admin flips to true
  verifiedAt?: string;    // ISO timestamp set when verified
  documentUrls: string[]; // from StoragePort — FSSAI scan, Aadhaar, etc.
  createdAt: string;
  updatedAt: string;
}
```
- `lat`/`lng` → from `GeocodePort.fromPincode(pincode)`
- `verified` → hardcoded `false` on create, regardless of caller input
- `documentUrls` → populated via separate upload flow (not in core create)
- `pincode` stored so that if seller updates `location`, coords can be re-derived

---

## Port interfaces

### GeocodePort
```typescript
interface GeocodePort {
  fromPincode(pincode: string): Promise<{ lat: number; lng: number }>;
}
```
**FakeGeocoder** — a lookup table of ~15 common Telangana pincodes. Unknown pincodes return Hyderabad city centre as fallback.

**GoogleGeocoder** (future) — calls Maps Geocoding API with the pincode as query string.

### StoragePort
```typescript
interface StoragePort {
  save(filename: string, data: Buffer): Promise<string>;  // returns URL
  delete(url: string): Promise<void>;
}
```
**LocalDiskStorage** — writes to `./uploads/` folder relative to the process. Returns `/uploads/filename` as the URL.

**S3Storage** (future) — `PutObjectCommand` to a bucket, returns CloudFront or S3 URL.

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
  findAll(filters?: { type?: string; verified?: boolean }): Promise<Seller[]>;
  findById(id: string): Promise<Seller | null>;
  findByPhone(phone: string): Promise<Seller | null>;
  create(input: CreateSellerInput, coords: GeoPoint): Promise<Seller>;
  update(id: string, input: UpdateSellerInput): Promise<Seller | null>;
  verify(id: string): Promise<Seller | null>;
}
```

---

## Service layer — where business rules live

### UserService rules
| Rule | Where enforced |
|------|---------------|
| Phone must be unique across users | `createUser` — calls `findByPhone` before insert |
| Phone is immutable | `UpdateUserInput` excludes phone via `Omit` |
| Address belongs to the requesting user | `updateAddress` / `deleteAddress` — checks `address.userId === userId` |
| Only one default address per user | `addAddress` / `updateAddress` — calls `clearDefaultForUser` when `isDefault: true` |
| Geocoding is always server-side | `addAddress` / `updateAddress` — calls `GeocodePort`, never trusts caller-supplied coords |

### SellerService rules
| Rule | Where enforced |
|------|---------------|
| Phone must be unique across sellers | `createSeller` — calls `findByPhone` before insert |
| Seller always starts unverified | `repository.create` hardcodes `verified: false` |
| `verifiedAt` is set only by the verify operation | `repository.verify` sets both `verified` and `verifiedAt` |
| Geocoding on create and on location update | Service calls `GeocodePort` when `pincode` changes |

---

## Error handling pattern

```typescript
// Typed domain errors thrown by service
export class NotFoundError extends Error { constructor(msg: string) { super(msg); this.name = 'NotFoundError'; } }
export class ConflictError extends Error  { constructor(msg: string) { super(msg); this.name = 'ConflictError'; } }
export class ForbiddenError extends Error { constructor(msg: string) { super(msg); this.name = 'ForbiddenError'; } }

// Route handler — catch once, map to status
try {
  const result = await service.createUser(data);
  return reply.status(201).send({ success: true, data: result });
} catch (err) {
  if (err instanceof ConflictError) return reply.status(409).send({ success: false, error: { type: 'conflict', title: err.message, status: 409 } });
  if (err instanceof NotFoundError) return reply.status(404).send({ success: false, error: { type: 'not_found', title: err.message, status: 404 } });
  throw err; // let Fastify handle unexpected errors
}
```

---

## Running the service

```bash
# Install dependencies
npm install

# Start with hot reload
npm run dev

# Service available at:
# http://localhost:3002
```

### Test with curl

```bash
# Create a buyer
curl -X POST http://localhost:3002/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Arjun Reddy","phone":"+919876543210","type":"buyer"}'

# Duplicate phone → 409
curl -X POST http://localhost:3002/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Another","phone":"+919876543210","type":"buyer"}'

# Add an address (geocoder called internally)
curl -X POST http://localhost:3002/v1/users/{USER_ID}/addresses \
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

# Create a seller
curl -X POST http://localhost:3002/v1/sellers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nizamabad Agri Co-op",
    "type": "farmer",
    "phone": "+919000000001",
    "location": "Nizamabad, Telangana",
    "pincode": "503001",
    "fssaiNumber": "10019042000123"
  }'

# Admin verifies seller (X-Admin-Key is the dev placeholder)
curl -X PATCH http://localhost:3002/v1/sellers/{SELLER_ID}/verify \
  -H "X-Admin-Key: dev-admin-key"

# Inter-service call (as catalog-svc would)
curl http://localhost:3002/v1/sellers/{SELLER_ID}
# → { success: true, data: { id: "...", verified: true, type: "farmer", ... } }

# Try verify without admin key → 403
curl -X PATCH http://localhost:3002/v1/sellers/{SELLER_ID}/verify
```

---

## How catalog-svc connects to this service

When UC-USR-03 guard is added to `catalog-svc`, the check will look like:

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

This is why `GET /v1/sellers/:id` is a first-class endpoint even if no UI uses it yet — catalog-svc is its consumer.

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

`order-svc` will make synchronous calls to both `catalog-svc` (fetch current price) and `user-svc` (fetch delivery address) — so both services built before it must be running.

---

## Checklist — UC-XCUT-00 (applied to this service)

- [ ] Response envelope: `{ success, data, meta? }` on all 2xx; `{ success: false, error: { type, title, status, detail? } }` on all errors
- [ ] Validation: Zod schemas at every POST/PATCH boundary; invalid input → 400 with issue details
- [ ] No client-trusted coords: `lat`/`lng` always from `GeocodePort`, never from request body
- [ ] Ports not vendors: `GeocodePort` + `StoragePort` interfaces only in service; adapters only in `ports.ts`
- [ ] Health check: `GET /health` → `{ status: 'ok', service: 'user-svc' }`
- [ ] Structured logs: Fastify logger enabled; `requestId` on every request
- [ ] Phone immutable: excluded from all update schemas
- [ ] `verified` server-managed: hardcoded `false` on seller create; only `verify` endpoint sets it
