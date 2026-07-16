import { AcceptInviteForm } from "@/components/AcceptInviteForm";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AcceptInviteForm token={token} />;
}
