import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM репетитора",
    short_name: "CRM",
    description: "Облік учнів, уроків і оплат",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf2f8",
    theme_color: "#fdf2f8",
    lang: "uk",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}