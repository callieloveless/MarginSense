/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Job photos upload through a server action (add-photo-capture) and Next's default body
      // limit is 1 MB — smaller than a downscaled photo plus its thumbnail. This is the
      // transport ceiling for the whole request; the per-object rule is MAX_UPLOAD_BYTES in
      // src/photos/photos.ts (6 MB), re-checked server-side. Keep this above it.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
