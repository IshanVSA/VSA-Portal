import type { HospitalType, Jurisdiction } from './types';

/**
 * Geo-cluster calculation logic.
 * Groups clinics into clusters based on overlapping service radii.
 */

interface ClinicGeoData {
  clinic_id: string;
  clinic_name: string;
  lat: number;
  lng: number;
  hospital_type: HospitalType;
  jurisdiction: Jurisdiction;
}

/**
 * Calculate the service radius in km for a given clinic.
 * - BC TYPE 3: 5 km
 * - Other CA/US TYPE 3: 7 km
 * - TYPE 1 or TYPE 2: 10 km
 */
export function getServiceRadius(hospitalType: HospitalType, jurisdiction: Jurisdiction): number {
  if (hospitalType === 3) {
    return jurisdiction === 'BC' ? 5 : 7;
  }
  return 10;
}

/**
 * Calculate distance between two lat/lng points in km (Haversine formula).
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Check if two clinics' service circles overlap.
 */
export function circlesOverlap(a: ClinicGeoData, b: ClinicGeoData): boolean {
  const radiusA = getServiceRadius(a.hospital_type, a.jurisdiction);
  const radiusB = getServiceRadius(b.hospital_type, b.jurisdiction);
  const distance = haversineDistance(a.lat, a.lng, b.lat, b.lng);
  return distance <= radiusA + radiusB;
}

/**
 * Union-Find for transitive clustering.
 */
class UnionFind {
  parent: Map<string, string>;
  rank: Map<string, number>;

  constructor(ids: string[]) {
    this.parent = new Map();
    this.rank = new Map();
    for (const id of ids) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(x: string): string {
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
    const rankX = this.rank.get(rootX) ?? 0;
    const rankY = this.rank.get(rootY) ?? 0;
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

export interface CalculatedCluster {
  cluster_id: string;
  region: string;
  clinics: string[];
  is_solo: boolean;
}

/**
 * Calculate geo-clusters from a list of clinics.
 * Uses union-find for transitive overlap grouping.
 */
export function calculateGeoClusters(
  clinics: ClinicGeoData[],
  regionName: string
): CalculatedCluster[] {
  if (clinics.length === 0) return [];

  const uf = new UnionFind(clinics.map(c => c.clinic_id));

  // Check all pairs for overlap
  for (let i = 0; i < clinics.length; i++) {
    for (let j = i + 1; j < clinics.length; j++) {
      if (circlesOverlap(clinics[i], clinics[j])) {
        uf.union(clinics[i].clinic_id, clinics[j].clinic_id);
      }
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const clinic of clinics) {
    const root = uf.find(clinic.clinic_id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(clinic.clinic_id);
  }

  // Build cluster objects
  let clusterIndex = 1;
  const result: CalculatedCluster[] = [];
  for (const [, members] of groups) {
    const isSolo = members.length === 1;
    const clusterId = isSolo
      ? `${regionName.toUpperCase().replace(/\s+/g, '-')}-SOLO-${clusterIndex}`
      : `${regionName.toUpperCase().replace(/\s+/g, '-')}-${clusterIndex}`;
    result.push({
      cluster_id: clusterId,
      region: regionName,
      clinics: members,
      is_solo: isSolo,
    });
    clusterIndex++;
  }

  return result;
}
