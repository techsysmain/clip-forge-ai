import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy", "/terms", "/cookies", "/acceptable-use", "/copyright", "/subprocessors"], disallow: ["/api/", "/dashboard", "/projects", "/clips", "/settings"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
