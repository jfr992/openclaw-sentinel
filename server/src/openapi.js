/**
 * OpenAPI (OAS) Configuration
 */
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'OpenClaw Sentinel API',
      version: '1.0.2',
      description: 'Monitor your AI agent\'s behavior, costs, and performance',
      contact: {
        name: 'OpenClaw',
        url: 'https://github.com/jfr992/openclaw-sentinel',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5056',
        description: 'Local development',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health and status endpoints' },
      { name: 'Usage', description: 'Token usage and cost metrics' },
      { name: 'Performance', description: 'Agent performance metrics' },
      { name: 'Insights', description: 'Behavioral insights and analysis' },
      { name: 'Security', description: 'Security alerts and risk assessment' },
      { name: 'Memory', description: 'Memory and vector search stats' },
      { name: 'Metrics', description: 'Historical metrics and data persistence' },
      { name: 'Live', description: 'Real-time gateway events' },
    ],
    components: {
      schemas: {
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            data: {
              type: 'object',
              properties: {
                lastParse: { type: 'string', format: 'date-time' },
                stats: {
                  type: 'object',
                  properties: {
                    files: { type: 'integer', example: 11 },
                    messages: { type: 'integer', example: 24064 },
                    toolCalls: { type: 'integer', example: 10832 },
                  },
                },
              },
            },
          },
        },
        UsageResponse: {
          type: 'object',
          properties: {
            totals: {
              type: 'object',
              properties: {
                inputTokens: { type: 'integer', example: 25000000 },
                outputTokens: { type: 'integer', example: 5000000 },
                cacheReadTokens: { type: 'integer', example: 20000000 },
                cacheWriteTokens: { type: 'integer', example: 1000000 },
                cost: { type: 'number', example: 125.50 },
                messages: { type: 'integer', example: 1500 },
              },
            },
            cacheHitRate: { type: 'number', example: 0.85 },
            daily: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string', example: '2026-02-01' },
                  inputTokens: { type: 'integer' },
                  outputTokens: { type: 'integer' },
                  cost: { type: 'number' },
                },
              },
            },
          },
        },
        PerformanceSummary: {
          type: 'object',
          properties: {
            overall_score: { type: 'integer', minimum: 0, maximum: 100, example: 87 },
            task_completion: { type: 'number', example: 0.79 },
            avg_latency_ms: { type: 'number', example: 8600 },
            tool_success_rate: { type: 'number', example: 0.999 },
            memory_usage_rate: { type: 'number', example: 0.99 },
            proactive_score: { type: 'integer', example: 56 },
            error_recovery: { type: 'number', example: 0.95 },
          },
        },
        InsightsSummary: {
          type: 'object',
          properties: {
            health_score: { type: 'integer', example: 85 },
            corrections: { type: 'integer', example: 0 },
            sentiment: { type: 'integer', example: 52 },
            context_health: { type: 'integer', example: 85 },
          },
        },
        SecurityRisk: {
          type: 'object',
          properties: {
            level: { type: 'integer', minimum: 0, maximum: 4, example: 1 },
            score: { type: 'integer', example: 25 },
            alerts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  message: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                  toolCall: { type: 'object' },
                },
              },
            },
          },
        },
        MemoryStatus: {
          type: 'object',
          properties: {
            agents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'main' },
                  files: { type: 'integer', example: 10 },
                  chunks: { type: 'integer', example: 42 },
                  cache: {
                    type: 'object',
                    properties: {
                      entries: { type: 'integer', example: 42 },
                    },
                  },
                },
              },
            },
            totals: {
              type: 'object',
              properties: {
                agents: { type: 'integer', example: 3 },
                files: { type: 'integer', example: 10 },
                chunks: { type: 'integer', example: 42 },
                cacheEntries: { type: 'integer', example: 42 },
              },
            },
            source: { type: 'string', enum: ['sqlite', 'cli'], example: 'sqlite' },
          },
        },
        MetricsQuery: {
          type: 'object',
          properties: {
            buckets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bucket: { type: 'string', format: 'date-time' },
                  input_tokens: { type: 'integer' },
                  output_tokens: { type: 'integer' },
                  cost: { type: 'number' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                total_input: { type: 'integer' },
                total_output: { type: 'integer' },
                total_cost: { type: 'number' },
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./server/src/index.js', './server/src/interfaces/http/routes/*.js'],
}

const spec = swaggerJsdoc(options)

export function setupOpenAPI(app) {
  // Serve OpenAPI spec as JSON
  app.get('/api/openapi.json', (req, res) => {
    res.json(spec)
  })

  // Swagger UI
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Sentinel API Docs',
  }))

  console.log('[OpenAPI] Docs available at /api/docs')
}

export { spec }
