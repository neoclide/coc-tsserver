import type TypeScriptServiceClient from '../typescriptServiceClient'

/**
 * Ask tsserver to reload all projects without waiting for a response.
 *
 * tsserver never sends a response for the `reloadProjects` request, so waiting
 * for one would leave a pending response forever and block the request queue
 * for all subsequent requests.
 */
export function requestReloadProjects(client: TypeScriptServiceClient): void {
  client.executeWithoutWaitingForResponse('reloadProjects', null)
}
