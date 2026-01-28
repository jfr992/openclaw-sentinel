"""
Gateway WebSocket Client - Real-time connection to Clawdbot gateway.
Uses raw WebSocket with challenge-response auth (like crabwalk).
"""
import os
import json
import hmac
import hashlib
import threading
import time
from pathlib import Path
from typing import Callable, Optional, Dict, Any
import websocket

CLAWDBOT_CONFIG = Path.home() / '.clawdbot' / 'clawdbot.json'


def create_connect_params(token: str, nonce: str, ts: int) -> Dict[str, Any]:
    """Create signed connection params for challenge-response auth."""
    message = f"{nonce}:{ts}"
    signature = hmac.new(
        token.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return {
        "nonce": nonce,
        "ts": ts,
        "sig": signature,
    }


class GatewayClient:
    """WebSocket client for Clawdbot gateway with challenge-response auth."""

    def __init__(self):
        self.ws: Optional[websocket.WebSocketApp] = None
        self.connected = False
        self._load_config()
        self.request_id = 0
        self.pending_requests: Dict[str, Any] = {}
        self.callbacks: Dict[str, list] = {
            'tool_call': [],
            'message': [],
            'session': [],
            'error': [],
            'connect': [],
        }
        self._thread: Optional[threading.Thread] = None
        self._stop = False

    def _load_config(self):
        """Load gateway URL and token from clawdbot config."""
        self.gateway_url = os.environ.get('CLAWDBOT_URL', 'ws://127.0.0.1:18789')
        self.token = os.environ.get('CLAWDBOT_API_TOKEN')
        
        # Auto-load from clawdbot.json if not set
        if not self.token and CLAWDBOT_CONFIG.exists():
            try:
                config = json.loads(CLAWDBOT_CONFIG.read_text())
                self.token = config.get('gateway', {}).get('auth', {}).get('token')
                # Also get port if configured
                port = config.get('gateway', {}).get('port', 18789)
                if 'CLAWDBOT_URL' not in os.environ:
                    self.gateway_url = f'ws://127.0.0.1:{port}'
            except Exception as e:
                print(f"[GatewayClient] Failed to load config: {e}")

    def on(self, event: str, callback: Callable):
        """Register a callback for an event type."""
        if event in self.callbacks:
            self.callbacks[event].append(callback)

    def _emit(self, event: str, data: Any):
        """Emit event to all registered callbacks."""
        for cb in self.callbacks.get(event, []):
            try:
                cb(data)
            except Exception as e:
                print(f"[GatewayClient] Callback error: {e}")

    def _on_message(self, ws, message: str):
        """Handle incoming WebSocket message."""
        try:
            msg = json.loads(message)
            msg_type = msg.get('type')

            # Handle challenge-response auth
            if msg_type == 'event' and msg.get('event') == 'connect.challenge':
                self._handle_challenge(msg.get('payload', {}))
                return

            # Handle hello-ok (connected)
            if msg_type == 'hello-ok' or (msg_type == 'res' and msg.get('ok') and 
                                          isinstance(msg.get('payload'), dict) and 
                                          msg['payload'].get('type') == 'hello-ok'):
                self.connected = True
                print(f"[GatewayClient] Connected to {self.gateway_url}")
                self._emit('connect', {'connected': True})
                return

            # Handle response to our requests
            if msg_type == 'res':
                req_id = msg.get('id')
                if req_id in self.pending_requests:
                    pending = self.pending_requests.pop(req_id)
                    if msg.get('ok'):
                        pending['resolve'](msg.get('payload'))
                    else:
                        pending['reject'](msg.get('error', {}).get('message', 'Request failed'))
                return

            # Handle events from gateway
            if msg_type == 'event':
                event_name = msg.get('event', '')
                payload = msg.get('payload', {})

                # Map to our callback types
                if 'tool' in event_name.lower() or payload.get('tool'):
                    self._emit('tool_call', payload)
                elif 'message' in event_name.lower() or 'chat' in event_name.lower():
                    self._emit('message', payload)
                elif 'session' in event_name.lower():
                    self._emit('session', payload)

        except json.JSONDecodeError:
            print(f"[GatewayClient] Invalid JSON: {message[:100]}")
        except Exception as e:
            print(f"[GatewayClient] Message error: {e}")

    def _handle_challenge(self, challenge: Dict[str, Any]):
        """Respond to auth challenge."""
        if not self.token or not self.ws:
            print("[GatewayClient] No token for auth challenge")
            return

        nonce = challenge.get('nonce', '')
        ts = challenge.get('ts', int(time.time() * 1000))

        params = create_connect_params(self.token, nonce, ts)
        response = {
            "type": "req",
            "id": f"connect-{int(time.time() * 1000)}",
            "method": "connect",
            "params": params,
        }

        try:
            self.ws.send(json.dumps(response))
        except Exception as e:
            print(f"[GatewayClient] Failed to send auth response: {e}")

    def _on_error(self, ws, error):
        """Handle WebSocket error."""
        print(f"[GatewayClient] Error: {error}")
        self._emit('error', {'type': 'websocket_error', 'error': str(error)})

    def _on_close(self, ws, close_status_code, close_msg):
        """Handle WebSocket close."""
        was_connected = self.connected
        self.connected = False
        print(f"[GatewayClient] Disconnected (code={close_status_code})")
        if was_connected:
            self._emit('error', {'type': 'disconnected', 'code': close_status_code})

    def _on_open(self, ws):
        """Handle WebSocket open."""
        print(f"[GatewayClient] WebSocket opened, waiting for challenge...")

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
                if not self.connected and self.ws:
                    try:
                        self.ws.run_forever(ping_interval=30, ping_timeout=10)
                    except Exception as e:
                        print(f"[GatewayClient] Run error: {e}")
                
                if not self._stop:
                    time.sleep(5)
                    self.connect()  # Reconnect

        self.connect()
        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

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
        }


# Singleton
_client: Optional[GatewayClient] = None

def get_gateway_client() -> GatewayClient:
    global _client
    if _client is None:
        _client = GatewayClient()
    return _client
