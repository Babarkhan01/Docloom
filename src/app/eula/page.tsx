import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "End User License Agreement" };

export default function EulaPage() {
  return <LegalPage slug="eula" />;
}
