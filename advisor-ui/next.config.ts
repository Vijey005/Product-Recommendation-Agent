import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        // Flipkart product image CDN (primary)
        protocol: "https",
        hostname: "rukminim2.flixcart.com",
        port: "",
        pathname: "/**",
      },
      {
        // Flipkart product image CDN (secondary)
        protocol: "https",
        hostname: "rukminim1.flixcart.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
