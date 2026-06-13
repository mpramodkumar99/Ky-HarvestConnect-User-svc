import type { FastifyInstance } from 'fastify';
import type { UserService, SellerService } from './service.js';
import { NotFoundError, ConflictError, ForbiddenError } from './service.js';
import {
  createUserSchema, updateUserSchema,
  createAddressSchema, updateAddressSchema,
  createSellerSchema, updateSellerSchema,
} from './schemas.js';

// Dev-only admin key — placeholder until auth-svc (UC-AUTH-01) is built.
// In production this becomes a JWT role check injected by auth middleware.
const ADMIN_KEY = process.env['ADMIN_KEY'] ?? 'dev-admin-key';

// Shared error-to-HTTP mapping — keeps every route handler DRY.
// Unknown errors are re-thrown so Fastify's default error handler logs them.
function handleError(err: unknown, reply: Parameters<Parameters<FastifyInstance['get']>[1]>[1]) {
  if (err instanceof NotFoundError) {
    return reply.status(404).send({ success: false, error: { type: 'not_found', title: err.message, status: 404 } });
  }
  if (err instanceof ConflictError) {
    return reply.status(409).send({ success: false, error: { type: 'conflict', title: err.message, status: 409 } });
  }
  if (err instanceof ForbiddenError) {
    return reply.status(403).send({ success: false, error: { type: 'forbidden', title: err.message, status: 403 } });
  }
  throw err;
}

// ── User routes ───────────────────────────────────────────────────────────────

export function registerUserRoutes(app: FastifyInstance, service: UserService) {

  // POST /v1/users — create buyer profile (UC-USR-01)
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // GET /v1/users/:id
  app.get('/v1/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const user = await service.getUser(id);
      return reply.send({ success: true, data: user });
    } catch (err) {
      return handleError(err, reply);
    }
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Address routes ─────────────────────────────────────────────────────────

  // GET /v1/users/:id/addresses — list all addresses for a user (UC-USR-02)
  app.get('/v1/users/:id/addresses', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const addresses = await service.listAddresses(id);
      return reply.send({ success: true, data: addresses, meta: { total: addresses.length } });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // POST /v1/users/:id/addresses — add address; geocodes pincode internally (UC-USR-02)
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // PATCH /v1/users/:id/addresses/:addrId — update address (UC-USR-02)
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // DELETE /v1/users/:id/addresses/:addrId — delete address; never deletes the user (UC-USR-02)
  app.delete('/v1/users/:id/addresses/:addrId', async (request, reply) => {
    const { id, addrId } = request.params as { id: string; addrId: string };
    try {
      await service.deleteAddress(id, addrId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });
}

// ── Seller routes ─────────────────────────────────────────────────────────────

export function registerSellerRoutes(app: FastifyInstance, service: SellerService) {

  // GET /v1/sellers — list sellers with optional filters
  app.get('/v1/sellers', async (request, reply) => {
    const { type, verified } = request.query as { type?: string; verified?: string };
    const filters = {
      ...(type ? { type } : {}),
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // GET /v1/sellers/:id — inter-service contract (catalog-svc reads verified field)
  app.get('/v1/sellers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const seller = await service.getSeller(id);
      return reply.send({ success: true, data: seller });
    } catch (err) {
      return handleError(err, reply);
    }
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
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // PATCH /v1/sellers/:id/verify — admin marks seller verified (UC-USR-03)
  // X-Admin-Key is a dev placeholder — replaced by JWT role check once auth-svc is built.
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
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
