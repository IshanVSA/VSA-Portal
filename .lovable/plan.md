

## Plan: Create Geo-Clusters for All Clinics

### Overview
I'll geocode all 47 clinics using their known addresses, classify each by hospital type and jurisdiction, then group them into clusters based on overlapping service radii (5km BC TYPE 3, 7km other TYPE 3, 10km TYPE 1/2). I'll insert both `clinic_gbp_config` entries and `geo_clusters` entries.

**Note:** "alma" (id: 2bdf419c) and "Alma Animal Hospital" (id: b82b1dac) share the exact same address — this appears to be a duplicate. Both will be included in the same cluster.

---

### Cluster Assignments (based on geographic proximity)

```text
CLUSTER VAN-WEST (6 clinics, Kitsilano/Dunbar/Point Grey/Yaletown)
  - Cypress St. Animal Hospital     (Kitsilano)
  - Homer Animal Hospital           (Yaletown)
  - University Vet                  (Point Grey)
  - Alma Animal Hospital            (Dunbar)
  - alma                            (Dunbar — duplicate)
  - Alta Vista Animal Hospital      (Dunbar)
  - Dunbar Animal Hospital          (Kerrisdale)

CLUSTER VAN-EAST (3 clinics, Fraser St/Killarney/East Van)
  - Atlas Animal Hospital           (South Van / Fraser St)
  - Killarney Animal Hospital       (Killarney)
  - Renfrew Animal Hospital         (East Van)

CLUSTER BURNABY (2 clinics)
  - Brentwood Animal Hospital       (Brentwood)
  - Deer Lake Animal Hospital       (Barnet Hwy)

CLUSTER TRI-CITIES (3 clinics, Coquitlam/Port Coquitlam)
  - Mundy Animal Hospital           (Coquitlam)
  - Poco West Animal Hospital       (Port Coquitlam)
  - Tricity Animal Hospital         (Port Coquitlam)

CLUSTER SURREY-NORTH (4 clinics)
  - 108th Ave Animal Hospital       (108 Ave)
  - Cedar Hills Animal Hospital     (96 Ave)
  - Mainland Emergency Animal Clinic (Fraser Hwy)
  - Tynehead Animal Hospital        (160 St)

CLUSTER SURREY-SOUTH (4 clinics)
  - Campbell Heights Animal Hospital (192 St)
  - Apollo Animal Hospital          (56 Ave)
  - Avon Animal Hospital            (Fraser Hwy)
  - Elgin Park Animal Hospital      (148 St)
  - Peace Arch Veterinary Hospital  (152 St)

CLUSTER LANGLEY (3 clinics)
  - Langley Meadows Animal Hospital (200 St)
  - Latimer Animal Hospital         (76 Ave)
  - Yorkson Creek Veterinary Hospital (Willoughby)

CLUSTER ABBOTSFORD (4 clinics)
  - Abby Veterinary Hospital & Emergency
  - Alpha Animal Hospital
  - Glenn Mountain Animal Hospital
  - South Fraser Animal Hospital

CLUSTER NANAIMO (2 clinics)
  - Coastal City Animal Hospital
  - Harewood Pet Hospital

CLUSTER CALGARY (2 clinics — both in Calgary, ~18km apart but TYPE 3 CA-OTHER = 7km radius, 14km overlap threshold)
  - Bowness Animal Hospital
  - NorthWest Veterinary Hospital

SOLO CLUSTERS (no overlap — zero collision risk):
  - 48th Avenue Animal Hospital     (Ladner)
  - Alpenlofts Veterinary Hospital  (Squamish)
  - Norgate Animal Hospital         (North Vancouver)
  - Haney Animal Hospital           (Maple Ridge)
  - Lougheed Animal Hospital        (Mission)
  - McCurdy Animal Hospital         (Kelowna)
  - Midtown Veterinary Hospital     (Victoria)
  - Peach City Animal Hospital      (Penticton)
  - Cherry Knolls Veterinary Clinic (Colorado, US)
  - Ocean Avenue Vet Hospital       (San Francisco, US)
  - Sedro-Woolley Veterinary Clinic (Washington, US)
  - Universal Pet Hospital          (Palo Alto, US)
```

---

### Hospital Type Classification
- **TYPE 1 (Emergency/24hr):** Abby Veterinary Hospital and Emergency, Mainland Emergency Animal Clinic
- **TYPE 3 (General Practice):** All other clinics

### Jurisdiction Classification
- **BC:** All BC clinics (5km radius for TYPE 3)
- **CA-OTHER:** Calgary clinics (7km radius for TYPE 3)
- **US:** Cherry Knolls (CO), Ocean Avenue (SF), Sedro-Woolley (WA), Universal Pet (Palo Alto)

---

### Implementation Steps

1. **Insert `clinic_gbp_config`** for all 47 clinics with:
   - `hospital_type` (1 or 3)
   - `jurisdiction` (BC, CA-OTHER, US)
   - `neighbourhood` (extracted from address)
   - `geo_radius_km` (5, 7, or 10 based on type/jurisdiction)
   - `cluster_id` (linking to the cluster)
   - `cluster_position` (A, B, C, D assigned per cluster)

2. **Insert `geo_clusters`** for all 10 multi-clinic clusters and 12 solo clusters with clinic ID arrays.

3. **Calgary check:** Bowness to NW Vet is ~18km. With 7km+7km=14km threshold, they do NOT overlap → both become solo clusters instead.

### Technical Details
- All data inserted via the Supabase insert tool (no migrations needed)
- Approximate lat/lng used for radius calculations based on known BC/Alberta/US addresses
- Variant positions (A, B, C, D) assigned round-robin within each cluster

