/**
 * Small console reporting helpers shared by the task runner modules.
 */

/**
 * @param {string} namespace
 * @param {string} message
 */
export function reportStep(namespace, message) {
  console.info();
  console.info(`${namespace} > ${message}`);
}

/**
 * @param {string} operationName
 */
export function reportSuccess(operationName) {
  console.info();
  console.info(`${operationName} finished with success!`);
}

/**
 * @param {string} operationName
 * @param {error} err
 */
export function reportError(operationName, err) {
  console.info();
  console.error(`${operationName} failed: ${err}`);
}
