/**
 * Application version configuration.
 * Single source of truth dynamically importing the version from package.json.
 */
import packageJson from "../package.json";

/**
 * Current version of the Fileditor application.
 */
export const APP_VERSION: string = packageJson.version;
