/**
 * Maps a clinic address to the most likely veterinary regulatory /
 * advertising standards body. Covers Canadian provinces/territories and all
 * 50 US states + DC. Falls back to the national body (AVMA US, CVMA Canada)
 * and finally to a generic label if the country cannot be determined.
 */

const CA_PROVINCE_MAP: Record<string, string> = {
  AB: "ABVMA (Alberta Veterinary Medical Association)",
  BC: "CVBC (College of Veterinarians of British Columbia)",
  ON: "CVO (College of Veterinarians of Ontario)",
  SK: "SVMA (Saskatchewan Veterinary Medical Association)",
  MB: "MVMA (Manitoba Veterinary Medical Association)",
  QC: "OMVQ (Ordre des médecins vétérinaires du Québec)",
  NS: "NSVMA (Nova Scotia Veterinary Medical Association)",
  NB: "NBVMA (New Brunswick Veterinary Medical Association)",
  PE: "PEIVMA (PEI Veterinary Medical Association)",
  NL: "NLVMA (Newfoundland & Labrador Veterinary Medical Association)",
  NT: "CVMA (Canadian Veterinary Medical Association)",
  NU: "CVMA (Canadian Veterinary Medical Association)",
  YT: "CVMA (Canadian Veterinary Medical Association)",
};

const CA_NAME_TO_CODE: Record<string, string> = {
  ALBERTA: "AB",
  "BRITISH COLUMBIA": "BC",
  ONTARIO: "ON",
  SASKATCHEWAN: "SK",
  MANITOBA: "MB",
  QUEBEC: "QC",
  QUÉBEC: "QC",
  "NOVA SCOTIA": "NS",
  "NEW BRUNSWICK": "NB",
  "PRINCE EDWARD ISLAND": "PE",
  NEWFOUNDLAND: "NL",
  "NORTHWEST TERRITORIES": "NT",
  NUNAVUT: "NU",
  YUKON: "YT",
};

const US_STATE_MAP: Record<string, string> = {
  AL: "ALVMA (Alabama Veterinary Medical Association)",
  AK: "AKVMA (Alaska Veterinary Medical Association)",
  AZ: "AzVMA (Arizona Veterinary Medical Association)",
  AR: "ArVMA (Arkansas Veterinary Medical Association)",
  CA: "CVMA (California Veterinary Medical Association)",
  CO: "CVMA (Colorado Veterinary Medical Association)",
  CT: "CVMA (Connecticut Veterinary Medical Association)",
  DE: "DVMA (Delaware Veterinary Medical Association)",
  DC: "DCVMA (DC Academy of Veterinary Medicine)",
  FL: "FVMA (Florida Veterinary Medical Association)",
  GA: "GVMA (Georgia Veterinary Medical Association)",
  HI: "HVMA (Hawaii Veterinary Medical Association)",
  ID: "IVMA (Idaho Veterinary Medical Association)",
  IL: "ISVMA (Illinois State Veterinary Medical Association)",
  IN: "IVMA (Indiana Veterinary Medical Association)",
  IA: "IVMA (Iowa Veterinary Medical Association)",
  KS: "KVMA (Kansas Veterinary Medical Association)",
  KY: "KVMA (Kentucky Veterinary Medical Association)",
  LA: "LVMA (Louisiana Veterinary Medical Association)",
  ME: "MVMA (Maine Veterinary Medical Association)",
  MD: "MdVMA (Maryland Veterinary Medical Association)",
  MA: "MVMA (Massachusetts Veterinary Medical Association)",
  MI: "MVMA (Michigan Veterinary Medical Association)",
  MN: "MVMA (Minnesota Veterinary Medical Association)",
  MS: "MVMA (Mississippi Veterinary Medical Association)",
  MO: "MVMA (Missouri Veterinary Medical Association)",
  MT: "MVMA (Montana Veterinary Medical Association)",
  NE: "NVMA (Nebraska Veterinary Medical Association)",
  NV: "NVMA (Nevada Veterinary Medical Association)",
  NH: "NHVMA (New Hampshire Veterinary Medical Association)",
  NJ: "NJVMA (New Jersey Veterinary Medical Association)",
  NM: "NMVMA (New Mexico Veterinary Medical Association)",
  NY: "NYSVMS (New York State Veterinary Medical Society)",
  NC: "NCVMA (North Carolina Veterinary Medical Association)",
  ND: "NDVMA (North Dakota Veterinary Medical Association)",
  OH: "OVMA (Ohio Veterinary Medical Association)",
  OK: "OVMA (Oklahoma Veterinary Medical Association)",
  OR: "OVMA (Oregon Veterinary Medical Association)",
  PA: "PVMA (Pennsylvania Veterinary Medical Association)",
  RI: "RIVMA (Rhode Island Veterinary Medical Association)",
  SC: "SCAV (South Carolina Association of Veterinarians)",
  SD: "SDVMA (South Dakota Veterinary Medical Association)",
  TN: "TVMA (Tennessee Veterinary Medical Association)",
  TX: "TVMA (Texas Veterinary Medical Association)",
  UT: "UVMA (Utah Veterinary Medical Association)",
  VT: "VVMA (Vermont Veterinary Medical Association)",
  VA: "VVMA (Virginia Veterinary Medical Association)",
  WA: "WSVMA (Washington State Veterinary Medical Association)",
  WV: "WVVMA (West Virginia Veterinary Medical Association)",
  WI: "WVMA (Wisconsin Veterinary Medical Association)",
  WY: "WVMA (Wyoming Veterinary Medical Association)",
};

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC", "WASHINGTON DC": "DC", "WASHINGTON D.C.": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI",
  MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
  NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
  VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY",
};

const US_NATIONAL = "AVMA (American Veterinary Medical Association)";
const CA_NATIONAL = "CVMA (Canadian Veterinary Medical Association)";
const GENERIC = "General Veterinary Advertising Standards";

const CA_POSTAL_RE = /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i;
const US_ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;

// Canonical "City, ST 12345" / "City ST 12345" (US) and
// "City, ST A1A 1A1" (Canada). The province/state code lives next to the
// postal code so it's an extremely strong signal.
const US_CITY_STATE_ZIP_RE = /(?:,\s*|\s+)([A-Z]{2})\s+\d{5}(?:-\d{4})?/;
const CA_CITY_PROV_POSTAL_RE = /(?:,\s*|\s+)([A-Z]{2})\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d/i;
// "City, ST" with no postal code at all (e.g. "Centennial, CO").
// Anchored to end-of-string so we don't pick up mid-address tokens.
const CITY_STATE_NOZIP_RE = /(?:,\s*|\s+)([A-Z]{2})\s*$/;

const CA_CODES = new Set(Object.keys(CA_PROVINCE_MAP));
const US_CODES = new Set(Object.keys(US_STATE_MAP));

function stripNoise(input: string): string {
  // Drop email addresses and URLs which can contain false-positive 2-letter
  // tokens (".CO", ".IN", ".CA"), then collapse separators to plain spaces.
  return input
    .replace(/\S+@\S+/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/[\/\\|;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectCountry(upper: string): "US" | "CA" | null {
  if (/\bCANADA\b/.test(upper)) return "CA";
  if (/\b(UNITED STATES OF AMERICA|UNITED STATES|U\.S\.A?\.?|USA)\b/.test(upper)) return "US";
  if (CA_POSTAL_RE.test(upper)) return "CA";
  if (US_ZIP_RE.test(upper)) return "US";
  return null;
}

function pickByProximity(
  upper: string,
  codes: Set<string>,
  postalRe: RegExp,
): string | null {
  // Prefer the 2-letter code that sits closest to the postal/ZIP code.
  const postalMatch = postalRe.exec(upper);
  if (!postalMatch) return null;
  const postalIdx = postalMatch.index;

  let best: { code: string; dist: number } | null = null;
  const codeRe = /\b([A-Z]{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(upper)) !== null) {
    const code = m[1];
    if (!codes.has(code)) continue;
    const dist = Math.abs(m.index - postalIdx);
    if (!best || dist < best.dist) best = { code, dist };
  }
  return best?.code ?? null;
}

export function detectComplianceBody(address: string | null | undefined): string {
  if (!address) return GENERIC;
  const upper = stripNoise(String(address).toUpperCase());
  const country = detectCountry(upper);

  // 1) Strongest signal: "City, ST POSTAL" canonical patterns.
  const usCanon = US_CITY_STATE_ZIP_RE.exec(upper);
  if (usCanon && US_CODES.has(usCanon[1])) {
    return US_STATE_MAP[usCanon[1]];
  }
  const caCanon = CA_CITY_PROV_POSTAL_RE.exec(upper);
  if (caCanon && CA_CODES.has(caCanon[1].toUpperCase())) {
    return CA_PROVINCE_MAP[caCanon[1].toUpperCase()];
  }

  // 1b) "City, ST" with no postal code. Disambiguate codes shared by both
  // countries (e.g. "ON", "NB") using country signal; if there's no signal,
  // prefer US since unqualified "City, ST" is overwhelmingly a US convention.
  const noZip = CITY_STATE_NOZIP_RE.exec(upper);
  if (noZip) {
    const code = noZip[1].toUpperCase();
    const inUS = US_CODES.has(code);
    const inCA = CA_CODES.has(code);
    if (inUS && !inCA) return US_STATE_MAP[code];
    if (inCA && !inUS) return CA_PROVINCE_MAP[code];
    if (inUS && inCA) {
      if (country === "CA") return CA_PROVINCE_MAP[code];
      return US_STATE_MAP[code]; // default to US for shared codes
    }
  }
  // 2) Full state / province name anywhere in the string.
  if (country === "CA" || country === null) {
    for (const [name, code] of Object.entries(CA_NAME_TO_CODE)) {
      if (new RegExp(`\\b${name}\\b`).test(upper)) return CA_PROVINCE_MAP[code];
    }
  }
  if (country === "US" || country === null) {
    for (const [name, code] of Object.entries(US_STATE_NAME_TO_CODE)) {
      if (new RegExp(`\\b${name}\\b`).test(upper)) return US_STATE_MAP[code];
    }
  }

  // 3) Code closest to the postal/ZIP, scoped to the detected country.
  if (country === "CA") {
    const code = pickByProximity(upper, CA_CODES, CA_POSTAL_RE);
    if (code) return CA_PROVINCE_MAP[code];
    return CA_NATIONAL;
  }
  if (country === "US") {
    const code = pickByProximity(upper, US_CODES, US_ZIP_RE);
    if (code) return US_STATE_MAP[code];
    return US_NATIONAL;
  }

  // 4) Country still unknown — try proximity for both, prefer whichever
  // postal-code form appears in the string.
  const caCode = pickByProximity(upper, CA_CODES, CA_POSTAL_RE);
  if (caCode) return CA_PROVINCE_MAP[caCode];
  const usCode = pickByProximity(upper, US_CODES, US_ZIP_RE);
  if (usCode) return US_STATE_MAP[usCode];

  return GENERIC;
}

