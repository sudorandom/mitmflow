import { describe, it, expect } from 'vitest';
import { isFlowMatch, FilterConfig } from './filterUtils';
import { Flow } from './gen/mitmflow/v1/mitmflow_pb';

describe('isFlowMatch', () => {
    const emptyFilter: FilterConfig = {
        text: '',
        flowTypes: [],
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
});
