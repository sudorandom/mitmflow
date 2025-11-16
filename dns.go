package main

import (
	"encoding/json"
	"fmt"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
)

// DnsPacket is a simplified struct for JSON marshaling of DNS data.
type DnsPacket struct {
	Questions   []layers.DNSQuestion       `json:"questions"`
	Answers     []layers.DNSResourceRecord `json:"answers"`
	Authorities []layers.DNSResourceRecord `json:"authorities"`
	Additionals []layers.DNSResourceRecord `json:"additionals"`
}

func parseDnsPacket(content []byte) (string, error) {
	packet := gopacket.NewPacket(content, layers.LayerTypeDNS, gopacket.Default)
	if dnsLayer := packet.Layer(layers.LayerTypeDNS); dnsLayer != nil {
		dns, _ := dnsLayer.(*layers.DNS)
		dnsPacket := DnsPacket{
			Questions:   dns.Questions,
			Answers:     dns.Answers,
			Authorities: dns.Authorities,
			Additionals: dns.Additionals,
		}
		jsonBytes, err := json.MarshalIndent(dnsPacket, "", "  ")
		if err != nil {
			return "", err
		}
		return string(jsonBytes), nil
	}
	return "", fmt.Errorf("not a valid DNS packet")
}
