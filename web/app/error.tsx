"use client";

import { ErrorState } from "@/components/ui/error-state";

export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center px-4 py-12">
      <ErrorState onRetry={retry} digest={error.digest} />
    </main>
  );
}
