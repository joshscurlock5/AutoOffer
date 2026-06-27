import type { Metadata } from "next";
import { isAuthed } from "@/lib/auth";
import { getLeads, getReferrals } from "@/lib/store";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Always render fresh — leads change constantly.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthed())) {
    return <LoginForm />;
  }
  const [leads, referrals] = await Promise.all([getLeads(), getReferrals()]);
  return <AdminDashboard initialLeads={leads} initialReferrals={referrals} />;
}
