import { ImageResponse } from "next/og";

// Default social-share image for every page without its own opengraph-image
// (home, category, static pages). Product pages override this with their own.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SV Car Customs — Body Kits, Spoilers & Car Accessories";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAF9",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: "#E8822A" }} />
          <span style={{ fontSize: 38, fontWeight: 800, color: "#0A0A0A", letterSpacing: "-0.02em" }}>
            SV CAR CUSTOMS
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#0A0A0A",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: 900,
              display: "flex",
            }}
          >
            Body Kits, Spoilers & Car Accessories
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#E8822A", marginTop: 24 }}>
            Pan-India delivery
          </span>
          <span style={{ fontSize: 22, color: "#57534E", marginTop: 8 }}>
            Quality · Durability · Reliability since 2004
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
