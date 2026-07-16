import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ChatRoom } from "@/components/ChatRoom";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ChatRoom sessionId={id} />;
}
