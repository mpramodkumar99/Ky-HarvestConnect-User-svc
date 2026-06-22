import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  InMemoryUserRepository,
  InMemoryAddressRepository,
  InMemorySellerRepository,
  InMemorySellerMemberRepository,
  InMemoryBankAccountRepository,
  InMemoryWishlistRepository,
  InMemoryCartRepository,
  InMemoryWalletRepository,
  InMemoryReferralRepository,
} from './repository.js';
import {
  PgUserRepository,
  PgAddressRepository,
  PgSellerRepository,
  PgSellerMemberRepository,
  PgBankAccountRepository,
  PgWishlistRepository,
  PgCartRepository,
  PgWalletRepository,
  PgReferralRepository,
} from './db/pg-repository.js';
import { db } from './db/client.js';
import { FakeGeocoder, LocalDiskStorage } from './ports.js';
import { UserService, SellerService, WishlistService, CartService, WalletService, ReferralService } from './service.js';
import { registerUserRoutes, registerSellerRoutes, registerCrossRoutes, registerWishlistRoutes, registerCartRoutes, registerWalletRoutes, registerReferralRoutes } from './routes.js';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Admin-Key'],
    credentials: true,
  });

  // ── Ports: swap implementations here only ──────────────────────────────────
  const geocoder = new FakeGeocoder();
  const storage  = new LocalDiskStorage();  // wired for future document upload routes
  void storage;

  // ── Repositories ───────────────────────────────────────────────────────────
  // DATABASE_URL set → Postgres (persists across restarts). Unset → in-memory
  // (fast local iteration, no DB required, data resets on restart).
  const usePostgres = Boolean(process.env['DATABASE_URL']);
  const userRepo        = usePostgres ? new PgUserRepository(db)        : new InMemoryUserRepository();
  const addressRepo     = usePostgres ? new PgAddressRepository(db)     : new InMemoryAddressRepository();
  const sellerRepo      = usePostgres ? new PgSellerRepository(db)      : new InMemorySellerRepository();
  const memberRepo      = usePostgres ? new PgSellerMemberRepository(db): new InMemorySellerMemberRepository();
  const bankAccountRepo = usePostgres ? new PgBankAccountRepository(db) : new InMemoryBankAccountRepository();
  const wishlistRepo    = usePostgres ? new PgWishlistRepository(db)    : new InMemoryWishlistRepository();
  const cartRepo        = usePostgres ? new PgCartRepository(db)        : new InMemoryCartRepository();
  const walletRepo      = usePostgres ? new PgWalletRepository(db)      : new InMemoryWalletRepository();
  const referralRepo    = usePostgres ? new PgReferralRepository(db)    : new InMemoryReferralRepository();
  app.log.info(`user-svc storage backend: ${usePostgres ? 'PostgreSQL' : 'in-memory'}`);

  // ── Services ───────────────────────────────────────────────────────────────
  const userService     = new UserService(userRepo, addressRepo, geocoder);
  const sellerService   = new SellerService(sellerRepo, memberRepo, bankAccountRepo, geocoder);
  const wishlistService = new WishlistService(wishlistRepo);
  const cartService     = new CartService(cartRepo);
  const walletService   = new WalletService(walletRepo);
  const referralService = new ReferralService(referralRepo, userRepo, walletRepo);

  // ── Routes ─────────────────────────────────────────────────────────────────
  registerUserRoutes(app, userService);
  registerSellerRoutes(app, sellerService);
  registerCrossRoutes(app, sellerService);
  registerWishlistRoutes(app, wishlistService);
  registerCartRoutes(app, cartService);
  registerWalletRoutes(app, walletService);
  registerReferralRoutes(app, referralService);

  // Health check — used by ECS/Kubernetes load balancer probes
  app.get('/health', async () => ({ status: 'ok', service: 'user-svc' }));

  const PORT = Number(process.env['PORT'] ?? 3002);
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`user-svc running on http://localhost:${PORT}`);
}

start().catch((err) => { console.error(err); process.exit(1); });
