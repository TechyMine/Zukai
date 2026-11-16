/**
 * ZUKAI AUDIO JOBS QUERY & REALTIME HOOKS
 * Location: /zukai/src/features/jobs/hooks/useJob.ts
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  fetchJobById,
  createAudioJob,
  cancelAudioJob,
  CreateAudioJobParams,
  AudioJobRow,
} from '../api/jobsApi';
import { documentKeys } from '@/features/documents/hooks/useDocuments';

export const jobKeys = {
  all: ['jobs'] as const,
  details: () => [...jobKeys.all, 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};

export function useJob(jobId: string) {
  const queryClient = useQueryClient();

  // 1. Initial Query with active polling while processing
  const query = useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: () => fetchJobById(jobId),
    enabled: Boolean(jobId),
    staleTime: 0,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.status === 'ready' || data.status === 'failed' || data.status === 'canceled') {
        return false;
      }
      return 2000;
    },
  });

  // 2. Realtime WebSocket Subscription on audio_jobs
  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;

    // Clean up any stale channels that might still be lingering for this jobId
    const staleChannels = supabase.getChannels().filter((c) => c.topic.includes(jobId));
    staleChannels.forEach((c) => {
      try {
        supabase.removeChannel(c);
      } catch {}
    });

    // Use a unique channel name per subscription instance to prevent channel collision in React StrictMode/navigation
    const channelName = `job_${jobId}_${Math.random().toString(36).substring(2, 9)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          if (!isMounted) return;
          const updatedJob = payload.new as AudioJobRow;
          queryClient.setQueryData(jobKeys.detail(jobId), updatedJob);

          // If job reached terminal ready state, invalidate library and documents
          if (updatedJob.status === 'ready') {
            queryClient.invalidateQueries({ queryKey: ['library'] });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [jobId, queryClient]);

  return query;
}

export function useCreateAudioJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateAudioJobParams) => createAudioJob(params),
    onSuccess: (job) => {
      queryClient.setQueryData(jobKeys.detail(job.id), job);
      queryClient.invalidateQueries({ queryKey: documentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => cancelAudioJob(jobId),
    onSuccess: (job) => {
      queryClient.setQueryData(jobKeys.detail(job.id), job);
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

