import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OwlMeet",
    short_name: "OwlMeet",
    description: "Find your people at Rice.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3e8",
    theme_color: "#f7f3e8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
