import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tennis Academy Limassol Tournaments",
    short_name: "Tennis Tournaments",
    description: "Live tennis tournament schedules, standings, and results.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#18181b",
    icons: [
      {
        src: "/logo.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
