import { openWSJsonRPC2 } from '../src/open';
import {
    type WSJsonRPC2CloseCallback,
    type WSJsonRPC2RequestCallback,
    type WSJsonRPC2Notification
} from '../src/types';

// you can close the connection.
// or keep it open and pass the callbacks outside!
// in case you never call close() or the server never closes the connection,
// the promise never resolves.
await openWSJsonRPC2(
    // endpoint:
    new URL('ws://127.0.0.1:6800/jsonrpc'),
    // on notifications:
    async function (
        data: WSJsonRPC2Notification,
        query: WSJsonRPC2RequestCallback,
        close: WSJsonRPC2CloseCallback
    ) {
        console.log('notification=', data);
    },
    // on open:
    async function (
        query: WSJsonRPC2RequestCallback,
        close: WSJsonRPC2CloseCallback
    ) {
        console.log('connected!');

        try {
            console.log(await query('system.listNotifications'));
        } catch (e) {
            // this probably wont fail?
            console.error('query failed=', JSON.stringify(e));
            // this should not have failed!
            close(1006, 'Abnormal Closure');
            return;
        }

        try {
            console.log(
                await query('aria2.tellStopped', 'token:wrong_secret', 0, 2)
            );
        } catch (e) {
            console.error('query failed=', JSON.stringify(e));

            if (e['message'] === 'Unauthorized') {
                // end the connection!
                close(1003, 'Unsupported Data');
                // further calls to "query" callback
                // will fail, since the websocket is closed now
                return;
            }
        }

        close();
    },
    // each request's timeout:
    5000
);

console.log(
`If you see this, the websocket connection ended peacefully, by the client itself!
or if you see an uncaught exception. it's probably because something failed!`
);
