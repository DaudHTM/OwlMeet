import { InviteLanding } from "@/components/invite-landing";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteLanding code={code} />;
}
