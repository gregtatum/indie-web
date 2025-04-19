export * as T from './@types/index.ts';
import Express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { colors } from './utils.ts';
import { setupFsServer } from './fs-server.ts';
import cors from 'cors';

/**
 * A simple logging middleware.
 */
function simpleLoggingMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  console.log(
    `${colors.FgYellow}[request]${colors.Reset} ${req.method} ${req.originalUrl}`,
  );
  next();
}

export function startServer() {
  const app = Express();
  app.set('query parser', 'simple');
  app.use(cors());
  app.use(Express.json());

  app.use(simpleLoggingMiddleware);
  app.use('/fs-server', setupFsServer('/Users/greg/me/indie-web/dist/mount'));
  app.get('/', (_request, response) => {
    response.json({
      routes: ['/fs-server'],
    });
  });

  // Handle all the errors
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).send(err.message || 'Unknown server error');
  });

  const port = process.env.PORT || 6543;
  const host = process.env.host || 'localhost';
  const serverUrl = `http://${host}:${port}`;

  app.listen(port);
  console.log('Server started at', serverUrl);
}

startServer();
