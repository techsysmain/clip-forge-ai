/** Operator details shown in the legal pages. Set the LEGAL_* variables at runtime. */
export function legalInfo() {
  return {
    company: process.env.LEGAL_COMPANY_NAME || "ClipForge AI",
    email: process.env.LEGAL_CONTACT_EMAIL || "legal@example.com",
    privacyEmail: process.env.LEGAL_PRIVACY_EMAIL || process.env.LEGAL_CONTACT_EMAIL || "privacy@example.com",
    address: process.env.LEGAL_ADDRESS || "",
    jurisdiction: process.env.LEGAL_JURISDICTION || "the jurisdiction in which the operator is established",
    updated: process.env.LEGAL_LAST_UPDATED || "June 1, 2025",
    retentionDays: parseInt(process.env.RETENTION_DAYS ?? "", 10) || 30,
    aiProvider: process.env.AI_PROVIDER === "gemini" || (!process.env.OPENAI_API_KEY && !!process.env.GEMINI_API_KEY) ? "gemini" : "openai",
  };
}
