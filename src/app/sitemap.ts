import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/login", "/privacy", "/terms", "/cookies", "/acceptable-use", "/copyright", "/subprocessors"];
  return paths.map((p) => ({ url: `${env.appUrl}${p}`, changeFrequency: "monthly" as const }));
}
