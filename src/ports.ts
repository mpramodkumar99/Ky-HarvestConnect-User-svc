import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeoPoint } from './types.js';

// ── GeocodePort ───────────────────────────────────────────────────────────────
// Converts a pincode to lat/lng coordinates.
// Service layer depends only on this interface — never on a specific implementation.

export interface GeocodePort {
  fromPincode(pincode: string): Promise<GeoPoint>;
}

// Known Telangana & Andhra Pradesh pincodes — covers HarvestConnect's launch geography.
// Unknown pincodes fall back to Hyderabad city centre so the service never throws
// on an unrecognised pincode during early development.
const PINCODE_MAP: Record<string, GeoPoint> = {
  // Nizamabad district
  '503001': { lat: 18.672, lng: 78.098 },
  '503002': { lat: 18.674, lng: 78.102 },
  '503111': { lat: 18.435, lng: 78.330 }, // Armoor
  '503230': { lat: 18.774, lng: 77.997 }, // Bodhan
  // Karimnagar district
  '505001': { lat: 18.435, lng: 79.120 },
  '505002': { lat: 18.430, lng: 79.130 },
  // Warangal district
  '506001': { lat: 17.999, lng: 79.598 },
  '506002': { lat: 18.001, lng: 79.600 },
  // Nalgonda district
  '508001': { lat: 17.166, lng: 79.261 },
  '508002': { lat: 17.170, lng: 79.265 },
  // Khammam district
  '507001': { lat: 17.245, lng: 80.152 },
  '507002': { lat: 17.250, lng: 80.155 },
  // Adilabad district
  '504001': { lat: 19.668, lng: 78.531 },
  '504002': { lat: 19.672, lng: 78.535 },
  // Hyderabad
  '500001': { lat: 17.385, lng: 78.486 }, // city centre
  '500008': { lat: 17.412, lng: 78.474 }, // Begumpet
  '500016': { lat: 17.445, lng: 78.449 }, // Banjara Hills
  '500032': { lat: 17.490, lng: 78.392 }, // KPHB
  '500072': { lat: 17.360, lng: 78.474 }, // LB Nagar
  '500081': { lat: 17.490, lng: 78.392 }, // Kukatpally
  // Bhadradri Kothagudem
  '507101': { lat: 17.550, lng: 80.630 },
  // Pochampally / Nalgonda (weaving cluster)
  '508284': { lat: 17.362, lng: 79.058 },
};

const HYDERABAD_FALLBACK: GeoPoint = { lat: 17.385, lng: 78.486 };

export class FakeGeocoder implements GeocodePort {
  async fromPincode(pincode: string): Promise<GeoPoint> {
    return PINCODE_MAP[pincode] ?? HYDERABAD_FALLBACK;
  }
}

// ── StoragePort ───────────────────────────────────────────────────────────────
// Saves binary data (seller documents, product images) and returns a URL.
// Swap LocalDiskStorage for S3Storage when ready — zero other code changes.

export interface StoragePort {
  save(filename: string, data: Buffer): Promise<string>; // returns URL / path
  delete(url: string): Promise<void>;
}

export class LocalDiskStorage implements StoragePort {
  private dir = join(process.cwd(), 'uploads');

  async save(filename: string, data: Buffer): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), data);
    return `/uploads/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = url.split('/').pop();
    if (!filename) return;
    await unlink(join(this.dir, filename)).catch(() => {
      // File may already be gone — treat as success
    });
  }
}
