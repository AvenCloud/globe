import uuid from "uuid/v1";

const prepareSocketServer = dbService => wss => {
  const socketClosers = {};
  console.log("setting up web socket!");
  wss.on("connection", ws => {
    const sendMessage = message => {
      console.log(ws);
      ws.send(JSON.stringify(message));
    };

    const clientId = uuid();
    console.log("ws connection!", clientId);
    sendMessage({ type: "ClientId", clientId });

    const _refSubscriptions = {};

    const closeSubscription = localRefId => {
      _refSubscriptions[localRefId] &&
        _refSubscriptions[localRefId].unsubscribe();
      delete _refSubscriptions[localRefId];
    };
    const closeSocket = () => {
      Object.keys(_refSubscriptions).forEach(refName => {
        closeSubscription(refName);
      });
      socketClosers[clientId] = null;
    };
    socketClosers[clientId] = closeSocket;
    ws.on("close", () => {
      closeSocket();
    });
    ws.on("error", err => {
      console.error("Websocket Error of Client " + clientId);
      console.error(err);
      closeSocket();
    });
    ws.on("message", async message => {
      const action = { ...JSON.parse(message), clientId };

      switch (action.type) {
        case "SubscribeRefs": {
          action.refs.forEach(refName => {
            _refSubscriptions[`${action.domain}_${refName}`] = dbService
              .observeRef(refName, action.domain)
              .filter(z => !!z)
              .subscribe({
                next: v => {
                  console.log("WOAAH", refName, action.domain);
                  console.log("woah", v);
                  sendMessage({
                    type: "RefUpdate",
                    name: refName,
                    domain: action.domain,
                    ...v
                  });
                },
                error: () => {},
                complete: () => {}
              });
          });
          return;
        }
        case "UnsubscribeRefs": {
          action.refs.forEach(refName => {
            closeSubscription(`${action.domain}_${refName}`);
          });
          return;
        }
        default: {
          throw new Error(`unrecognized msg type "${action.type}"`);
          return;
        }
      }
    });
  });

  return {
    close: () => {
      Object.keys(socketClosers).forEach(
        clientId => socketClosers[clientId] && socketClosers[clientId]()
      );
    }
  };
};

export default prepareSocketServer;
