import type { MetadataRoute } from "next";
import { APP_NAME } from "shared";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Runway",
    description:
      "Gestión financiera personal durante una etapa de transición laboral",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#0f766e",
    lang: "es",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
