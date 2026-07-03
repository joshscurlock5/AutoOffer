import type { Metadata } from "next";
import { isAuthed } from "@/lib/auth";
import { getAnalytics } from "@/lib/analyticsData";
import LoginForm from "../LoginForm";
import AnalyticsDashboard from "../AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

// Always fresh — profiles are computed from live leads.
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  if (!(await isAuthed())) {
    return <LoginForm />;
  }
  const data = await getAnalytics();
  return <AnalyticsDashboard data={data} />;
}
