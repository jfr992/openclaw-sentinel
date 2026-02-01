/**
 * OpenTelemetry Instrumentation
 * Load this BEFORE other imports via --require or NODE_OPTIONS
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Use require for CommonJS OTEL packages
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http')
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { Resource } = require('@opentelemetry/resources')

// Semantic conventions constants
const ATTR_SERVICE_NAME = 'service.name'
const ATTR_SERVICE_VERSION = 'service.version'
const ATTR_DEPLOYMENT_ENVIRONMENT = 'deployment.environment'

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'openclaw-sentinel'
const ENVIRONMENT = process.env.ENVIRONMENT || 'development'

// Only initialize if OTEL endpoint is configured
const otelEnabled = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_ENABLED === 'true'

let sdk = null

if (otelEnabled) {
  console.log(`[OTEL] Initializing telemetry → ${OTEL_ENDPOINT}`)
  
  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.2',
      [ATTR_DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${OTEL_ENDPOINT}/v1/metrics`,
      }),
      exportIntervalMillis: 30000, // Export every 30s
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation (too noisy for session file parsing)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingPaths: ['/api/health'], // Don't trace health checks
        },
      }),
    ],
  })

  sdk.start()
  console.log('[OTEL] Telemetry started')

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[OTEL] Telemetry shut down'))
      .catch((err) => console.error('[OTEL] Shutdown error:', err))
      .finally(() => process.exit(0))
  })
} else {
  console.log('[OTEL] Telemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
}

export { sdk }
