package main

import (
	"strconv"
	"strings"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxygrpcv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
)

func matchFlow(flow *mitmflowv1.Flow, filter *mitmflowv1.FlowFilter) bool {
	if filter.HasPinned() {
		if filter.GetPinned() != flow.GetPinned() {
			return false
		}
	}
	if filter.HasHasNote() {
		if filter.GetHasNote() != (flow.GetNote() != "") {
			return false
		}
	}

	// Client IP Filter
	if !matchClientIP(flow, filter) {
		return false
	}

	// Flow Type Filter
	if !matchFlowType(flow, filter) {
		return false
	}

	// Text Filter
	if filterText := strings.ToLower(filter.GetFilterText()); filterText != "" {
		if !matchText(flow, filterText) {
			return false
		}
	}

	// Specific Flow Filters
	// Dispatch based on flow type
	switch flow.WhichFlow() {
	case mitmflowv1.Flow_HttpFlow_case:
		if f := flow.GetHttpFlow(); f != nil {
			if !matchHttpFlow(flow, f, filter) {
				return false
			}
		}
	case mitmflowv1.Flow_TcpFlow_case:
		if f := flow.GetTcpFlow(); f != nil {
			if !matchTcpFlow(flow, f, filter) {
				return false
			}
		}
	case mitmflowv1.Flow_UdpFlow_case:
		if f := flow.GetUdpFlow(); f != nil {
			if !matchUdpFlow(flow, f, filter) {
				return false
			}
		}
	case mitmflowv1.Flow_DnsFlow_case:
		if f := flow.GetDnsFlow(); f != nil {
			if !matchDnsFlow(flow, f, filter) {
				return false
			}
		}
	}

	return true
}

func matchClientIP(flow *mitmflowv1.Flow, filter *mitmflowv1.FlowFilter) bool {
	if len(filter.GetClientIps()) == 0 {
		return true
	}

	var clientIp string
	if f := flow.GetHttpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
	} else if f := flow.GetTcpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
	} else if f := flow.GetUdpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
	} else if f := flow.GetDnsFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
	}

	for _, ip := range filter.GetClientIps() {
		if ip == clientIp {
			return true
		}
	}
	return false
}

func matchFlowType(flow *mitmflowv1.Flow, filter *mitmflowv1.FlowFilter) bool {
	if len(filter.GetFlowTypes()) == 0 {
		return true
	}

	var flowType string
	isDnsMessage := false

	if f := flow.GetHttpFlow(); f != nil {
		reqCt := flow.GetHttpFlowExtra().GetRequest().GetEffectiveContentType()
		resCt := flow.GetHttpFlowExtra().GetResponse().GetEffectiveContentType()
		if reqCt == "application/dns-message" || resCt == "application/dns-message" {
			isDnsMessage = true
		}
		flowType = "http"
	} else if flow.GetTcpFlow() != nil {
		flowType = "tcp"
	} else if flow.GetUdpFlow() != nil {
		flowType = "udp"
	} else if flow.GetDnsFlow() != nil {
		flowType = "dns"
	}

	if isDnsMessage {
		flowType = "dns"
	}

	for _, t := range filter.GetFlowTypes() {
		if t == flowType {
			return true
		}
	}
	return false
}

func matchText(flow *mitmflowv1.Flow, filterText string) bool {
	var clientIp, serverIp string
	var note string = flow.GetNote()

	// 1. Common Metadata Check (Note, IP)
	if f := flow.GetHttpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
		serverIp = f.GetServer().GetAddressHost()
	} else if f := flow.GetTcpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
		serverIp = f.GetServer().GetAddressHost()
	} else if f := flow.GetUdpFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
		serverIp = f.GetServer().GetAddressHost()
	} else if f := flow.GetDnsFlow(); f != nil {
		clientIp = f.GetClient().GetPeernameHost()
		serverIp = f.GetServer().GetAddressHost()
	}

	if containsFold(clientIp, filterText) ||
		containsFold(serverIp, filterText) ||
		containsFold(note, filterText) {
		return true
	}

	// 2. Flow Specific Text Check
	if f := flow.GetHttpFlow(); f != nil {
		return matchHttpFlowText(flow, f, filterText)
	} else if f := flow.GetDnsFlow(); f != nil {
		return matchDnsFlowText(f, filterText)
	} else if f := flow.GetTcpFlow(); f != nil {
		return matchTcpFlowText(f, filterText)
	} else if f := flow.GetUdpFlow(); f != nil {
		return matchUdpFlowText(f, filterText)
	}

	return false
}

func matchHttpFlowText(flow *mitmflowv1.Flow, f *mitmproxygrpcv1.HTTPFlow, filterText string) bool {
	url := f.GetRequest().GetPrettyUrl()
	if url == "" {
		url = f.GetRequest().GetUrl()
	}
	method := f.GetRequest().GetMethod()
	statusCode := f.GetResponse().GetStatusCode()
	sni := f.GetClient().GetSni()

	// Optimized matching:
	// If filterText has no spaces, we can check fields individually.
	// This avoids string concatenation and allocation.
	if !strings.Contains(filterText, " ") {
		if containsFold(url, filterText) {
			return true
		}
		if containsFold(method, filterText) {
			return true
		}
		// Check status code
		if containsFold(strconv.Itoa(int(statusCode)), filterText) {
			return true
		}
		if containsFold(sni, filterText) {
			return true
		}
	} else {
		// Fallback for multi-token search (e.g. "GET 200")
		// Use strings.Builder to minimize allocations
		var b strings.Builder
		b.Grow(len(url) + len(method) + 10 + len(sni) + 3)
		b.WriteString(url)
		b.WriteByte(' ')
		b.WriteString(method)
		b.WriteByte(' ')
		b.WriteString(strconv.Itoa(int(statusCode)))
		b.WriteByte(' ')
		b.WriteString(sni)

		if containsFold(b.String(), filterText) {
			return true
		}
	}

	// Header check
	if matchHeaders(f.GetRequest().GetHeaders(), filterText) {
		return true
	}
	if matchHeaders(f.GetResponse().GetHeaders(), filterText) {
		return true
	}

	// Body check
	// Check textual frames
	if hasText(flow.GetHttpFlowExtra().GetRequest().GetTextualFrames(), filterText) {
		return true
	} else if hasText(flow.GetHttpFlowExtra().GetResponse().GetTextualFrames(), filterText) {
		return true
	} else {
		// Content check
		// Simple check on raw bytes as string
		if containsFold(string(f.GetRequest().GetContent()), filterText) {
			return true
		} else if containsFold(string(f.GetResponse().GetContent()), filterText) {
			return true
		}
		// Websocket messages
		for _, msg := range f.GetWebsocketMessages() {
			if containsFold(string(msg.GetContent()), filterText) {
				return true
			}
		}
	}
	return false
}

func matchHeaders(headers map[string]string, filterText string) bool {
	for k, v := range headers {
		if containsFold(k, filterText) {
			return true
		}
		if containsFold(v, filterText) {
			return true
		}
	}
	return false
}

func matchDnsFlowText(f *mitmproxygrpcv1.DNSFlow, filterText string) bool {
	if len(f.GetRequest().GetQuestions()) > 0 {
		name := f.GetRequest().GetQuestions()[0].GetName()
		if containsFold(name, filterText) {
			return true
		}
	}
	return false
}

func matchTcpFlowText(f *mitmproxygrpcv1.TCPFlow, filterText string) bool {
	server := f.GetServer()
	host := server.GetAddressHost()
	port := int(server.GetAddressPort())

	if !strings.Contains(filterText, ":") {
		if containsFold(host, filterText) {
			return true
		}
		if containsFold(strconv.Itoa(port), filterText) {
			return true
		}
	} else {
		var b strings.Builder
		b.Grow(len(host) + 10)
		b.WriteString(host)
		b.WriteByte(':')
		b.WriteString(strconv.Itoa(port))
		if containsFold(b.String(), filterText) {
			return true
		}
	}
	return false
}

func matchUdpFlowText(f *mitmproxygrpcv1.UDPFlow, filterText string) bool {
	server := f.GetServer()
	host := server.GetAddressHost()
	port := int(server.GetAddressPort())

	if !strings.Contains(filterText, ":") {
		if containsFold(host, filterText) {
			return true
		}
		if containsFold(strconv.Itoa(port), filterText) {
			return true
		}
	} else {
		var b strings.Builder
		b.Grow(len(host) + 10)
		b.WriteString(host)
		b.WriteByte(':')
		b.WriteString(strconv.Itoa(port))
		if containsFold(b.String(), filterText) {
			return true
		}
	}
	return false
}

func matchHttpFlow(flow *mitmflowv1.Flow, f *mitmproxygrpcv1.HTTPFlow, filter *mitmflowv1.FlowFilter) bool {
	if filter.GetHttp() == nil {
		return true
	}
	httpFilter := filter.GetHttp()

	// Method
	if len(httpFilter.GetMethods()) > 0 {
		found := false
		method := f.GetRequest().GetMethod()
		for _, m := range httpFilter.GetMethods() {
			if m == method {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Status Codes
	if len(httpFilter.GetStatusCodes()) > 0 {
		statusCode := int(f.GetResponse().GetStatusCode())
		found := false
		for _, sc := range httpFilter.GetStatusCodes() {
			if strings.HasSuffix(sc, "xx") {
				prefix := sc[:1]
				if strings.HasPrefix(strconv.Itoa(statusCode), prefix) {
					found = true
					break
				}
			} else if strings.Contains(sc, "-") {
				parts := strings.Split(sc, "-")
				if len(parts) == 2 {
					start, _ := strconv.Atoi(parts[0])
					end, _ := strconv.Atoi(parts[1])
					if statusCode >= start && statusCode <= end {
						found = true
						break
					}
				}
			} else {
				code, _ := strconv.Atoi(sc)
				if statusCode == code {
					found = true
					break
				}
			}
		}
		if !found {
			return false
		}
	}

	// Content Types
	if len(httpFilter.GetContentTypes()) > 0 {
		reqCt := flow.GetHttpFlowExtra().GetRequest().GetEffectiveContentType()
		resCt := flow.GetHttpFlowExtra().GetResponse().GetEffectiveContentType()
		found := false
		for _, ct := range httpFilter.GetContentTypes() {
			if strings.Contains(reqCt, ct) || strings.Contains(resCt, ct) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	return true
}

func matchTcpFlow(flow *mitmflowv1.Flow, f *mitmproxygrpcv1.TCPFlow, filter *mitmflowv1.FlowFilter) bool {
	// Add TCP specific filtering if needed
	return true
}

func matchUdpFlow(flow *mitmflowv1.Flow, f *mitmproxygrpcv1.UDPFlow, filter *mitmflowv1.FlowFilter) bool {
	// Add UDP specific filtering if needed
	return true
}

func matchDnsFlow(flow *mitmflowv1.Flow, f *mitmproxygrpcv1.DNSFlow, filter *mitmflowv1.FlowFilter) bool {
	// Add DNS specific filtering if needed
	return true
}

func hasText(list []string, sub string) bool {
	for _, s := range list {
		if containsFold(s, sub) {
			return true
		}
	}
	return false
}

func containsFold(s, substr string) bool {
	n := len(s)
	m := len(substr)
	if m == 0 {
		return true
	}
	if m > n {
		return false
	}
	for i := 0; i <= n-m; i++ {
		if strings.EqualFold(s[i:i+m], substr) {
			return true
		}
	}
	return false
}
