import { isRenderJobFinished, type RenderJob } from '@travel-route-animator/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, renderEventsUrl } from '@/lib/api';

export const RENDERS_KEY = ['renders'] as const;

/** All render jobs of this server run; kept current by the job streams (useRenderJobStream). */
export function useRenderJobs() {
  return useQuery({ queryKey: RENDERS_KEY, queryFn: api.listRenders });
}

/** Puts a new or changed job into the list, at the end if it is new. */
export function storeRenderJob(queryClient: QueryClient, job: RenderJob) {
  queryClient.setQueryData<RenderJob[]>(RENDERS_KEY, (jobs = []) =>
    jobs.some(({ id }) => id === job.id)
      ? jobs.map((known) => (known.id === job.id ? job : known))
      : [...jobs, job],
  );
}

// How long to wait before listening again after a stream broke (e.g. the server restarted).
// Only our own server on localhost is asked, and only while the job is still on the list.
const RECONNECT_MS = 2000;

/**
 * Follows one running job through its server-sent events and writes every change into the
 * list. The stream is closed when the job is finished; EventSource would otherwise connect
 * again on its own.
 */
export function useRenderJobStream(id: string) {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const source = new EventSource(renderEventsUrl(id));
    let retry: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener('job', (event) => {
      const job = JSON.parse((event as MessageEvent<string>).data) as RenderJob;
      storeRenderJob(queryClient, job);
      if (isRenderJobFinished(job.state)) source.close();
    });
    source.onerror = () => {
      source.close();
      // The list says whether the job still exists; if it does, listen again.
      void queryClient.invalidateQueries({ queryKey: RENDERS_KEY });
      retry = setTimeout(() => setAttempt((count) => count + 1), RECONNECT_MS);
    };
    return () => {
      clearTimeout(retry);
      source.close();
    };
  }, [id, attempt, queryClient]);
}
