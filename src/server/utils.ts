import Express from 'express';

export const colors = {
  Reset: '\x1b[0m',
  Bright: '\x1b[1m',
  Dim: '\x1b[2m',
  Underscore: '\x1b[4m',
  Blink: '\x1b[5m',
  Reverse: '\x1b[7m',
  Hidden: '\x1b[8m',

  FgBlack: '\x1b[30m',
  FgRed: '\x1b[31m',
  FgGreen: '\x1b[32m',
  FgYellow: '\x1b[33m',
  FgBlue: '\x1b[34m',
  FgMagenta: '\x1b[35m',
  FgCyan: '\x1b[36m',
  FgWhite: '\x1b[37m',
  FgGray: '\x1b[38;5;245m',

  BgBlack: '\x1b[40m',
  BgRed: '\x1b[41m',
  BgGreen: '\x1b[42m',
  BgYellow: '\x1b[43m',
  BgBlue: '\x1b[44m',
  BgMagenta: '\x1b[45m',
  BgCyan: '\x1b[46m',
  BgWhite: '\x1b[47m',
};

/**
 * A route handler returns structured data. If there is an error in the process, the
 * appropriate error type is thrown, which is sent with the proper status code. If
 * an unknown error is thrown, it is surfaced as a server error.
 */
type RouteHandler<T> = (
  request: Express.Request,
  response: Express.Response,
) => Promise<T>;

export class ApiRoute {
  router: Express.Router;

  /**
   * The list of route names.
   */
  routes: Array<string | RegExp> = [];

  /**
   * Define a route for a GET request.
   */
  get = this.#define.bind(this, 'GET');
  /**
   * Define a route for a HEAD request.
   */
  head = this.#define.bind(this, 'HEAD');
  /**
   * Define a route for a OPTIONS request.
   */
  options = this.#define.bind(this, 'OPTIONS');
  /**
   * Define a route for a TRACE request.
   */
  trace = this.#define.bind(this, 'TRACE');
  /**
   * Define a route for a PUT request.
   */
  put = this.#define.bind(this, 'PUT');
  /**
   * Define a route for a DELETE request.
   */
  delete = this.#define.bind(this, 'DELETE');
  /**
   * Define a route for a POST request.
   */
  post = this.#define.bind(this, 'POST');
  /**
   * Define a route for a PATCH request.
   */
  patch = this.#define.bind(this, 'PATCH');
  /**
   * Define a route for a CONNECT request.
   */
  connect = this.#define.bind(this, 'CONNECT');

  constructor() {
    this.router = Express.Router();
  }

  /**
   * Defines an API route.
   */
  #define<T>(
    method: string,
    path: string | RegExp,
    fn: RouteHandler<T>,
  ): RouteHandler<T> {
    this.routes.push(path);
    this.router.all(
      path,
      async (
        req: Express.Request,
        res: Express.Response,
        next: Express.NextFunction,
      ) => {
        if (req.method !== method) {
          if (req.method === 'OPTIONS') {
            // Sometimes the browser will ask if this command is available before
            // performing. This is the CORS pre-flight check.
            res.header(
              'Access-Control-Allow-Methods',
              'POST, GET, OPTIONS, DELETE',
            );
            res.send();
            return;
          }
          next();
          return;
        }
        try {
          const result = await fn(
            req as Express.Request,
            res as Express.Response,
          );
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `${colors.FgGreen}[200ok  ]${colors.Reset} ${formatResponse(
                result,
              )}`,
            );
          }
          res.json(result);
        } catch (error) {
          if (error instanceof RouteError) {
            res.type('text/plain').status(error.status).send(error.message);
            console.log(
              `${colors.FgMagenta}[400err ]${colors.Reset} "${error.message}"`,
            );
          } else {
            // When there is an internal error, don't surface the error message to the end
            // user, as it could contain sensitive information.
            console.log(`${colors.FgMagenta}[500err ]${colors.Reset}`, path);
            console.error(error);
            res
              .type('text/plain')
              .status(500)
              .send(
                'Uh oh, looks like the server couldn’t figure out your request.',
              );
          }
        }
        next();
      },
    );
    return fn;
  }

  /**
   * Add a route that doesn't return JSON.
   */
  addBlobRoute(
    method: string,
    path: string | RegExp,
    fn: RouteHandler<void>,
  ): RouteHandler<void> {
    this.routes.push(path);
    this.router.all(
      path,
      async (
        req: Express.Request,
        res: Express.Response,
        next: Express.NextFunction,
      ) => {
        if (req.method !== method) {
          if (req.method === 'OPTIONS') {
            // Sometimes the browser will ask if this command is available before
            // performing. This is the CORS pre-flight check.
            res.header(
              'Access-Control-Allow-Methods',
              'POST, GET, OPTIONS, DELETE',
            );
            res.send();
            return;
          }
          next();
          return;
        }
        try {
          await fn(req as Express.Request, res as Express.Response);
          if (process.env.NODE_ENV === 'development') {
            console.log(`${colors.FgGreen}[200ok  ]${colors.Reset} blog}`);
          }
        } catch (error) {
          if (error instanceof RouteError) {
            res.type('text/plain').status(error.status).send(error.message);
            console.log(
              `${colors.FgMagenta}[400err ]${colors.Reset} "${error.message}"`,
            );
          } else {
            // When there is an internal error, don't surface the error message to the end
            // user, as it could contain sensitive information.
            console.log(`${colors.FgMagenta}[500err ]${colors.Reset}`, path);
            console.error(error);
            res
              .type('text/plain')
              .status(500)
              .send(
                'Uh oh, looks like the server couldn’t figure out your request.',
              );
          }
        }
        next();
      },
    );
    return fn;
  }
}

/**
 * Format responses for nice log displays, optimizing for single lines.
 */
function formatResponse(response: unknown): string {
  // Most likely we're dealing with objects, but if not still format it nicely.
  if (!response || typeof response !== 'object') {
    return formatResponsePart(response);
  }

  // Build up a nice shallow representation of the object sent.
  let string = '{ ';
  for (const key in response) {
    if (Object.prototype.hasOwnProperty.call(response, key)) {
      // @ts-expect-error - Not sure how to fix this.
      const value: unknown = response[key];
      string += `${key}: ${formatResponsePart(value)}, `;
    }
  }
  if (string.length > 2) {
    // Strip off the last comma.
    string = string.substring(0, string.length - 2);
  }
  return string + ' }';
}

function formatResponsePart(value: unknown): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  } else if (value === null) {
    return 'null';
  } else if (value === undefined) {
    return 'undefined';
  } else if (typeof value === 'object') {
    return '{...}';
  } else if (typeof value === 'number') {
    return 'number';
  } else if (typeof value === 'string') {
    return '"..."';
  } else if (typeof value === 'boolean') {
    return value.toString();
  }
  return 'unknown';
}

export class RouteError extends Error {
  status = 500;
}

export class ServerError extends RouteError {
  status = 500;
}

export class ClientError extends RouteError {
  status = 400;
}

export class NotFoundError extends RouteError {
  status = 404;
}

export class NotAuthorizedError extends RouteError {
  status = 401;
}

/**
 * Used for when a file or folder is not found. It's not a 404 since the route is
 * correct, but the client should request a different file.
 */
export class RequestConflict extends RouteError {
  status = 409;
}
