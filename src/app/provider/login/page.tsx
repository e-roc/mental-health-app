"use client";

import { AuthForm } from "@/components/AuthForm";
import { ProviderTestCredentials } from "@/components/ProviderTestCredentials";

export default function ProviderLoginPage() {
  return (
    <AuthForm
      mode="login"
      title="Provider log in"
      subtitle="Sign in to your provider dashboard."
      showRegisterLink={false}
      renderExtras={(fill) => <ProviderTestCredentials onSelect={fill} />}
    />
  );
}
