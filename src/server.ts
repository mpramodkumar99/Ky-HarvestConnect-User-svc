import Fastify from 'fastify';
import cors from '@fastify/cors';
import { InMemoryUserRepository, InMemoryAddressRepository, InMemorySellerRepository } from './repository.js';
import { FakeGeocoder, LocalDiskStorage } from './ports.js';
import { UserService, SellerService } from './service.js';
import { registerUserRoutes, registerSellerRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // ── Dependency wiring ──────────────────────────────────────────────────────
  // Ports: swap FakeGeocoder → GoogleGeocoder, LocalDiskStorage → S3Storage
  //        by changing these two lines only. Nothing else in the codebase changes.
  const geocoder = new FakeGeocoder();
  const storage  = new LocalDiskStorage();  // available for future document upload routes

  // Repositories
  const userRepo    = new InMemoryUserRepository();
  const addressRepo = new InMemoryAddressRepository();
  const sellerRepo  = new InMemorySellerRepository();

  // Services — inject dependencies through constructors
  const userService   = new UserService(userRepo, addressRepo, geocoder);
  const sellerService = new SellerService(sellerRepo, geocoder);

  // Suppress "unused variable" warning — storage is wired here for when
  // document upload routes are added (UC-USR-03 extension).
  void storage;

  // Routes
  registerUserRoutes(app, userService);
  registerSellerRoutes(app, sellerService);

  // Health check — used by ECS/Kubernetes load balancer probes
  app.get('/health', async () => ({ status: 'ok', service: 'user-svc' }));

  const PORT = Number(process.env['PORT'] ?? 3002);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`user-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
