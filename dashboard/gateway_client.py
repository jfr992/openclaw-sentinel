"""
Gateway WebSocket Client - Real-time connection to Clawdbot gateway.
Receives chat/agent events for live monitoring.
"""
import os
import json
import threading
import time
from pathlib import Path
from typing import Callable, Optional, Dict, Any, List
import websocket

# Config path - check CLAWDBOT_DIR env var first (for Docker), then default
_clawdbot_dir = os.environ.get('CLAWDBOT_DIR', str(Path.home() / '.clawdbot'))
CLAWDBOT_CONFIG = Path(_clawdbot_dir) / 'clawdbot.json'


def create_connect_params(token: Optional[str] = None) -> Dict[str, Any]:
    """Create connection params for gateway handshake."""
    import platform as plat
    return {
        "minProtocol": 3,
        "maxProtocol": 3,
        "client": {
            "id": "cli",  # Must be 'cli' for operator role
            "displayName": "MoltBot Guardian",
            "version": "1.0.0",
            "platform": plat.system().lower(),
            "mode": "cli",
        },
        "role": "operator",
        "scopes": ["operator.read", "operator.write", "operator.admin"],
        "caps": [],
        "commands": [],
        "permissions": {},
        "locale": "en-US",
        "userAgent": "moltbot-guardian/1.0.0",
        "auth": {"token": token} if token else {},
    }


class GatewayClient:
    """WebSocket client for Clawdbot gateway - receives real-time events."""

    def __init__(self):
        self.ws: Optional[websocket.WebSocketApp] = None
        self.connected = False
        self._load_config()
        self.request_id = 0
        self.pending_requests: Dict[str, Any] = {}
        self.callbacks: Dict[str, List[Callable]] = {
            'chat': [],       # Chat/message events
            'agent': [],      # Agent tool call events
            'presence': [],   # Presence updates
            'health': [],     # Health events
            'connect': [],    # Connection state
            'error': [],      # Errors
        }
        self._thread: Optional[threading.Thread] = None
        self._stop = False
        self._features: Dict[str, Any] = {}

    def _load_config(self):
        """Load gateway URL and token from clawdbot config."""
        # Detect if running in Docker - use host.docker.internal
        in_docker = os.path.exists('/.dockerenv')
        default_host = 'host.docker.internal' if in_docker else '127.0.0.1'

        self.gateway_url = os.environ.get('CLAWDBOT_URL', f'ws://{default_host}:18789')
        self.token = os.environ.get('CLAWDBOT_API_TOKEN')

        # Auto-load from clawdbot.json if not set
        if CLAWDBOT_CONFIG.exists():
            try:
                config = json.loads(CLAWDBOT_CONFIG.read_text())
                if not self.token:
                    self.token = config.get('gateway', {}).get('auth', {}).get('token')
                # Get port if configured
                port = config.get('gateway', {}).get('port', 18789)
                if 'CLAWDBOT_URL' not in os.environ:
                    self.gateway_url = f'ws://{default_host}:{port}'
            except Exception as e:
                print(f"[GatewayClient] Config load warning: {e}")

    def on(self, event: str, callback: Callable):
        """Register a callback for an event type."""
        if event in self.callbacks:
            self.callbacks[event].append(callback)
        return self  # Allow chaining

    def _emit(self, event: str, data: Any):
        """Emit event to all registered callbacks."""
        for cb in self.callbacks.get(event, []):
            try:
                cb(data)
            except Exception as e:
                print(f"[GatewayClient] Callback error ({event}): {e}")

    def _on_message(self, ws, message: str):
        """Handle incoming WebSocket message."""
        try:
            msg = json.loads(message)
            msg_type = msg.get('type')

            # Handle challenge - send connect request
            if msg_type == 'event' and msg.get('event') == 'connect.challenge':
                self._send_connect()
                return

            # Handle connect response (hello-ok)
            if msg_type == 'res':
                payload = msg.get('payload', {})
                if payload.get('type') == 'hello-ok':
                    self.connected = True
                    self._features = payload.get('features', {})
                    print(f"[GatewayClient] ✅ Connected to {self.gateway_url}")
                    print(f"[GatewayClient] Events available: {self._features.get('events', [])}")
                    self._emit('connect', {'connected': True, 'features': self._features})
                    return

                # Handle other responses
                req_id = msg.get('id')
                if req_id in self.pending_requests:
                    pending = self.pending_requests.pop(req_id)
                    if msg.get('ok'):
                        pending['resolve'](payload)
                    else:
                        pending['reject'](msg.get('error', {}).get('message', 'Request failed'))
                return

            # Handle events (chat, agent, presence, health, tick)
            if msg_type == 'event':
                event_name = msg.get('event', '')
                payload = msg.get('payload', {})

                # Route to appropriate callbacks
                if event_name == 'chat':
                    self._emit('chat', payload)
                elif event_name == 'agent':
                    self._emit('agent', payload)
                elif event_name == 'presence':
                    self._emit('presence', payload)
                elif event_name == 'health':
                    self._emit('health', payload)
                elif event_name == 'tick':
                    pass  # Heartbeat, ignore
                else:
                    # Unknown event - log it
                    print(f"[GatewayClient] Unknown event: {event_name}")

        except json.JSONDecodeError:
            print(f"[GatewayClient] Invalid JSON: {message[:100]}")
        except Exception as e:
            print(f"[GatewayClient] Message error: {e}")

    def _send_connect(self):
        """Send connect request after challenge."""
        if not self.ws:
            return

        req_id = f"connect-{int(time.time() * 1000)}"
        request = {
            "type": "req",
            "id": req_id,
            "method": "connect",
            "params": create_connect_params(self.token),
        }

        try:
            self.ws.send(json.dumps(request))
            print("[GatewayClient] 🔑 Sent connect request...")
        except Exception as e:
            print(f"[GatewayClient] Failed to send connect: {e}")

    def _on_error(self, ws, error):
        """Handle WebSocket error."""
        print(f"[GatewayClient] ❌ Error: {error}")
        self._emit('error', {'type': 'websocket_error', 'error': str(error)})

    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close."""
        was_connected = self.connected
        self.connected = False
        print(f"[GatewayClient] Disconnected (code={close_status_code})")
        if was_connected:
            self._emit('error', {'type': 'disconnected', 'code': close_status_code})

    def _on_open(self, ws):
        """Handle WebSocket open - wait for challenge."""
        print(f"[GatewayClient] 🔌 WebSocket opened, waiting for challenge...")

    def connect(self) -> bool:
        """Connect to gateway WebSocket."""
        if self.connected:
            return True

        try:
            self.ws = websocket.WebSocketApp(
                self.gateway_url,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
                on_open=self._on_open,
            )
            return True
        except Exception as e:
            print(f"[GatewayClient] Failed to create WebSocket: {e}")
            return False

    def disconnect(self):
        """Disconnect from gateway."""
        self._stop = True
        if self.ws:
            self.ws.close()
            self.ws = None
        self.connected = False

    def start_background(self):
        """Start connection in background thread with auto-reconnect."""
        def run():
            while not self._stop:
                if not self.connected:
                    self.connect()
                    if self.ws:
                        try:
                            # run_forever blocks until disconnected
                            self.ws.run_forever(
                                ping_interval=30,
                                ping_timeout=10,
                                skip_utf8_validation=True
                            )
                        except Exception as e:
                            print(f"[GatewayClient] Run error: {e}")

                if not self._stop:
                    print("[GatewayClient] Reconnecting in 5s...")
                    time.sleep(5)

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()
        print("[GatewayClient] 🚀 Background thread started")

    def request(self, method: str, params: Any = None, timeout: float = 30.0) -> Any:
        """Send a request and wait for response."""
        if not self.connected or not self.ws:
            raise Exception("Not connected")

        req_id = f"req-{self.request_id}"
        self.request_id += 1

        request = {
            "type": "req",
            "id": req_id,
            "method": method,
            "params": params,
        }

        result = {"value": None, "error": None, "done": False}
        event = threading.Event()

        def resolve(value):
            result["value"] = value
            result["done"] = True
            event.set()

        def reject(error):
            result["error"] = error
            result["done"] = True
            event.set()

        self.pending_requests[req_id] = {"resolve": resolve, "reject": reject}

        try:
            self.ws.send(json.dumps(request))
        except Exception as e:
            self.pending_requests.pop(req_id, None)
            raise Exception(f"Failed to send request: {e}")

        event.wait(timeout)

        if not result["done"]:
            self.pending_requests.pop(req_id, None)
            raise Exception("Request timeout")

        if result["error"]:
            raise Exception(result["error"])

        return result["value"]

    def get_status(self) -> dict:
        """Get connection status."""
        return {
            'connected': self.connected,
            'gateway_url': self.gateway_url,
            'has_token': bool(self.token),
            'token_source': 'env' if os.environ.get('CLAWDBOT_API_TOKEN') else
                           ('config' if self.token else 'none'),
            'features': self._features,
        }


# Singleton
_client: Optional[GatewayClient] = None

def get_gateway_client() -> GatewayClient:
    global _client
    if _client is None:
        _client = GatewayClient()
    return _client
