package main

import (
	"testing"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxygrpcv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
	"google.golang.org/protobuf/proto"
)

func BenchmarkMatchFlow_Text_MultiToken(b *testing.B) {
	httpFlow := mitmproxygrpcv1.HTTPFlow_builder{
		Request: mitmproxygrpcv1.Request_builder{
			Url:    proto.String("http://example.com/some/path"),
			Method: proto.String("GET"),
		}.Build(),
		Response: mitmproxygrpcv1.Response_builder{
			StatusCode: proto.Int32(200),
		}.Build(),
		Client: mitmproxygrpcv1.ClientConn_builder{
			Sni: proto.String("example.com"),
		}.Build(),
	}.Build()

	flow := mitmflowv1.Flow_builder{
		HttpFlow: httpFlow,
	}.Build()

	filter := mitmflowv1.FlowFilter_builder{
		FilterText: proto.String("GET 200"),
	}.Build()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		matchFlow(flow, filter)
	}
}

func BenchmarkMatchFlow_Text_SingleToken(b *testing.B) {
	httpFlow := mitmproxygrpcv1.HTTPFlow_builder{
		Request: mitmproxygrpcv1.Request_builder{
			Url:    proto.String("http://example.com/some/path"),
			Method: proto.String("GET"),
		}.Build(),
		Response: mitmproxygrpcv1.Response_builder{
			StatusCode: proto.Int32(200),
		}.Build(),
		Client: mitmproxygrpcv1.ClientConn_builder{
			Sni: proto.String("example.com"),
		}.Build(),
	}.Build()

	flow := mitmflowv1.Flow_builder{
		HttpFlow: httpFlow,
	}.Build()

	filter := mitmflowv1.FlowFilter_builder{
		FilterText: proto.String("GET"),
	}.Build()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		matchFlow(flow, filter)
	}
}

func TestMatchFlow_Text(t *testing.T) {
	httpFlow := mitmproxygrpcv1.HTTPFlow_builder{
		Request: mitmproxygrpcv1.Request_builder{
			Url:    proto.String("http://example.com/some/path"),
			Method: proto.String("GET"),
			Headers: map[string]string{
			    "Content-Type": "application/json",
			    "User-Agent": "Go-http-client",
			},
		}.Build(),
		Response: mitmproxygrpcv1.Response_builder{
			StatusCode: proto.Int32(200),
		}.Build(),
		Client: mitmproxygrpcv1.ClientConn_builder{
			Sni: proto.String("example.com"),
		}.Build(),
	}.Build()

	flow := mitmflowv1.Flow_builder{
		HttpFlow: httpFlow,
	}.Build()

	cases := []struct {
		filter string
		want   bool
	}{
		{"GET", true},
		{"get", true},
		{"200", true},
		{"example", true},
		{"path", true},
		{"json", true}, // Header value
		{"User-Agent", true}, // Header key
		{"GET 200", true}, // Multi token
		{"path GET", true},
		{"http://example.com/some/path GET 200 example.com", true},
		{"POST", false},
		{"404", false},
		{"GET 404", false},
		{"xml", false},
	}

	for _, tc := range cases {
		filter := mitmflowv1.FlowFilter_builder{
			FilterText: proto.String(tc.filter),
		}.Build()
		if got := matchFlow(flow, filter); got != tc.want {
			t.Errorf("matchFlow(..., %q) = %v; want %v", tc.filter, got, tc.want)
		}
	}
}
