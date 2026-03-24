import dotenv from 'dotenv';
dotenv.config();

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './utils/logger';

// Configuração do SDK do OpenTelemetry
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'microatomo',
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'my-application-group',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.1.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production',
  }),
  traceExporter: new OTLPTraceExporter({
    // URL do OTel Collector ou Grafana Cloud
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS 
      ? Object.fromEntries(process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(h => {
          const i = h.indexOf('=');
          return [h.substring(0, i), h.substring(i + 1)];
        }))
      : {},
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
      headers: process.env.OTEL_EXPORTER_OTLP_HEADERS 
        ? Object.fromEntries(process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map(h => {
            const i = h.indexOf('=');
            return [h.substring(0, i), h.substring(i + 1)];
          }))
        : {},
    }),
    exportIntervalMillis: 60000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Desativar FS por ser muito ruidoso
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
      // Configuração específica para o PostgreSQL
      '@opentelemetry/instrumentation-pg': {
        requireParentSpan: true,
        enhancedDatabaseReporting: true,
      },
      // Configuração para o Express
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
    }),
  ],
});

// Inicialização do SDK
try {
  sdk.start();
  logger.info('OpenTelemetry initialized');
} catch (error) {
  logger.error(error, 'Error initializing OpenTelemetry');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => logger.info('OpenTelemetry terminated'))
    .catch((error) => logger.error(error, 'Error terminating OpenTelemetry'))
    .finally(() => process.exit(0));
});

export default sdk;
