/**
 * dsh-tab-tools — host half.
 *
 * Deliberately empty: every feature of this plugin (the tab strip's 「关闭全部标签」
 * button and the four extra right-click menu entries) lives in the client half,
 * because it only rearranges what the browser already renders. The host half
 * exists so the profile's bundle patch has a row to mount — it injects nothing
 * and registers no route, tool, or service.
 */

/** Cordis plugin name; must match the loader row id in cordis.patch.yml. */
export const name = 'dsh-tab-tools'

/** No host dependencies: nothing here touches the server side. */
export const inject = []

/** Mount nothing. */
export function apply() {}
