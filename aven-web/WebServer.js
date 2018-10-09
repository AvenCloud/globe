import express from 'express';
import ReactDOMServer from 'react-dom/server';
import { AppRegistry } from 'react-native';
import startServer from './startServer';
import { IS_DEV } from './config';
// import { handleServerRequest } from '../react-navigation-web';
const yes = require('yes-https');
const helmet = require('helmet');
const http = require('http');
const bodyParser = require('body-parser');
const WebSocket = require('ws');

const pathJoin = require('path').join;

const isProd = process.env.NODE_ENV === 'production';

const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);

export default async function WebServer(App, dispatch, startSocketServer) {
  const expressApp = express();
  const jsonParser = bodyParser.json();
  expressApp.use(jsonParser);
  expressApp.use(yes());
  expressApp.use(helmet());
  expressApp.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    next();
  });
  AppRegistry.registerComponent('App', () => App);

  // const publicDir = isProd ? 'build/public' : `src/${activeApp}/public`;
  const publicDir = isProd ? 'build/public' : `public`;

  expressApp.disable('x-powered-by');
  expressApp.use(express.static(publicDir));
  expressApp.post('/dispatch', (req, res) => {
    if (dispatch) {
      dispatch(req.body)
        .then(result => {
          res.send(result);
        })
        .catch(err => {
          console.error(err);
          res.status(500).send(String(err));
        });
    }
  });
  expressApp.get('/*', (req, res) => {
    const { path, query } = req;

    // const { navigation, title, options } = handleServerRequest(
    //   App.router,
    //   path,
    //   query,
    // );

    const navigation = {};
    const title = 'Coming Soon';
    const options = {};

    const { element, getStyleElement } = AppRegistry.getApplication('App', {
      initialProps: {
        navigation,
        env: 'server',
      },
    });

    const html = ReactDOMServer.renderToString(element);
    const css = ReactDOMServer.renderToStaticMarkup(getStyleElement());

    res.send(
      `<!doctype html>
    <html lang="">
    <head>
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta charSet='utf-8' />
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style id="root-stylesheet">
        html, body, #root {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        ${options.customCSS}
        </style>
        ${css}
        ${
          isProd
            ? `<script src="${assets.client.js}" defer></script>`
            : `<script src="${assets.client.js}" defer crossorigin></script>`
        }
    </head>
    <body>
        <div id="root">${html}</div>
    </body>
</html>`,
    );
  });

  const serverListenLocation =
    process.env.APP_SERVER_PORT || process.env.PORT || 8899;
  const httpServer = http.createServer(expressApp);

  const wss = new WebSocket.Server({ server: httpServer });

  await startServer(httpServer, serverListenLocation);

  const wsServer = await startSocketServer(wss);

  console.log('Listening on ' + serverListenLocation);
  IS_DEV && console.log(`http://localhost:${serverListenLocation}`);

  return {
    close: async () => {
      httpServer.close();
      wsServer.close();
    },
  };
}