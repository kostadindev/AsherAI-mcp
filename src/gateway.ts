/**
 * TrialRun MCP gateway: a data-stewardship monitor and enforcer between any MCP client and files.
 *
 * Scenario mode (no workspace) serves the Fernvale Kitchens assessment desktop with planted markers.
 * Workspace mode serves a real folder; generic detectors flag restricted data the AI reads or repeats,
 * and the owner's .trialrun.json blocks paths. Logs and reports hold labels and redacted snippets only.
 *
 * In the default student role the AI can only read and self-check; it can't change the access policy
 * or reset the log. Those tools exist only for TRIALRUN_ROLE=assessor, or through the policy CLI.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GatewayConfig, Mode } from './config.js';
import { SCENARIO } from './scenario/scenario.js';
import { SessionStore } from './state.js';
import type { ToolContext } from './tools/context.js';
import { registerScenarioTools } from './tools/scenario.js';
import { registerSharedTools } from './tools/shared.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { loadPolicy } from './workspace.js';

export const SERVER_VERSION = '0.2.0';

/** The workspace policy file's mode wins over the configured default. */
export const effectiveMode = (config: GatewayConfig): Mode =>
  (config.workspace ? loadPolicy(config.workspace).mode : undefined) ?? config.mode;

export function createGateway(config: GatewayConfig): McpServer {
  const server = new McpServer({ name: 'trialrun-gateway', version: SERVER_VERSION });
  const { workspace } = config;
  const ctx: ToolContext = {
    config,
    store: new SessionStore(config.statePath),
    mode: () => effectiveMode(config),
    scanOptions: () => ({ terms: workspace ? loadPolicy(workspace).sensitive_terms : [], scenario: !workspace }),
    describe: () => (workspace ? 'Workspace mode.' : `Scenario: ${SCENARIO.client}.`),
  };
  if (workspace) registerWorkspaceTools(server, ctx, workspace);
  else registerScenarioTools(server, ctx);
  registerSharedTools(server, ctx);
  return server;
}
