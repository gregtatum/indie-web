export * as T from './@types/index.ts';
import Express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { colors } from './utils.ts';
import { setupFsServer } from './fs-server.ts';
import cors from 'cors';

startServer();

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

  app.use(handleMissingRoutes);

  const port = process.env.PORT || 6543;
  const host = process.env.host || 'localhost';
  const serverUrl = `http://${host}:${port}`;

  app.listen(port);
  console.log('Server started at', serverUrl);
}

function handleMissingRoutes(req: Request, res: Response) {
  if (res.headersSent) {
    return;
  }
  console.log(
    `${colors.FgRed}[404err ]${colors.Reset} ${req.method} ${req.originalUrl}`,
  );
  res.type('text/plain');
  res
    .status(404)
    .send(`The route does not exist: ${req.method}  ${req.originalUrl}`);
}
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
