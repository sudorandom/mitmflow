import { describe, it, expect } from 'vitest';
import { isFlowMatch, FilterConfig } from './filterUtils';
import { Flow } from './gen/mitmflow/v1/mitmflow_pb';

describe('isFlowMatch', () => {
    const emptyFilter: FilterConfig = {
        text: '',
        pinnedOnly: false,
        hasNote: false,
        flowTypes: [],
        clientIps: [],
        http: { methods: [], contentTypes: [], statusCodes: [] }
    };

    it('matches HTTP flow by text in request body', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'POST',
                        url: 'http://example.com',
                        content: new TextEncoder().encode('some secret data'),
                    },
                    response: {}
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            text: 'secret'
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });

    it('matches HTTP flow by text in response body', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {},
                    response: {
                        statusCode: 200,
                        content: new TextEncoder().encode('response with hidden value'),
                    }
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            text: 'hidden'
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });

    it('matches HTTP flow by URL', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'GET',
                        url: 'http://foo.bar/baz',
                    },
                    response: {}
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            text: 'foo.bar'
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });

    it('respects method filter', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {
                        method: 'POST',
                    },
                    response: {}
                }
            }
        } as unknown as Flow;

        expect(isFlowMatch(flow, { ...emptyFilter, http: { ...emptyFilter.http, methods: ['GET'] } })).toBe(false);
        expect(isFlowMatch(flow, { ...emptyFilter, http: { ...emptyFilter.http, methods: ['POST'] } })).toBe(true);
    });

    it('matches HTTP flow by textual frames', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {},
                    response: {}
                }
            },
            httpFlowExtra: {
                request: {
                    textualFrames: ['found in frame']
                }
            }
        } as unknown as Flow;

        expect(isFlowMatch(flow, { ...emptyFilter, text: 'frame' })).toBe(true);
    });

    it('matches HTTP flow by websocket messages', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    request: {},
                    response: {},
                    websocketMessages: [
                        { content: new TextEncoder().encode('websocket data') }
                    ]
                }
            }
        } as unknown as Flow;

        expect(isFlowMatch(flow, { ...emptyFilter, text: 'websocket' })).toBe(true);
    });

    it('respects pinned filter', () => {
        const pinnedFlow = {
            flow: { case: 'httpFlow', value: {} },
            pinned: true
        } as unknown as Flow;

        const unpinnedFlow = {
            flow: { case: 'httpFlow', value: {} },
            pinned: false
        } as unknown as Flow;

        const filter: FilterConfig = { ...emptyFilter, pinnedOnly: true };

        expect(isFlowMatch(pinnedFlow, filter)).toBe(true);
        expect(isFlowMatch(unpinnedFlow, filter)).toBe(false);
    });

    it('matches flow with specific client IP', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    client: {
                        peernameHost: '192.168.1.1'
                    }
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            clientIps: ['192.168.1.1']
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });

    it('does not match flow with different client IP', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    client: {
                        peernameHost: '192.168.1.2'
                    }
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            clientIps: ['192.168.1.1']
        };

        expect(isFlowMatch(flow, filter)).toBe(false);
    });

    it('matches flow with one of multiple client IPs', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    client: {
                        peernameHost: '192.168.1.1'
                    }
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            clientIps: ['192.168.1.2', '192.168.1.1']
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });

    it('ignores client IP filter if list is empty', () => {
        const flow = {
            flow: {
                case: 'httpFlow',
                value: {
                    id: '1',
                    client: {
                        peernameHost: '192.168.1.1'
                    }
                }
            }
        } as unknown as Flow;

        const filter: FilterConfig = {
            ...emptyFilter,
            clientIps: []
        };

        expect(isFlowMatch(flow, filter)).toBe(true);
    });
});
