import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Local server: failures are real problems (server stopped), not flaky networks.
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  });
}

export function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient?: QueryClient;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={400}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
