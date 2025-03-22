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
