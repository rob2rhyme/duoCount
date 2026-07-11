/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin must load from node_modules at runtime, never be bundled —
  // its dynamic require()s of grpc/protobuf don't survive bundling and would
  // crash the serverless function at cold start (before any handler try/catch
  // runs). Next 15 already externalizes it by default; this is an explicit
  // safety net that also covers Turbopack and nested-install edge cases.
  serverExternalPackages: ["firebase-admin"],
};
export default nextConfig;
