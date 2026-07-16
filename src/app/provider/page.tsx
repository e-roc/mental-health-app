import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ProviderDashboard } from "@/components/ProviderDashboard";

export default async function ProviderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PROVIDER") redirect("/");
  return <ProviderDashboard />;
}
