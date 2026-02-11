package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"

	mitmflowv1 "github.com/sudorandom/mitmflow/gen/go/mitmflow/v1"
	mitmproxyv1 "github.com/sudorandom/mitmflow/gen/go/mitmproxygrpc/v1"
)

// HAR Structures
type HAR struct {
	Log HARLog `json:"log"`
}

type HARLog struct {
	Version string     `json:"version"`
	Creator HARCreator `json:"creator"`
	Pages   []HARPage  `json:"pages"`
	Entries []HAREntry `json:"entries"`
}

type HARCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type HARPage struct {
	ID              string          `json:"id"`
	StartedDateTime string          `json:"startedDateTime"`
	Title           string          `json:"title"`
	PageTimings     HARPageTimings  `json:"pageTimings"`
}

type HARPageTimings struct {
	OnContentLoad float64 `json:"onContentLoad,omitempty"`
	OnLoad        float64 `json:"onLoad,omitempty"`
}

type HAREntry struct {
	Pageref         string      `json:"pageref,omitempty"`
	StartedDateTime string      `json:"startedDateTime"`
	Time            float64     `json:"time"`
	Request         HARRequest  `json:"request"`
	Response        HARResponse `json:"response"`
	Cache           interface{} `json:"cache"`
	Timings         HARTimings  `json:"timings"`
	ServerIPAddress string      `json:"serverIPAddress,omitempty"`
	Connection      string      `json:"connection,omitempty"`
}

type HARRequest struct {
	Method      string             `json:"method"`
	URL         string             `json:"url"`
	HTTPVersion string             `json:"httpVersion"`
	Cookies     []HARCookie        `json:"cookies"`
	Headers     []HARNameValuePair `json:"headers"`
	QueryString []HARNameValuePair `json:"queryString"`
	PostData    *HARPostData       `json:"postData,omitempty"`
	HeadersSize int                `json:"headersSize"`
	BodySize    int                `json:"bodySize"`
}

type HARResponse struct {
	Status      int                `json:"status"`
	StatusText  string             `json:"statusText"`
	HTTPVersion string             `json:"httpVersion"`
	Cookies     []HARCookie        `json:"cookies"`
	Headers     []HARNameValuePair `json:"headers"`
	Content     HARContent         `json:"content"`
	RedirectURL string             `json:"redirectURL"`
	HeadersSize int                `json:"headersSize"`
	BodySize    int                `json:"bodySize"`
}

type HARCookie struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Path     string `json:"path,omitempty"`
	Domain   string `json:"domain,omitempty"`
	Expires  string `json:"expires,omitempty"`
	HttpOnly bool   `json:"httpOnly,omitempty"`
	Secure   bool   `json:"secure,omitempty"`
}

type HARNameValuePair struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type HARPostData struct {
	MimeType string             `json:"mimeType"`
	Params   []HARPostDataParam `json:"params,omitempty"` // For multipart/form-data
	Text     string             `json:"text"`
}

type HARPostDataParam struct {
	Name        string `json:"name"`
	Value       string `json:"value,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

type HARContent struct {
	Size        int    `json:"size"`
	Compression int    `json:"compression,omitempty"`
	MimeType    string `json:"mimeType"`
	Text        string `json:"text,omitempty"`
	Encoding    string `json:"encoding,omitempty"` // "base64" if applicable
}

type HARTimings struct {
	Blocked float64 `json:"blocked,omitempty"`
	DNS     float64 `json:"dns,omitempty"`
	Connect float64 `json:"connect,omitempty"`
	Send    float64 `json:"send"`
	Wait    float64 `json:"wait"`
	Receive float64 `json:"receive"`
	Ssl     float64 `json:"ssl,omitempty"`
}

// GenerateHAR creates a HAR file content from a slice of Flows.
func GenerateHAR(flows []*mitmflowv1.Flow) ([]byte, error) {
	// Find earliest timestamp
	var earliestTime time.Time
	for _, f := range flows {
		httpFlow := f.GetHttpFlow()
		if httpFlow == nil {
			continue
		}

		ts := getFlowTime(httpFlow.GetRequest().GetTimestampStart())
		if !ts.IsZero() {
			if earliestTime.IsZero() || ts.Before(earliestTime) {
				earliestTime = ts
			}
		}
	}

	pageID := "page_0"
	pages := []HARPage{}
	if !earliestTime.IsZero() {
		pages = append(pages, HARPage{
			ID:              pageID,
			StartedDateTime: earliestTime.Format(time.RFC3339Nano),
			Title:           "mitmflow capture",
			PageTimings:     HARPageTimings{},
		})
	}

	entries := []HAREntry{}
	for _, f := range flows {
		httpFlow := f.GetHttpFlow()
		if httpFlow == nil {
			continue
		}
		entry := convertToHAREntry(f, httpFlow, pageID)
		entries = append(entries, entry)
	}

	har := HAR{
		Log: HARLog{
			Version: "1.2",
			Creator: HARCreator{
				Name:    "mitmflow",
				Version: "1.0",
			},
			Pages:   pages,
			Entries: entries,
		},
	}

	return json.MarshalIndent(har, "", "  ")
}

func convertToHAREntry(flow *mitmflowv1.Flow, httpFlow *mitmproxyv1.HTTPFlow, pageRef string) HAREntry {
	req := httpFlow.GetRequest()
	res := httpFlow.GetResponse()

	reqStart := getFlowTime(req.GetTimestampStart())
	reqEnd := getFlowTime(req.GetTimestampEnd())
	resStart := getFlowTime(res.GetTimestampStart())
	resEnd := getFlowTime(res.GetTimestampEnd())

	// Calculate timings
	send := float64(0)
	wait := float64(0)
	receive := float64(0)

	if !reqStart.IsZero() && !reqEnd.IsZero() && reqEnd.After(reqStart) {
		send = float64(reqEnd.Sub(reqStart).Milliseconds())
	}
	if !reqEnd.IsZero() && !resStart.IsZero() && resStart.After(reqEnd) {
		wait = float64(resStart.Sub(reqEnd).Milliseconds())
	}
	if !resStart.IsZero() && !resEnd.IsZero() && resEnd.After(resStart) {
		receive = float64(resEnd.Sub(resStart).Milliseconds())
	}

	totalTime := send + wait + receive
	startedDateTime := time.Now().Format(time.RFC3339Nano)
	if !reqStart.IsZero() {
		startedDateTime = reqStart.Format(time.RFC3339Nano)
	}

	// Request
	harReq := HARRequest{
		Method:      req.GetMethod(),
		URL:         getPrettyURL(req),
		HTTPVersion: req.GetHttpVersion(), // Placeholder, actual version might be needed from packet
		Headers:     convertHeaders(req.GetHeaders()),
		QueryString: parseQueryString(req.GetPrettyUrl()),
		HeadersSize: -1,
		BodySize:    len(req.GetContent()),
	}

	if len(req.GetContent()) > 0 && isBodyMethod(req.GetMethod()) {
		harReq.PostData = &HARPostData{
			MimeType: getHeaderValue(req.GetHeaders(), "Content-Type"),
			Text:     string(req.GetContent()), // TODO: Handle binary content more gracefully if needed? HAR spec says text.
		}
	}

	// Response
	harRes := HARResponse{
		Status:      int(res.GetStatusCode()),
		StatusText:  res.GetReason(), // Or derive from status code
		HTTPVersion: res.GetHttpVersion(),
		Headers:     convertHeaders(res.GetHeaders()),
		HeadersSize: -1,
		BodySize:    len(res.GetContent()),
	}
	
	// Content
	harRes.Content = createHARContent(res.GetContent(), flow.GetHttpFlowExtra())

	serverIP := ""
	if httpFlow.GetServer() != nil {
		serverIP = httpFlow.GetServer().GetAddressHost()
	}
	
	connection := ""
	if httpFlow.GetServer() != nil {
		connection = fmt.Sprintf("%d", httpFlow.GetServer().GetAddressPort())
	}

	return HAREntry{
		Pageref:         pageRef,
		StartedDateTime: startedDateTime,
		Time:            totalTime,
		Request:         harReq,
		Response:        harRes,
		Timings: HARTimings{
			Send:    send,
			Wait:    wait,
			Receive: receive,
		},
		ServerIPAddress: serverIP,
		Connection:      connection,
		Cache:           struct{}{},
	}
}

func createHARContent(content []byte, extra *mitmflowv1.HTTPFlowExtra) HARContent {
	// Defaults
	mimeType := "application/octet-stream"
	if extra != nil && extra.GetResponse() != nil && extra.GetResponse().GetEffectiveContentType() != "" {
		mimeType = extra.GetResponse().GetEffectiveContentType()
	}

	// Check for common text types
	isText := strings.Contains(mimeType, "json") ||
		strings.Contains(mimeType, "xml") ||
		strings.Contains(mimeType, "text") ||
		strings.Contains(mimeType, "javascript") ||
		strings.Contains(mimeType, "html")

	harContent := HARContent{
		Size:     len(content),
		MimeType: mimeType,
	}

	if len(content) == 0 {
		return harContent
	}

	if isText {
		harContent.Text = string(content)
	} else {
		harContent.Text = base64.StdEncoding.EncodeToString(content)
		harContent.Encoding = "base64"
	}

	return harContent
}

func convertHeaders(headers map[string]string) []HARNameValuePair {
	var res []HARNameValuePair
	for k, v := range headers {
		res = append(res, HARNameValuePair{Name: k, Value: v})
	}
	// Sort for stability
	sort.Slice(res, func(i, j int) bool {
		return res[i].Name < res[j].Name
	})
	return res
}

func parseQueryString(u string) []HARNameValuePair {
	var res []HARNameValuePair
	parsedUrl, err := url.Parse(u)
	if err != nil {
		return res
	}
	for k, v := range parsedUrl.Query() {
		for _, val := range v {
			res = append(res, HARNameValuePair{Name: k, Value: val})
		}
	}
	return res
}

func getHeaderValue(headers map[string]string, key string) string {
	for k, v := range headers {
		if strings.EqualFold(k, key) {
			return v
		}
	}
	return ""
}

func isBodyMethod(method string) bool {
	m := strings.ToUpper(method)
	return m == "POST" || m == "PUT" || m == "PATCH" || m == "DELETE"
}

func getPrettyURL(req *mitmproxyv1.Request) string {
	if req.GetPrettyUrl() != "" {
		return req.GetPrettyUrl()
	}
	return req.GetUrl()
}

// Helper to convert protobuf timestamp to time.Time
// Assuming Timestamp has Seconds and Nanos
func getFlowTime(ts interface{ GetSeconds() int64; GetNanos() int32 }) time.Time {
	if ts == nil {
		return time.Time{}
	}
	return time.Unix(ts.GetSeconds(), int64(ts.GetNanos()))
}
