import type { FastifyInstance, FastifyReply } from 'fastify';
import type { UserService, SellerService } from './service.js';
import { NotFoundError, ConflictError, ForbiddenError } from './service.js';
import {
  createUserSchema, updateUserSchema,
  createAddressSchema, updateAddressSchema,
  createSellerSchema, updateSellerSchema,
  createSellerMemberSchema, updateSellerMemberSchema,
  createBankAccountSchema, updateBankAccountSchema,
  addDocumentSchema, removeDocumentSchema,
} from './schemas.js';

// Dev-only admin key — placeholder until auth-svc (UC-AUTH-01) is built.
const ADMIN_KEY = process.env['ADMIN_KEY'] ?? 'dev-admin-key';

// Shared error-to-HTTP mapping — keeps every route handler DRY.
function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof NotFoundError) {
    return reply.status(404).send({ success: false, error: { type: 'not_found',   title: err.message, status: 404 } });
  }
  if (err instanceof ConflictError) {
    return reply.status(409).send({ success: false, error: { type: 'conflict',    title: err.message, status: 409 } });
  }
  if (err instanceof ForbiddenError) {
    return reply.status(403).send({ success: false, error: { type: 'forbidden',   title: err.message, status: 403 } });
  }
  throw err;
}

// ── User routes ───────────────────────────────────────────────────────────────

export function registerUserRoutes(app: FastifyInstance, service: UserService) {

  // POST /v1/users — create buyer/seller user profile (UC-USR-01)
  app.post('/v1/users', async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid user data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const user = await service.createUser(parsed.data);
      return reply.status(201).send({ success: true, data: user });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/users?phone= — used by auth-svc to validate a phone before issuing OTP
  app.get('/v1/users', async (request, reply) => {
    const { phone } = request.query as { phone?: string };
    if (phone) {
      const user = await service.getUserByPhone(phone);
      return reply.send({ success: true, data: user ? [user] : [] });
    }
    return reply.status(400).send({
      success: false,
      error: { type: 'validation_error', title: 'phone query param required', status: 400 },
    });
  });

  // GET /v1/users/:id
  app.get('/v1/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await service.getUser(id);
      return reply.send({ success: true, data: user });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/users/:id
  app.patch('/v1/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid update data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const user = await service.updateUser(id, parsed.data);
      return reply.send({ success: true, data: user });
    } catch (err) { return handleError(err, reply); }
  });

  // ── Address routes ─────────────────────────────────────────────────────────

  // GET /v1/users/:id/addresses (UC-USR-02)
  app.get('/v1/users/:id/addresses', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const addresses = await service.listAddresses(id);
      return reply.send({ success: true, data: addresses, meta: { total: addresses.length } });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/users/:id/addresses — geocodes pincode internally (UC-USR-02)
  app.post('/v1/users/:id/addresses', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createAddressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid address data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const address = await service.addAddress(id, parsed.data);
      return reply.status(201).send({ success: true, data: address });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/users/:id/addresses/:addrId (UC-USR-02)
  app.patch('/v1/users/:id/addresses/:addrId', async (request, reply) => {
    const { id, addrId } = request.params as { id: string; addrId: string };
    const parsed = updateAddressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid address data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const address = await service.updateAddress(id, addrId, parsed.data);
      return reply.send({ success: true, data: address });
    } catch (err) { return handleError(err, reply); }
  });

  // DELETE /v1/users/:id/addresses/:addrId (UC-USR-02)
  app.delete('/v1/users/:id/addresses/:addrId', async (request, reply) => {
    const { id, addrId } = request.params as { id: string; addrId: string };
    try {
      await service.deleteAddress(id, addrId);
      return reply.status(204).send();
    } catch (err) { return handleError(err, reply); }
  });
}

// ── Seller routes ─────────────────────────────────────────────────────────────

export function registerSellerRoutes(app: FastifyInstance, service: SellerService) {

  // GET /v1/sellers — list sellers with optional filters
  // Supported query params: type, verified, userId, phone
  app.get('/v1/sellers', async (request, reply) => {
    const { type, verified, userId, phone } = request.query as {
      type?: string;
      verified?: string;
      userId?: string;
      phone?: string;
    };
    const filters = {
      ...(type     ? { type }                            : {}),
      ...(userId   ? { userId }                          : {}),
      ...(phone    ? { phone }                           : {}),
      ...(verified !== undefined ? { verified: verified === 'true' } : {}),
    };
    const sellers = await service.listSellers(filters);
    return reply.send({ success: true, data: sellers, meta: { total: sellers.length } });
  });

  // POST /v1/sellers — create seller; starts unverified (UC-USR-03)
  app.post('/v1/sellers', async (request, reply) => {
    const parsed = createSellerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid seller data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const seller = await service.createSeller(parsed.data);
      return reply.status(201).send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // GET /v1/sellers/:id — inter-service contract (catalog-svc reads verified field)
  app.get('/v1/sellers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const seller = await service.getSeller(id);
      return reply.send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/sellers/:id — update seller profile
  app.patch('/v1/sellers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateSellerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid seller data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const seller = await service.updateSeller(id, parsed.data);
      return reply.send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/sellers/:id/verify — admin marks seller verified (UC-USR-03)
  app.patch('/v1/sellers/:id/verify', async (request, reply) => {
    const adminKey = (request.headers['x-admin-key'] as string | undefined)?.trim();
    if (!adminKey || adminKey !== ADMIN_KEY) {
      return reply.status(403).send({
        success: false,
        error: { type: 'forbidden', title: 'Valid X-Admin-Key header required', status: 403 },
      });
    }
    const { id } = request.params as { id: string };
    try {
      const seller = await service.verifySeller(id);
      return reply.send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // ── Document routes ────────────────────────────────────────────────────────

  // POST /v1/sellers/:id/documents — seller self-submits a document URL for KYC
  app.post('/v1/sellers/:id/documents', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = addDocumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid document data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const seller = await service.addDocument(id, parsed.data.url);
      return reply.status(201).send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // DELETE /v1/sellers/:id/documents — remove a specific document URL
  app.delete('/v1/sellers/:id/documents', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = removeDocumentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid document data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const seller = await service.removeDocument(id, parsed.data.url);
      return reply.send({ success: true, data: seller });
    } catch (err) { return handleError(err, reply); }
  });

  // ── Team member routes ─────────────────────────────────────────────────────

  // GET /v1/sellers/:id/members — list team members
  app.get('/v1/sellers/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const members = await service.listMembers(id);
      return reply.send({ success: true, data: members, meta: { total: members.length } });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/sellers/:id/members — invite a team member
  app.post('/v1/sellers/:id/members', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createSellerMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid member data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const member = await service.inviteMember(id, parsed.data);
      return reply.status(201).send({ success: true, data: member });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/sellers/:id/members/:memberId — change role
  app.patch('/v1/sellers/:id/members/:memberId', async (request, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const parsed = updateSellerMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid member data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const member = await service.updateMemberRole(id, memberId, parsed.data);
      return reply.send({ success: true, data: member });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/sellers/:id/members/:memberId/activate — accept pending invite
  // Called when an invited user logs in and accepts; X-User-Id identifies them.
  app.patch('/v1/sellers/:id/members/:memberId/activate', async (request, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    const userId = (request.headers['x-user-id'] as string | undefined)?.trim();
    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: { type: 'unauthorized', title: 'X-User-Id header is required', status: 401 },
      });
    }
    try {
      const member = await service.activateMember(id, memberId, userId);
      return reply.send({ success: true, data: member });
    } catch (err) { return handleError(err, reply); }
  });

  // DELETE /v1/sellers/:id/members/:memberId — remove a team member
  app.delete('/v1/sellers/:id/members/:memberId', async (request, reply) => {
    const { id, memberId } = request.params as { id: string; memberId: string };
    try {
      await service.removeMember(id, memberId);
      return reply.status(204).send();
    } catch (err) { return handleError(err, reply); }
  });

  // ── Bank account routes ────────────────────────────────────────────────────

  // GET /v1/sellers/:id/bank-account
  app.get('/v1/sellers/:id/bank-account', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const account = await service.getBankAccount(id);
      // Mask account number — expose last 4 digits only
      return reply.send({
        success: true,
        data: {
          ...account,
          accountNumber: `···${account.accountNumber.slice(-4)}`,
        },
      });
    } catch (err) { return handleError(err, reply); }
  });

  // POST /v1/sellers/:id/bank-account — create or replace bank account (upsert)
  app.post('/v1/sellers/:id/bank-account', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createBankAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid bank account data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const account = await service.setBankAccount(id, parsed.data);
      return reply.status(201).send({
        success: true,
        data: { ...account, accountNumber: `···${account.accountNumber.slice(-4)}` },
      });
    } catch (err) { return handleError(err, reply); }
  });

  // PATCH /v1/sellers/:id/bank-account — partial update
  app.patch('/v1/sellers/:id/bank-account', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateBankAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { type: 'validation_error', title: 'Invalid bank account data', status: 400, detail: parsed.error.issues },
      });
    }
    try {
      const account = await service.updateBankAccount(id, parsed.data);
      return reply.send({
        success: true,
        data: { ...account, accountNumber: `···${account.accountNumber.slice(-4)}` },
      });
    } catch (err) { return handleError(err, reply); }
  });
}

// ── Cross-resource routes ─────────────────────────────────────────────────────

export function registerCrossRoutes(
  app: FastifyInstance,
  sellerService: SellerService,
) {
  // GET /v1/users/:id/sellers — all seller accounts linked to a user
  app.get('/v1/users/:id/sellers', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sellers = await sellerService.listSellersByUser(id);
    return reply.send({ success: true, data: sellers, meta: { total: sellers.length } });
  });
}
