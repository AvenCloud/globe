const WebSocket = require("ws");
const stringify = require("json-stable-stringify");
const bodyParser = require("body-parser");

const parseJSON = bodyParser.json();

function attachStoreServer(httpServer, docStores) {
  const sockets = new Map();
  const socketSubscriptions = new Map();

  function handleSubscribe(clientId, { key, store: storeId }) {
    const store = docStores[storeId];
    if (!store) {
      clientSend(clientId, {
        error: {
          message: "Invalid Store",
          name: "InvalidStore",
          fields: { store },
        },
      });
      return;
    }
    const doc = store.getDoc(key);
    const subscription = doc.listen((docState) => {
      clientSend(clientId, {
        t: "state",
        store: storeId,
        key,
        docId: doc.id,
        ...docState,
      });
    });
    const subscriptions = socketSubscriptions.get(clientId);
    if (!subscriptions) {
      throw new Error(
        "unexpected condition. we are subscribing while the socket is disconnected??"
      );
    }
    const subscriptionId = `${storeId}:${subscription.docId}`;
    subscriptions.set(subscriptionId, subscription);
  }
  function handleUnsubscribe(clientId, { key, store: storeId }) {
    // hmm this docId abstraction is a bit leaky, no?
    const docId = stringify(key);
    const subscriptionId = `${storeId}:${docId}`;
    const subscriptions = socketSubscriptions.get(clientId);
    if (!subscriptions) {
      throw new Error(
        "unexpected condition. we are unsubscribing while the socket is disconnected??"
      );
    }
    const subscription = subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.close();
    }
    subscriptions.delete(subscriptionId);
  }
  function handleMessage(clientId, message) {
    if (message.t === "sub") return handleSubscribe(clientId, message);
    if (message.t === "unsub") return handleUnsubscribe(clientId, message);
  }
  function clientSend(clientId, payload) {
    const socket = sockets.get(clientId);
    if (socket) {
      socket.send(JSON.stringify(payload));
    } else {
      console.error("Cannot send to unknown client " + clientId);
    }
  }
  const wss = new WebSocket.Server({
    server: httpServer,
  });
  let clientIdCount = 0;
  wss.on("connection", (socket) => {
    const clientId = (clientIdCount += 1);

    sockets.set(clientId, socket);
    socketSubscriptions.set(clientId, new Map());

    clientSend(clientId, { t: "hello", clientId, time: Date.now() });

    socket.on("message", (data) => {
      const msg = JSON.parse(data);
      handleMessage(clientId, msg);
    });
    socket.on("close", () => {
      sockets.delete(clientId);
      socketSubscriptions.delete(clientId);
    });
  });

  async function dispatch(payload) {
    const store = docStores[payload.store];
    if (!store) {
      throw new Error("store not found");
    }
    const doc = store.getDoc(payload.key);
    const action = doc.actions[payload.type];
    action(payload.action);
    return {};
  }

  function handleHTTP(url, req, res) {
    if (url.pathname === "/dispatch" && req.method === "POST") {
      parseJSON(req, res, () => {
        dispatch(req.body)
          .then((resp) => {
            res.setHeader("Content-Type", "application/json");
            res.write(JSON.stringify(resp));
            res.end();
          })
          .catch((e) => {
            console.error(e);
            res.statusCode = 500;
            res.write("ServerError");
            res.end();
          });
      });
      return true;
    }
    return false;
  }

  return {
    handleHTTP,
  };
}

module.exports = attachStoreServer;