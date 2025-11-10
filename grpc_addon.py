import asyncio
import mitmproxy
from mitmproxy import ctx, http

from datetime import datetime
import mitmflow.v1.mitmflow_pb2 as mitmflow_pb2
import mitmflow.v1.mitmflow_connect as mitmflow_connect
from mitmflow.v1.mitmflow_pb2 import ConnectionState, TransportProtocol, TLSVersion, Cert
from mitmproxy.net.dns import classes
from mitmproxy.net.dns import types

def _to_grpc_client_conn(conn: mitmproxy.connection.Client) -> mitmflow_pb2.ClientConn:
    c = mitmflow_pb2.ClientConn()
    if conn.peername:
        c.peername_host = conn.peername[0]
        c.peername_port = conn.peername[1]
    if conn.sockname:
        c.sockname_host = conn.sockname[0]
        c.sockname_port = conn.sockname[1]
    c.state = ConnectionState.CONNECTION_STATE_OPEN # mitmproxy doesn't expose a direct state mapping
    c.id = str(conn.id)
    # mitmproxy doesn't expose transport protocol directly, assuming TCP for HTTP flows
    c.transport_protocol = TransportProtocol.TRANSPORT_PROTOCOL_TCP
    if conn.error:
        c.error = str(conn.error)
    c.tls = conn.tls_established
    # certificate_list - mitmproxy doesn't expose this directly for client conn
    if conn.alpn:
        c.alpn = conn.alpn
    # alpn_offers - mitmproxy doesn't expose this directly
    if conn.cipher_list:
        c.cipher = ",".join(conn.cipher_list)
    # cipher_list - mitmproxy doesn't expose this directly
    if conn.tls_version:
        # Map mitmproxy TLS version string to protobuf enum
        if conn.tls_version == "TLSv1.3":
            c.tls_version = TLSVersion.TLS_VERSION_TLSV1_3
        elif conn.tls_version == "TLSv1.2":
            c.tls_version = TLSVersion.TLS_VERSION_TLSV1_2
        elif conn.tls_version == "TLSv1.1":
            c.tls_version = TLSVersion.TLS_VERSION_TLSV1_1
        elif conn.tls_version == "TLSv1":
            c.tls_version = TLSVersion.TLS_VERSION_TLSV1
        elif conn.tls_version == "SSLv3":
            c.tls_version = TLSVersion.TLS_VERSION_SSLV3
    if conn.sni:
        c.sni = conn.sni
    if conn.timestamp_start:
        c.timestamp_start.FromDatetime(datetime.fromtimestamp(conn.timestamp_start))
    if conn.timestamp_end:
        c.timestamp_end.FromDatetime(datetime.fromtimestamp(conn.timestamp_end))
    if conn.timestamp_tls_setup:
        c.timestamp_tls_setup.FromDatetime(datetime.fromtimestamp(conn.timestamp_tls_setup))
    # mitmcert - mitmproxy doesn't expose this directly
    c.proxy_mode = str(conn.proxy_mode) if conn.proxy_mode else ""
    return c

def _to_grpc_server_conn(conn: mitmproxy.connection.Server) -> mitmflow_pb2.ServerConn:
    s = mitmflow_pb2.ServerConn()
    if conn.peername:
        s.peername_host = conn.peername[0]
        s.peername_port = conn.peername[1]
    if conn.sockname:
        s.sockname_host = conn.sockname[0]
        s.sockname_port = conn.sockname[1]
    s.state = ConnectionState.CONNECTION_STATE_OPEN # mitmproxy doesn't expose a direct state mapping
    s.id = str(conn.id)
    # mitmproxy doesn't expose transport protocol directly, assuming TCP for HTTP flows
    s.transport_protocol = TransportProtocol.TRANSPORT_PROTOCOL_TCP
    if conn.error:
        s.error = str(conn.error)
    s.tls = conn.tls_established
    # certificate_list - mitmproxy doesn't expose this directly for server conn
    if conn.alpn:
        s.alpn = conn.alpn
    # alpn_offers - mitmproxy doesn't expose this directly
    if conn.cipher_list:
        s.cipher = ",".join(conn.cipher_list)
    # cipher_list - mitmproxy doesn't expose this directly
    if conn.tls_version:
        # Map mitmproxy TLS version string to protobuf enum
        if conn.tls_version == "TLSv1.3":
            s.tls_version = TLSVersion.TLS_VERSION_TLSV1_3
        elif conn.tls_version == "TLSv1.2":
            s.tls_version = TLSVersion.TLS_VERSION_TLSV1_2
        elif conn.tls_version == "TLSv1.1":
            s.tls_version = TLSVersion.TLS_VERSION_TLSV1_1
        elif conn.tls_version == "TLSv1":
            s.tls_version = TLSVersion.TLS_VERSION_TLSV1
        elif conn.tls_version == "SSLv3":
            s.tls_version = TLSVersion.TLS_VERSION_SSLV3
    if conn.sni:
        s.sni = conn.sni
    if conn.timestamp_start:
        s.timestamp_start.FromDatetime(datetime.fromtimestamp(conn.timestamp_start))
    if conn.timestamp_end:
        s.timestamp_end.FromDatetime(datetime.fromtimestamp(conn.timestamp_end))
    if conn.timestamp_tls_setup:
        s.timestamp_tls_setup.FromDatetime(datetime.fromtimestamp(conn.timestamp_tls_setup))
    if conn.address:
        s.address_host = conn.address[0]
        s.address_port = conn.address[1]
    if conn.timestamp_tcp_setup:
        s.timestamp_tcp_setup.FromDatetime(datetime.fromtimestamp(conn.timestamp_tcp_setup))
    # via - mitmproxy doesn't expose this directly
    return s

def to_grpc_flow(flow: http.HTTPFlow) -> mitmflow_pb2.HTTPFlow:
    f = mitmflow_pb2.HTTPFlow()
    f.id = str(flow.id)

    # Request
    f.request.method = flow.request.method
    f.request.url = flow.request.url
    f.request.pretty_url = flow.request.pretty_url
    f.request.http_version = flow.request.http_version
    f.request.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.request.timestamp_start))
    if flow.request.timestamp_end:
        f.request.timestamp_end.FromDatetime(datetime.fromtimestamp(flow.request.timestamp_end))
    for k, v in flow.request.headers.items():
        f.request.headers[k] = v.encode('utf-8', 'replace').decode('utf-8')
    if flow.request.content is not None:
        f.request.content = flow.request.content
    if flow.request.trailers:
        for k, v in flow.request.trailers.items():
            f.request.trailers[k] = v.encode('utf-8', 'replace').decode('utf-8')

    # Response
    if flow.response:
        f.response.status_code = flow.response.status_code
        f.response.reason = flow.response.reason
        f.response.http_version = flow.response.http_version
        f.response.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.response.timestamp_start))
        if flow.response.timestamp_end:
            f.response.timestamp_end.FromDatetime(datetime.fromtimestamp(flow.response.timestamp_end))
        for k, v in flow.response.headers.items():
            f.response.headers[k] = v.encode('utf-8', 'replace').decode('utf-8')
        if flow.response.content is not None:
            f.response.content = flow.response.content
        if flow.response.trailers:
            for k, v in flow.response.trailers.items():
                f.response.trailers[k] = v.encode('utf-8', 'replace').decode('utf-8')

    # Timestamps
    f.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.timestamp_start))
    if flow.response and flow.response.timestamp_end:
        f.duration_ms = (flow.response.timestamp_end - flow.timestamp_start) * 1000

    # Connections
    if flow.client_conn:
        f.client.CopyFrom(_to_grpc_client_conn(flow.client_conn))
    if flow.server_conn:
        f.server.CopyFrom(_to_grpc_server_conn(flow.server_conn))

    # Other attributes
    if flow.error:
        f.error = str(flow.error)
    f.live = flow.live
    f.is_websocket = flow.websocket is not None

    if flow.websocket:
        for message in flow.websocket.messages:
            ws_message = mitmflow_pb2.WebSocketMessage()
            ws_message.content = message.content
            ws_message.timestamp.FromDatetime(datetime.fromtimestamp(message.timestamp))
            ws_message.from_client = message.from_client
            f.websocket_messages.append(ws_message)

    return f

def to_grpc_tcp_flow(flow: mitmproxy.tcp.TCPFlow) -> mitmflow_pb2.TCPFlow:
    f = mitmflow_pb2.TCPFlow()
    f.id = str(flow.id)

    # Connections
    if flow.client_conn:
        f.client.CopyFrom(_to_grpc_client_conn(flow.client_conn))
    if flow.server_conn:
        f.server.CopyFrom(_to_grpc_server_conn(flow.server_conn))

    # Messages
    for message in flow.messages:
        tcp_message = mitmflow_pb2.TCPMessage()
        tcp_message.content = message.content
        tcp_message.timestamp.FromDatetime(datetime.fromtimestamp(message.timestamp))
        tcp_message.from_client = message.from_client
        f.messages.append(tcp_message)

    # Timestamps
    f.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.timestamp_start))
    if hasattr(flow, 'timestamp_end') and flow.timestamp_end:
        f.duration_ms = (flow.timestamp_end - flow.timestamp_start) * 1000

    # Other attributes
    if flow.error:
        f.error = str(flow.error)
    f.live = flow.live

    return f

def to_grpc_udp_flow(flow: mitmproxy.udp.UDPFlow) -> mitmflow_pb2.UDPFlow:
    f = mitmflow_pb2.UDPFlow()
    f.id = str(flow.id)

    # Connections
    if flow.client_conn:
        f.client.CopyFrom(_to_grpc_client_conn(flow.client_conn))
    if flow.server_conn:
        f.server.CopyFrom(_to_grpc_server_conn(flow.server_conn))

    # Messages
    for message in flow.messages:
        udp_message = mitmflow_pb2.UDPMessage()
        udp_message.content = message.content
        udp_message.timestamp.FromDatetime(datetime.fromtimestamp(message.timestamp))
        udp_message.from_client = message.from_client
        f.messages.append(udp_message)

    # Timestamps
    f.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.timestamp_start))
    if hasattr(flow, 'timestamp_end') and flow.timestamp_end:
        f.duration_ms = (flow.timestamp_end - flow.timestamp_start) * 1000

    # Other attributes
    if flow.error:
        f.error = str(flow.error)
    f.live = flow.live

    return f

def _to_grpc_dns_question(q: mitmproxy.dns.Question) -> mitmflow_pb2.DNSQuestion:
    msg = mitmflow_pb2.DNSQuestion(
        name=q.name,
        type=types.to_str(q.type),
    )
    setattr(msg, 'class', classes.to_str(q.class_))
    return msg


def _to_grpc_dns_resource_record(rr: mitmproxy.dns.ResourceRecord) -> mitmflow_pb2.DNSResourceRecord:
    msg = mitmflow_pb2.DNSResourceRecord(
        name=rr.name,
        type=types.to_str(rr.type),
        ttl=rr.ttl,
        data=rr.data,
    )
    setattr(msg, 'class', classes.to_str(rr.class_))
    return msg


def _to_grpc_dns_message(msg: mitmproxy.dns.DNSMessage) -> mitmflow_pb2.DNSMessage:
    return mitmflow_pb2.DNSMessage(
        packed=msg.content,
        questions=[_to_grpc_dns_question(q) for q in msg.questions],
        answers=[_to_grpc_dns_resource_record(rr) for rr in msg.answers],
        authorities=[_to_grpc_dns_resource_record(rr) for rr in msg.authorities],
        additionals=[_to_grpc_dns_resource_record(rr) for rr in msg.additionals],
        id=msg.id,
        query=msg.query,
        op_code=msg.op_code,
        authoritative_answer=msg.authoritative_answer,
    )


def to_grpc_dns_flow(flow: mitmproxy.dns.DNSFlow) -> mitmflow_pb2.DNSFlow:
    f = mitmflow_pb2.DNSFlow()
    f.id = str(flow.id)

    if flow.request:
        f.request.CopyFrom(_to_grpc_dns_message(flow.request))

    if flow.response:
        f.response.CopyFrom(_to_grpc_dns_message(flow.response))

    f.timestamp_start.FromDatetime(datetime.fromtimestamp(flow.timestamp_start))

    if flow.client_conn:
        f.client.CopyFrom(_to_grpc_client_conn(flow.client_conn))
    if flow.server_conn:
        f.server.CopyFrom(_to_grpc_server_conn(flow.server_conn))

    if flow.error:
        f.error = str(flow.error)
    f.live = flow.live

    return f


class MitmFlowAddon:
    def __init__(self):
        self.flowclient = None
        self.queue = asyncio.Queue()
        self.export_task = None
        self.event_types = []
        self.allowed_events = {
            "all", "requestheaders", "response", "responseheaders", "error",
            "http_connect", "http_connect_upstream", "http_connected", "http_connect_error",
            "dns_request", "dns_response", "dns_error",
            "tcp_start", "tcp_message", "tcp_end", "tcp_error",
            "udp_start", "udp_message", "udp_end", "udp_error",
            "websocket_start", "websocket_message", "websocket_end",
        }

    def load(self, loader):
        loader.add_option(
            name="grpc_addr",
            typespec=str,
            default="http://127.0.0.1:50051",
            help="Address of the gRPC server",
        )
        loader.add_option(
            name="grpc_events",
            typespec=str,
            default="all",
            help="Comma-separated list of event types to emit (e.g., request,response)",
        )

    def running(self):
        self.flowclient = mitmflow_connect.ServiceClient(ctx.options.grpc_addr)
        self.export_task = asyncio.create_task(self._export_flows())
        self._update_events()

    def configure(self, updates):
        if "grpc_events" in updates:
            self._update_events()

    def _update_events(self):
        events = ctx.options.grpc_events.split(',')
        valid_events = []
        for event in [e.strip() for e in events]:
            if event in self.allowed_events:
                valid_events.append(event)
            else:
                ctx.log.warn(f"Invalid gRPC event type: {event}")
        self.event_types = valid_events

    def _is_event_enabled(self, event_type: str) -> bool:
        return "all" in self.event_types or event_type in self.event_types

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
        if not self._is_event_enabled("requestheaders"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_REQUESTHEADERS,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def response(self, flow: http.HTTPFlow):
        if not self._is_event_enabled("response"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_RESPONSE,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def responseheaders(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("responseheaders"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_RESPONSEHEADERS,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def error(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("error"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_ERROR,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("http_connect"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect_upstream(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("http_connect_upstream"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT_UPSTREAM,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connected(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("http_connected"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECTED,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def http_connect_error(self, flow: mitmproxy.http.HTTPFlow):
        if not self._is_event_enabled("http_connect_error"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_HTTP_CONNECT_ERROR,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def dns_request(self, flow: mitmproxy.dns.DNSFlow):
        if not self._is_event_enabled("dns_request"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_DNS_REQUEST,
            flow=mitmflow_pb2.Flow(dns_flow=to_grpc_dns_flow(flow)),
        ))
        
    async def dns_response(self, flow: mitmproxy.dns.DNSFlow):
        if not self._is_event_enabled("dns_response"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_DNS_RESPONSE,
            flow=mitmflow_pb2.Flow(dns_flow=to_grpc_dns_flow(flow)),
        ))

    async def dns_error(self, flow: mitmproxy.dns.DNSFlow):
        if not self._is_event_enabled("dns_error"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_DNS_ERROR,
            flow=mitmflow_pb2.Flow(dns_flow=to_grpc_dns_flow(flow)),
        ))

    async def tcp_start(self, flow: mitmproxy.tcp.TCPFlow):
        if not self._is_event_enabled("tcp_start"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_TCP_START,
            flow=mitmflow_pb2.Flow(tcp_flow=to_grpc_tcp_flow(flow)),
        ))

    async def tcp_message(self, flow: mitmproxy.tcp.TCPFlow):
        if not self._is_event_enabled("tcp_message"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_TCP_MESSAGE,
            flow=mitmflow_pb2.Flow(tcp_flow=to_grpc_tcp_flow(flow)),
        ))

    async def tcp_end(self, flow: mitmproxy.tcp.TCPFlow):
        if not self._is_event_enabled("tcp_end"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_TCP_END,
            flow=mitmflow_pb2.Flow(tcp_flow=to_grpc_tcp_flow(flow)),
        ))

    async def tcp_error(self, flow: mitmproxy.tcp.TCPFlow):
        if not self._is_event_enabled("tcp_error"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_TCP_ERROR,
            flow=mitmflow_pb2.Flow(tcp_flow=to_grpc_tcp_flow(flow)),
        ))

    async def udp_start(self, flow: mitmproxy.udp.UDPFlow):
        if not self._is_event_enabled("udp_start"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_UDP_START,
            flow=mitmflow_pb2.Flow(udp_flow=to_grpc_udp_flow(flow)),
        ))

    async def udp_message(self, flow: mitmproxy.udp.UDPFlow):
        if not self._is_event_enabled("udp_message"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_UDP_MESSAGE,
            flow=mitmflow_pb2.Flow(udp_flow=to_grpc_udp_flow(flow)),
        ))

    async def udp_end(self, flow: mitmproxy.udp.UDPFlow):
        if not self._is_event_enabled("udp_end"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_UDP_END,
            flow=mitmflow_pb2.Flow(udp_flow=to_grpc_udp_flow(flow)),
        ))

    async def udp_error(self, flow: mitmproxy.udp.UDPFlow):
        if not self._is_event_enabled("udp_error"):
            return
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_UDP_ERROR,
            flow=mitmflow_pb2.Flow(udp_flow=to_grpc_udp_flow(flow)),
        ))

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
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_WEBSOCKET_START,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def websocket_message(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_WEBSOCKET_MESSAGE,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

    async def websocket_end(self, flow: mitmproxy.http.HTTPFlow):
        await self.queue.put(mitmflow_pb2.ExportFlowRequest(
            event_type=mitmflow_pb2.EVENT_TYPE_WEBSOCKET_END,
            flow=mitmflow_pb2.Flow(http_flow=to_grpc_flow(flow)),
        ))

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
