export * as T from './@types/index.ts';
import Express, {
  type Express as ExpressApp,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { colors, MountPath } from './utils.ts';
import { fileStoreRoute } from './route-file-store.ts';
import { musicRoute } from './route-music.ts';
import cors from 'cors';
import * as url from 'url';
import path from 'path';

startServer();

export function startServer(): ExpressApp {
  const app = Express();
  app.set('query parser', 'simple');
  app.use(
    cors({
      exposedHeaders: ['File-Store-Response'],
    }),
  );
  app.use(Express.json());
  app.use(simpleLoggingMiddleware);

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - For some reason this is erroring only when live serving the files.
  const dirname = url.fileURLToPath(new URL('.', import.meta.url));

  const mountPath = new MountPath(
    process.env.MOUNT_PATH ?? path.join(dirname, '../../mount'),
  );
  mountPath.logPath();
  mountPath.validate();

  app.use('/file-store', fileStoreRoute(mountPath));
  app.use('/music', musicRoute(mountPath));
  app.get('/', (_request, response) => {
    response.json({
      routes: ['/file-store', '/music'],
    });
  });

  app.use(handleMissingRoutes);

  const port = process.env.PORT || 6543;
  const host = process.env.HOST || 'localhost';
  const serverUrl = `http://${host}:${port}`;

  app.listen(port);
  console.log('Server started at', serverUrl);
  return app;
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
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  const path = request.body?.path;
  let message = `${colors.FgYellow}[request]${colors.Reset} ${request.method} ${request.originalUrl}`;
  if (path) {
    message += ` ${colors.FgGray}${path}${colors.Reset}`;
  }
  console.log(message);
  next();
}
