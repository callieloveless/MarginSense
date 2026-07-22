import type { ReactNode } from "react";

/** Centered, phone-first auth shell (constitution §1). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold">MarginSense</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Is this estimate worth the crew hours it takes?
        </p>
      </div>
      {children}
    </div>
  );
}
