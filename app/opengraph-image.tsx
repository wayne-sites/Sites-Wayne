import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} — ${siteConfig.slogan}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          color: "#f5f8ff",
          background:
            "radial-gradient(circle at 80% 20%, rgba(67, 201, 255, .38), transparent 32%), radial-gradient(circle at 18% 82%, rgba(124, 88, 255, .32), transparent 36%), #07111f",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid rgba(146, 220, 255, .8)",
              background: "rgba(13, 31, 51, .8)",
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            N
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 850, letterSpacing: -1.5 }}>{siteConfig.name}</div>
            <div style={{ marginTop: 4, fontSize: 22, color: "#98dfff" }}>WAYNE CORPORATION</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
          <div style={{ fontSize: 76, lineHeight: 1.02, fontWeight: 900, letterSpacing: -3.5 }}>
            Tudo que move você,
            <span style={{ color: "#77d6ff" }}> conectado.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, lineHeight: 1.35, color: "#c9d7ea" }}>
            Descobrir, criar, aprender, vender e crescer em um único ecossistema digital brasileiro.
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, fontSize: 21, color: "#afbdd0" }}>
          <span>IA</span><span>•</span><span>Studio</span><span>•</span><span>Sites Wayne</span><span>•</span><span>Marketplace</span>
        </div>
      </div>
    ),
    size,
  );
}
