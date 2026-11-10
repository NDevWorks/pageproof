// Thrown when the server is missing a setting. The detail goes to the server log;
// visitors only see a plain "not set up yet" message (see publicError).
export class ConfigError extends Error {}

// Read a required environment variable, failing clearly if it's missing.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigError(
      `Missing environment variable ${name}. Add it to .env.local (local) or the hosting provider's environment settings.`
    );
  }
  return value;
}
