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
