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

function detectCountry(upper: string): "US" | "CA" | null {
  if (/\bCANADA\b/.test(upper)) return "CA";
  if (/\b(UNITED STATES|U\.S\.A?\.?|USA)\b/.test(upper)) return "US";
  if (CA_POSTAL_RE.test(upper)) return "CA";
  if (US_ZIP_RE.test(upper)) return "US";
  return null;
}

export function detectComplianceBody(address: string | null | undefined): string {
  if (!address) return GENERIC;
  const upper = String(address).toUpperCase();
  const country = detectCountry(upper);

  // Canada
  if (country === "CA" || country === null) {
    for (const [name, code] of Object.entries(CA_NAME_TO_CODE)) {
      if (upper.includes(name)) return CA_PROVINCE_MAP[code];
    }
    if (CA_POSTAL_RE.test(upper)) {
      for (const [code, body] of Object.entries(CA_PROVINCE_MAP)) {
        if (new RegExp(`\\b${code}\\b`).test(upper)) return body;
      }
    }
  }

  // US
  if (country === "US" || country === null) {
    for (const [name, code] of Object.entries(US_STATE_NAME_TO_CODE)) {
      if (upper.includes(name)) return US_STATE_MAP[code];
    }
    if (US_ZIP_RE.test(upper)) {
      for (const [code, body] of Object.entries(US_STATE_MAP)) {
        if (new RegExp(`\\b${code}\\b`).test(upper)) return body;
      }
      return US_NATIONAL;
    }
  }

  if (country === "US") return US_NATIONAL;
  if (country === "CA") return CA_NATIONAL;
  return GENERIC;
}
