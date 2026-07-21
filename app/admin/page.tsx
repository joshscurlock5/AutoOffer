import type { Metadata } from "next";
import { isAuthed } from "@/lib/auth";
import { getLeads, getReferrals } from "@/lib/store";
import { getAnalytics } from "@/lib/analyticsData";
import LoginForm from "./LoginForm";
import AnalyticsDashboard from "./AnalyticsDashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Always render fresh — leads and profiles change constantly.
export const dynamic = "force-dynamic";

// The unified admin panel: the analytics dashboard, with the Leads inbox as its
// rightmost tab. Defaults to the Overview tab; ?tab=leads (or any tab key) lands
// straight on that tab.
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!(await isAuthed())) {
    return <LoginForm />;
  }
  const [data, leads, referrals] = await Promise.all([getAnalytics(), getLeads(), getReferrals()]);
  const { tab } = await searchParams;
  return <AnalyticsDashboard data={data} leads={leads} referrals={referrals} initialTab={tab} />;
}
