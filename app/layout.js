import "./globals.css";

export const metadata = {
  title: "Free website review + redesign preview — NM2TECH",
  description:
    "Free AI website review and redesign preview for Maryland businesses. Optional $99 Assessment — credited toward your project — with a priority plan and 15-minute walkthrough by NM2TECH.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
