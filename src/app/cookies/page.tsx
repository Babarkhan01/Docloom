import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return <LegalPage slug="cookies" />;
}
