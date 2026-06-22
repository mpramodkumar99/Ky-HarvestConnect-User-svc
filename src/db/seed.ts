import 'dotenv/config';
import { db, pool } from './client.js';
import { users, sellers } from './schema.js';

const now = new Date();

const devUsers = [
  { id: 'user-b001', name: 'Dev Buyer 1',  phone: '+919000000001', type: 'buyer',  verified: true },
  { id: 'user-b002', name: 'Dev Buyer 2',  phone: '+919000000002', type: 'buyer',  verified: true },
  { id: 'user-s112', name: 'Desi Dairy',   phone: '+919000000112', type: 'seller', verified: true },
  { id: 'user-s113', name: 'Amma Kitchen', phone: '+919000000113', type: 'seller', verified: true },
  { id: 'user-s105', name: 'Spice Route',  phone: '+919000000105', type: 'seller', verified: true },
].map(u => ({ ...u, createdAt: now, updatedAt: now }));

// Fixed IDs match catalog-svc seed data and the seller app's store-context so
// inter-service lookups and UI store cards resolve correctly across restarts.
const devSellers = [
  { id: 'seller-101', name: 'Nizamabad Agri Co-op', type: 'farmer', phone: '+919000000101', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['state', 'national'], fssaiNumber: '10019042000101' },
  { id: 'seller-103', name: 'Krishna Farms', type: 'farmer', phone: '+919000000103', location: 'Khammam, Telangana', pincode: '507001', lat: 17.245, lng: 80.152, deliveryZones: ['district', 'state'] },
  { id: 'seller-105', name: 'Spice Route Nizamabad', type: 'farmer', phone: '+919000000105', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['state', 'national'], fssaiNumber: '10019042000105', description: 'Organic turmeric, chillies and seasonal vegetables from Nizamabad district.' },
  { id: 'seller-107', name: 'Adilabad Spice Farm', type: 'farmer', phone: '+919000000107', location: 'Adilabad, Telangana', pincode: '504001', lat: 19.668, lng: 78.531, deliveryZones: ['district', 'state'] },
  { id: 'seller-111', name: 'Godavari Aqua Farm', type: 'farmer', phone: '+919000000111', location: 'Bhadradri, Telangana', pincode: '507101', lat: 17.550, lng: 80.630, deliveryZones: ['state', 'national'], fssaiNumber: '10019042000111' },
  { id: 'seller-112', name: 'Desi Dairy Armoor', type: 'dairy', phone: '+919000000112', location: 'Armoor, Nizamabad', pincode: '503111', lat: 18.435, lng: 78.330, deliveryZones: ['mandal', 'district'], fssaiNumber: '10019042000112', description: 'Fresh milk, curd and paneer sourced directly from our Armoor farm.' },
  { id: 'seller-113', name: 'Amma Kitchen', type: 'homefood', phone: '+919000000113', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['mandal', 'district', 'state'], fssaiNumber: '10019042000113', description: 'Traditional Telangana pickles and home-made snacks made with love.' },
  { id: 'seller-115', name: 'Village Mill Nizamabad', type: 'homefood', phone: '+919000000115', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['state', 'national'], fssaiNumber: '10019042000115' },
  { id: 'seller-124', name: 'Pochampally Weavers', type: 'artisan', phone: '+919000000124', location: 'Nalgonda, Telangana', pincode: '508284', lat: 17.362, lng: 79.058, deliveryZones: ['state', 'national'] },
  { id: 'seller-121', name: 'Nalgonda Building Supplies', type: 'artisan', phone: '+919000000121', location: 'Nalgonda, Telangana', pincode: '508001', lat: 17.166, lng: 79.261, deliveryZones: ['district', 'state'] },
  { id: 'seller-201', name: 'Quick Fix Electricals', type: 'trades', phone: '+919000000201', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['mandal'] },
  { id: 'seller-207', name: 'CoolTech Services', type: 'trades', phone: '+919000000207', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['mandal', 'district'] },
  { id: 'seller-212', name: 'AutoCare Nizamabad', type: 'trades', phone: '+919000000212', location: 'Nizamabad, Telangana', pincode: '503001', lat: 18.672, lng: 78.098, deliveryZones: ['mandal', 'district'] },
].map(s => ({
  ...s,
  verified: true,
  verifiedAt: now,
  documentUrls: [] as string[],
  createdAt: now,
  updatedAt: now,
}));

await db.insert(users).values(devUsers).onConflictDoNothing();
await db.insert(sellers).values(devSellers).onConflictDoNothing();

console.log(`Seeded ${devUsers.length} users and ${devSellers.length} sellers.`);
await pool.end();
