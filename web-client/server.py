"""Combined static file server + WebSocket TCP proxy for the AugurMS web client.

Routes:
  GET /           -> index.html (or WS upgrade bridged to game server)
  GET /web/*      -> static /app/web
  GET /build/*    -> static /app/build
  GET /healthz    -> 'ok'

The WS proxy accepts the target address as its first text message (same protocol
as the original ws_proxy.py from maplestory-wasm) but restricts the target to a
small allow-list of host:port pairs to prevent abuse.
"""

import asyncio
import logging
import os
from aiohttp import web, WSMsgType

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s %(message)s')
log = logging.getLogger('augur-ms-web')

STATIC_ROOT = os.environ.get('STATIC_ROOT', '/app')
PORT = int(os.environ.get('PORT', '8080'))

# Comma-separated host:port allow list, e.g. "213.188.212.103:8484,213.188.212.103:7575,..."
# Default covers the current AugurMS login + 3 channels.
DEFAULT_ALLOWED = (
    '213.188.212.103:8484,'
    '213.188.212.103:7575,'
    '213.188.212.103:7576,'
    '213.188.212.103:7577'
)
ALLOWED_TARGETS = {
    t.strip() for t in os.environ.get('ALLOWED_TARGETS', DEFAULT_ALLOWED).split(',') if t.strip()
}

INDEX_HTML = os.path.join(STATIC_ROOT, 'web', 'index.html')


async def handle_root(request: web.Request) -> web.StreamResponse:
    """Serve index.html, or upgrade to WS and bridge to the game server."""
    if request.headers.get('Upgrade', '').lower() == 'websocket':
        return await handle_ws_proxy(request)
    return web.FileResponse(INDEX_HTML)


async def handle_ws_proxy(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse(max_msg_size=50 * 1024 * 1024)
    await ws.prepare(request)
    peer = request.remote or '?'

    # First message = target address "host:port"
    try:
        msg = await ws.receive(timeout=10)
    except asyncio.TimeoutError:
        log.warning('ws %s: handshake timeout', peer)
        await ws.close()
        return ws

    if msg.type != WSMsgType.TEXT:
        log.warning('ws %s: first frame was %s, not text', peer, msg.type)
        await ws.close()
        return ws

    target = msg.data.strip()
    if target not in ALLOWED_TARGETS:
        log.warning('ws %s: target %r rejected (not in allow-list)', peer, target)
        await ws.close()
        return ws

    host, port_str = target.rsplit(':', 1)
    port = int(port_str)
    try:
        reader, writer = await asyncio.open_connection(host, port)
    except Exception as e:
        log.warning('ws %s: dial %s failed: %s', peer, target, e)
        await ws.close()
        return ws

    log.info('ws %s <-> %s opened', peer, target)

    async def pump_ws_to_tcp():
        try:
            async for m in ws:
                if m.type == WSMsgType.BINARY:
                    writer.write(m.data)
                    await writer.drain()
                elif m.type in (WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR):
                    break
        except Exception as e:
            log.debug('ws %s: ws->tcp pump ended: %s', peer, e)
        finally:
            try:
                writer.close()
            except Exception:
                pass

    async def pump_tcp_to_ws():
        try:
            while not ws.closed:
                data = await reader.read(65536)
                if not data:
                    break
                await ws.send_bytes(data)
        except Exception as e:
            log.debug('ws %s: tcp->ws pump ended: %s', peer, e)
        finally:
            if not ws.closed:
                await ws.close()

    await asyncio.gather(pump_ws_to_tcp(), pump_tcp_to_ws(), return_exceptions=True)
    log.info('ws %s <-> %s closed', peer, target)
    return ws


async def healthz(_request: web.Request) -> web.Response:
    return web.Response(text='ok')


def build_app() -> web.Application:
    app = web.Application()
    app.router.add_get('/', handle_root)
    app.router.add_get('/healthz', healthz)
    # Static mounts. Route order matters — these only match if the path starts with /web or /build.
    app.router.add_static('/web/', path=os.path.join(STATIC_ROOT, 'web'), show_index=False)
    app.router.add_static('/build/', path=os.path.join(STATIC_ROOT, 'build'), show_index=False)
    return app


if __name__ == '__main__':
    log.info('starting on :%d, static_root=%s, allowed_targets=%s', PORT, STATIC_ROOT, sorted(ALLOWED_TARGETS))
    web.run_app(build_app(), host='0.0.0.0', port=PORT, print=None)
