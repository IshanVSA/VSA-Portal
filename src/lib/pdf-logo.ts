import vsaLogoUrl from "@/assets/vsa-logo.jpg";

let cachedLogoDataUrl: string | null = null;

async function loadLogoBase64(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  const response = await fetch(vsaLogoUrl);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      cachedLogoDataUrl = reader.result as string;
      resolve(cachedLogoDataUrl);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Adds the VSA logo to the top-right of the current page of a jsPDF doc.
 */
export async function addVSALogo(doc: any, x = 160, y = 8, width = 36, height = 7): Promise<void> {
  try {
    const dataUrl = await loadLogoBase64();
    doc.addImage(dataUrl, "JPEG", x, y, width, height);
  } catch {
    // silently continue
  }
}

/**
 * Adds the VSA logo to every page of a finalized jsPDF doc.
 * Call this right before doc.save().
 */
export async function addVSALogoToAllPages(doc: any, x?: number, y = 8, width = 36, height = 7): Promise<void> {
  try {
    const dataUrl = await loadLogoBase64();
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pageWidth = doc.internal.pageSize.getWidth();
      const logoX = x ?? pageWidth - width - 14;
      doc.addImage(dataUrl, "JPEG", logoX, y, width, height);
    }
  } catch {
    // silently continue
  }
}
