import type { MetadataRoute } from "next";

// Private invite-only pilot: keep the whole app out of search indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
