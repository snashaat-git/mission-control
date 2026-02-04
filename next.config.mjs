/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE:
  // Next.js 16 enables Turbopack by default, and a custom `webpack` config
  // triggers an error unless migrated to Turbopack.
  // We keep config minimal to allow `npm run dev` to start.
};

export default nextConfig;
