import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  InMemoryUserRepository,
  InMemoryAddressRepository,
  InMemorySellerRepository,
  InMemorySellerMemberRepository,
  InMemoryBankAccountRepository,
} from './repository.js';
import { FakeGeocoder, LocalDiskStorage } from './ports.js';
import { UserService, SellerService } from './service.js';
import { registerUserRoutes, registerSellerRoutes, registerCrossRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // ── Ports: swap implementations here only ──────────────────────────────────
  const geocoder = new FakeGeocoder();
  const storage  = new LocalDiskStorage();  // wired for future document upload routes
  void storage;

  // ── Repositories ───────────────────────────────────────────────────────────
  const userRepo        = new InMemoryUserRepository();
  const addressRepo     = new InMemoryAddressRepository();
  const sellerRepo      = new InMemorySellerRepository();
  const memberRepo      = new InMemorySellerMemberRepository();
  const bankAccountRepo = new InMemoryBankAccountRepository();

  // ── Services ───────────────────────────────────────────────────────────────
  const userService   = new UserService(userRepo, addressRepo, geocoder);
  const sellerService = new SellerService(sellerRepo, memberRepo, bankAccountRepo, geocoder);

  // ── Routes ─────────────────────────────────────────────────────────────────
  registerUserRoutes(app, userService);
  registerSellerRoutes(app, sellerService);
  registerCrossRoutes(app, sellerService);

  // Health check — used by ECS/Kubernetes load balancer probes
  app.get('/health', async () => ({ status: 'ok', service: 'user-svc' }));

  const PORT = Number(process.env['PORT'] ?? 3002);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`user-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
