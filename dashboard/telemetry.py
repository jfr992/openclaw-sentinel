"""
MoltBot Guardian - OpenTelemetry Instrumentation

Provides traces and metrics for observability:
- HTTP request traces
- Custom metrics for alerts, tool calls, tokens
- Gateway connection status
"""
import os
from typing import Optional
from functools import wraps

# Check if OTEL is enabled
OTEL_ENABLED = bool(os.environ.get('OTEL_EXPORTER_OTLP_ENDPOINT'))

if OTEL_ENABLED:
    from opentelemetry import trace, metrics
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
    from opentelemetry.sdk.resources import Resource, SERVICE_NAME
    from opentelemetry.instrumentation.flask import FlaskInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor

    # Setup resource
    resource = Resource.create({
        SERVICE_NAME: os.environ.get('OTEL_SERVICE_NAME', 'moltbot-guardian'),
        "service.version": "1.0.0",
        "deployment.environment": os.environ.get('ENVIRONMENT', 'development'),
    })

    # Setup tracer
    tracer_provider = TracerProvider(resource=resource)
    otlp_exporter = OTLPSpanExporter()
    tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
    trace.set_tracer_provider(tracer_provider)

    # Setup metrics
    metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(),
        export_interval_millis=30000,  # Export every 30s
    )
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    # Get tracer and meter
    tracer = trace.get_tracer(__name__)
    meter = metrics.get_meter(__name__)

    # Create metrics
    alert_counter = meter.create_counter(
        "moltbot.alerts.total",
        description="Total number of security alerts",
        unit="1",
    )

    tool_call_counter = meter.create_counter(
        "moltbot.tool_calls.total",
        description="Total tool calls observed",
        unit="1",
    )

    token_counter = meter.create_counter(
        "moltbot.tokens.total",
        description="Total tokens used",
        unit="1",
    )

    cost_counter = meter.create_counter(
        "moltbot.cost.total",
        description="Total API cost in USD",
        unit="USD",
    )

    active_connections = meter.create_up_down_counter(
        "moltbot.connections.active",
        description="Number of active network connections",
        unit="1",
    )

    gateway_connected = meter.create_observable_gauge(
        "moltbot.gateway.connected",
        callbacks=[],  # Will be set later
        description="Gateway connection status (1=connected, 0=disconnected)",
        unit="1",
    )

    # Helper functions
    def record_alert(severity: str, category: str):
        """Record an alert metric."""
        alert_counter.add(1, {"severity": severity, "category": category})

    def record_tool_call(tool: str, success: bool = True):
        """Record a tool call metric."""
        tool_call_counter.add(1, {"tool": tool, "success": str(success)})

    def record_tokens(input_tokens: int, output_tokens: int, model: str):
        """Record token usage."""
        token_counter.add(input_tokens, {"type": "input", "model": model})
        token_counter.add(output_tokens, {"type": "output", "model": model})

    def record_cost(amount: float, model: str):
        """Record API cost."""
        cost_counter.add(amount, {"model": model})

    def record_connections(count: int):
        """Record active connection count."""
        active_connections.add(count)

    def instrument_flask(app):
        """Instrument a Flask app with automatic tracing."""
        FlaskInstrumentor().instrument_app(app)
        RequestsInstrumentor().instrument()
        print("📊 OTEL instrumentation enabled")

    def traced(name: Optional[str] = None):
        """Decorator to trace a function."""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                span_name = name or func.__name__
                with tracer.start_as_current_span(span_name):
                    return func(*args, **kwargs)
            return wrapper
        return decorator

else:
    # OTEL disabled - provide no-op implementations
    tracer = None
    meter = None

    def record_alert(severity: str, category: str):
        pass

    def record_tool_call(tool: str, success: bool = True):
        pass

    def record_tokens(input_tokens: int, output_tokens: int, model: str):
        pass

    def record_cost(amount: float, model: str):
        pass

    def record_connections(count: int):
        pass

    def instrument_flask(app):
        pass

    def traced(name: Optional[str] = None):
        def decorator(func):
            return func
        return decorator
