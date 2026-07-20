/**
 * Fehlerbehandlung des Backends.
 * AppError traegt einen HTTP-Status; die Express-Middleware uebersetzt ihn in
 * eine { error }-Antwort. So bleibt die Fehlerlogik aus den Routen heraus.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 400 – ungueltige Eingabe. */
export function badRequest(message: string): AppError {
  return new AppError(400, message);
}

/** 401 – nicht angemeldet. */
export function unauthorized(message: string): AppError {
  return new AppError(401, message);
}

/** 403 – angemeldet, aber nicht berechtigt. */
export function forbidden(message: string): AppError {
  return new AppError(403, message);
}

/** 404 – nicht gefunden. */
export function notFound(message: string): AppError {
  return new AppError(404, message);
}

/** 409 – Konflikt (Eindeutigkeit verletzt oder Loeschschutz greift). */
export function conflict(message: string): AppError {
  return new AppError(409, message);
}

/** 429 – zu viele Anfragen (Login-Rate-Limit). */
export function tooManyRequests(message: string): AppError {
  return new AppError(429, message);
}

/** 502 – ein vorgelagerter externer Dienst hat versagt (z. B. Open Food Facts). */
export function badGateway(message: string): AppError {
  return new AppError(502, message);
}

/** Erkennt eine UNIQUE-Verletzung von better-sqlite3. */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
