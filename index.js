const http = require('http');
const assert = require('assert');
const { WebSocketServer } = require('ws');
const Client = require('./lib/client');
const Router = require('./lib/ws-router');
const parseurl = require('parseurl');

const handleProtocols = (protocols) => (protocols.has('ws.jambonz.org') ? 'ws.jambonz.org' : false);

const createEndpoint = ({ server, port, logger, middlewares = [] }) => {
  logger = logger || { info: () => {}, error: () => {}, debug: () => {} };
  assert.ok(
    typeof logger.info === 'function' &&
    typeof logger.error === 'function' &&
    typeof logger.debug === 'function',
    'logger must be an object with info, error, and debug methods'
  );

  const router = new Router();
  const wss = new WebSocketServer({ noServer: true, handleProtocols });

  const applyMiddlewares = (req, res, middlewares, callback) => {
    const next = (index) => {
      if (index >= middlewares.length) return callback();
      middlewares[index](req, res, () => next(index + 1));
    };
    next(0);
  };

  /* Middleware to check if a service has been installed for this path */
  const validateRoute = (req, res, next) => {
    const parsed = parseurl(req);
    const client = router.route(req);
    if (!client) {
      logger.debug(`No client found for path: ${parsed.pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    req.client = client;
    next();
  };

  server.on('upgrade', (req, socket, head) => {
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);

    req.locals = req.locals || {};
    req.locals.logger = logger;
    applyMiddlewares(req, res, [...middlewares, validateRoute], () => {
      const parsed = parseurl(req);
      const client = req.client;
      wss.handleUpgrade(req, socket, head, (ws) => {
        client.handle(ws, parsed.pathname);
      });
    });
  });

  if (port) server.listen(port);

  function makeService({ path }) {
    const client = new Client(logger);
    router.use(path, client);
    return client;
  }

  return makeService;
};

module.exports = { createEndpoint };
