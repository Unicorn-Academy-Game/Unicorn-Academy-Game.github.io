/**
 * Where the development server is, for the tools that open the game or the lab in a browser. It is
 * 5173 unless `UA_PORT` says otherwise, so that a second checkout of the game can run its own
 * server next to the first and each tool and test reads its own.
 */
export const PORT = Number(process.env.UA_PORT ?? 5173);
export const ORIGIN = `http://localhost:${PORT}`;
