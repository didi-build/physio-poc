/** Env vars that must not be passed to init or `npm ci --ignore-scripts`. */
export const BOOTSTRAP_TOKEN_ENV_KEYS = ["GH_TOKEN", "BOOTSTRAP_TOKEN", "GITHUB_TOKEN"];

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function envWithoutBootstrapTokens(env) {
  const out = { ...env };
  for (const key of BOOTSTRAP_TOKEN_ENV_KEYS) {
    delete out[key];
  }
  return out;
}

/**
 * Remove GIT_CONFIG_* entries injected by the parent so bootstrap child processes
 * (npm ci, init, commit) do not inherit credential wiring from the outer environment.
 * Push still adds its own GIT_CONFIG in bootstrap-install.mjs.
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function envWithoutInheritedGitConfigKeys(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (
      key === "GIT_CONFIG_COUNT" ||
      key.startsWith("GIT_CONFIG_KEY_") ||
      key.startsWith("GIT_CONFIG_VALUE_")
    ) {
      delete out[key];
    }
  }
  return out;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
export function envExposesBootstrapToken(env) {
  for (const key of BOOTSTRAP_TOKEN_ENV_KEYS) {
    const value = env[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return true;
    }
  }
  return false;
}
