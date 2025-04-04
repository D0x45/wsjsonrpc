export interface WSJsonRPC2Request<K extends string | number> {
    jsonrpc: "2.0";
    method: string;
    params: any[] | Record<string, any>;
    id: K;
};

export type WSJsonRPC2Notification = Omit<WSJsonRPC2Request<string>, 'id'>;

export interface WSJsonRPC2OKResponse<K extends string | number, V = any> {
    jsonrpc: "2.0";
    result: V;
    id: K;
};

export interface WSJsonRPC2ErrDetails<E = any> {
    code: number;
    message: string;
    data?: E;
};

export interface WSJsonRPC2ErrResponse<K extends string | number, E = any> {
    jsonrpc: "2.0";
    error: WSJsonRPC2ErrDetails<E>;
    id: K;
};

export type WSJsonRPC2Response<K extends string | number, E = any, V = any> =
    | WSJsonRPC2OKResponse<K, V>
    | WSJsonRPC2ErrResponse<K, E>
    | WSJsonRPC2Notification;

export type WSJsonRPC2RequestCallback =
    (method: string, ...params: any[]) => any | Promise<any>;

export type WSJsonRPC2CloseCallback =
    (code?: number, reason?: string) => void;

/**
 * @see http://xmlrpc-epi.sourceforge.net/specs/rfc.fault_codes.php
 * @see https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code#value
 */
export async function openWSJsonRPC2<V = any, E = any>(
    endpoint: URL,
    onNotification: (data: WSJsonRPC2Notification, query: WSJsonRPC2RequestCallback, close: WSJsonRPC2CloseCallback) => void | Promise<void>,
    onOpen: (query: WSJsonRPC2RequestCallback, close: WSJsonRPC2CloseCallback) => void | Promise<void>,
    requestTimeout = 10000,
): Promise<undefined> {
    if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:')
        throw new Error('You must specify ws:// or wss:// protocol.');

    const ws = new WebSocket(endpoint.toString());
    const queries: Record<string, {
        reject: (reason?: WSJsonRPC2ErrDetails<E>) => void,
        resolve: (value: V) => void,
        timer: Timer // timeout timer
    }> = {};

    if (requestTimeout < 100)
        requestTimeout = 100;

    const queryFn: WSJsonRPC2RequestCallback = async (method: string, ...params: any[]) => {
        const qid = `${method}~` + (Date.now()).toString(16);

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                jsonrpc: '2.0', method, id: qid,
                params: params
            }));
        }

        return await new Promise<any>((resolve, reject) => {
            // just in case the callback gets passed outside the context
            // after being peacefully close()ed,
            // and some poor function tries to send a query!
            if (ws.readyState !== WebSocket.OPEN) {
                reject({
                    code: -32603 /* Internal error */,
                    message: 'Closed connection. Trying to write to a closed socket.'
                });
                return;
            }

            queries[qid] = {
                reject, resolve,
                timer: setTimeout(() => {
                    reject({
                        // http://xmlrpc-epi.sourceforge.net/specs/rfc.fault_codes.php
                        code: -32603 /* Internal error */,
                        message: `Timeout exceeded. No reply received in the specified duration.`
                    });
                    delete queries[qid];
                }, requestTimeout)
            };
        });
    };

    const discardRemainingQueries = () => {
        for (const qid of Object.keys(queries)) {
            const query = queries[qid]!;
            clearTimeout(query.timer);
            query.reject({
                code: -32603 /* Internal error */,
                message: `Reply discarded. Not waiting for a reply anymore.`,
            });
        }
    };

    const closeFn: WSJsonRPC2CloseCallback = (code?: number, reason?: string) => {
        discardRemainingQueries();
        ws.close(code || 1000, code ? reason : 'Normal Closure');
    };

    ws.onmessage = (e: MessageEvent) => {
        let reply: WSJsonRPC2Response<string>;

        try {
            // i don't think this ever happens,
            // but just in case!
            reply = JSON.parse(e.data);
        } catch (e) {
            discardRemainingQueries();
            ws.close(1011 /* Internal Error */, 'Internal Error')
            return;
        }

        const rid: string | undefined = reply['id'];
        const query = rid ? queries[rid]! : undefined;

        if (!rid || query == undefined) {
            onNotification(reply as WSJsonRPC2Notification, queryFn, closeFn);
        } else {
            if ('result' in reply) {
                query.resolve(reply.result)
            } else {
                query.reject((reply as WSJsonRPC2ErrResponse<string>).error);
            }
            clearTimeout(query.timer);
            delete queries[rid];
        }
    };

    return await new Promise<undefined>((resolve, reject) => {
        ws.onopen = (e_: Event) => {
            if (onOpen !== undefined) {
                onOpen(queryFn, closeFn);
            }
        };

        ws.onclose = (e: CloseEvent) => {
            discardRemainingQueries();
            // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code#value
            if (e.code === 1000) resolve(undefined);
            else reject(`${e.code} ${e.reason}`);
        };
    });
}
