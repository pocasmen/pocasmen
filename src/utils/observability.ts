import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';
import { logger } from './logger';

const tracer = trace.getTracer('cron-jobs');
const meter = metrics.getMeter('cron-jobs-metrics');

const cronCounter = meter.createCounter('cron_job_executions_total', {
  description: 'Total number of cron job executions',
});

const cronDuration = meter.createHistogram('cron_job_duration_seconds', {
  description: 'Duration of cron job executions in seconds',
});

const cronErrors = meter.createCounter('cron_job_errors_total', {
  description: 'Total number of cron job errors',
});

/**
 * Wrapper para adicionar observabilidade a funções executadas por cron jobs.
 */
export async function withObservability(jobName: string, fn: () => Promise<void>) {
  return tracer.startActiveSpan(`cron:${jobName}`, async (span) => {
    const startTime = process.hrtime();
    cronCounter.add(1, { job_name: jobName });

    try {
      await fn();
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error as Error);
      cronErrors.add(1, { job_name: jobName });
      throw error;
    } finally {
      const endTime = process.hrtime(startTime);
      const durationInSeconds = endTime[0] + endTime[1] / 1e9;
      cronDuration.record(durationInSeconds, { job_name: jobName });
      span.end();
    }
  });
}
