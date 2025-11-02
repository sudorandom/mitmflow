import asyncio
from mitmproxy import ctx, http

from datetime import datetime
import mitmflow.v1.mitmflow_pb2 as mitmflow_pb2
import mitmflow.v1.mitmflow_connect as mitmflow_connect

def to_grpc_flow(flow: http.HTTPFlow) -> mitmflow_pb2.HTTPFlow:
    f = mitmflow_pb2.HTTPFlow()
    f.id = str(flow.id)

    # Request
    f.request.method = flow.request.method
    f.request.url = flow.request.url
    f.request.http_version = flow.request.http_version
    for k, v in flow.request.headers.items():
        f.request.headers[k] = v
    if flow.request.content is not None:
        f.request.content = flow.request.content
    if flow.request.trailers:
        for k, v in flow.request.trailers.items():
            f.request.trailers[k] = v

    # Response
    if flow.response:
        f.response.status_code = flow.response.status_code
        f.response.http_version = flow.response.http_version
        for k, v in flow.response.headers.items():
            f.response.headers[k] = v
        if flow.response.content is not None:
            f.response.content = flow.response.content
        if flow.response.trailers:
            for k, v in flow.response.trailers.items():
                f.response.trailers[k] = v

    # Timestamps
    f.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.timestamp_start))
    if flow.response and flow.response.timestamp_end:
        f.duration_ms = (flow.response.timestamp_end - flow.timestamp_start) * 1000

    # Connections
    if flow.client_conn:
        f.client_ip = flow.client_conn.address[0]
    if flow.server_conn and flow.server_conn.address:
        f.server_conn_address = f"{flow.server_conn.address[0]}:{flow.server_conn.address[1]}"

    # Other attributes
    if flow.error:
        f.error = str(flow.error)
    f.live = flow.live
    f.is_websocket = flow.websocket is not None

    return f

class MitmFlowAddon:
    def __init__(self):
        self.flowclient = mitmflow_connect.ServiceClient("http://127.0.0.1:50051")
        self.queue = asyncio.Queue()
        self.export_task = asyncio.create_task(self._export_flows())

    async def _export_flows(self):
        async def flow_generator():
            while True:
                req = await self.queue.get()
                if req is None:
                    break
                yield req

        while True:
            try:
                response = await self.flowclient.export_flow(flow_generator())
                ctx.log.info(f"Export response: {response.message}")
                break # a successful response means the stream is closed
            except Exception as e:
                ctx.log.error(f"Export failed: {e}")
                await asyncio.sleep(5) # wait before retrying

    async def requestheaders(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_REQUESTHEADERS,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def response(self, flow: http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_RESPONSE,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def responseheaders(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_RESPONSEHEADERS,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def error(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_ERROR,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect_upstream(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT_UPSTREAM,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connected(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECTED,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect_error(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT_ERROR,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def dns_request(self, flow: mitmproxy.dns.DNSFlow):
        pass

    async def dns_response(self, flow: mitmproxy.dns.DNSFlow):
        pass

    async def dns_error(self, flow: mitmproxy.dns.DNSFlow):
        pass

    async def tcp_start(self, flow: mitmproxy.tcp.TCPFlow):
        pass

    async def tcp_message(self, flow: mitmproxy.tcp.TCPFlow):
        pass

    async def tcp_end(self, flow: mitmproxy.tcp.TCPFlow):
        pass

    async def tcp_error(self, flow: mitmproxy.tcp.TCPFlow):
        pass

    async def udp_start(self, flow: mitmproxy.udp.UDPFlow):
        pass

    async def udp_message(self, flow: mitmproxy.udp.UDPFlow):
        pass

    async def udp_end(self, flow: mitmproxy.udp.UDPFlow):
        pass

    async def udp_error(self, flow: mitmproxy.udp.UDPFlow):
        pass

    async def quic_start_client(self, data: mitmproxy.proxy.layers.quic._hooks.QuicTlsData):
        pass

    async def quic_start_server(self, data: mitmproxy.proxy.layers.quic._hooks.QuicTlsData):
        pass

    async def tls_clienthello(self, data: mitmproxy.tls.ClientHelloData):
        pass

    async def tls_start_client(self, data: mitmproxy.tls.TlsData):
        pass

    async def tls_start_server(self, data: mitmproxy.tls.TlsData):
        pass

    async def tls_established_client(self, data: mitmproxy.tls.TlsData):
        pass

    async def tls_established_server(self, data: mitmproxy.tls.TlsData):
        pass

    async def tls_failed_client(self, data: mitmproxy.tls.TlsData):
        pass

    async def tls_failed_server(self, data: mitmproxy.tls.TlsData):
        pass

    async def websocket_start(self, flow: mitmproxy.http.HTTPFlow):
        pass

    async def websocket_message(self, flow: mitmproxy.http.HTTPFlow):
        pass

    async def websocket_end(self, flow: mitmproxy.http.HTTPFlow):
        pass

    async def socks5_auth(self, data: mitmproxy.proxy.layers.modes.Socks5AuthData):
        pass


    async def done(self):
        """
        Called when the addon is shutting down.
        """
        await self.queue.put(None)
        await self.export_task
        await self.flowclient.close()

addons = [
    MitmFlowAddon()
]
