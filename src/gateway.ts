/**
 * TrialRun MCP gateway: a data-stewardship monitor and enforcer between any MCP client and files.
 *
 * Scenario mode (no workspace) serves the Fernvale Kitchens assessment desktop with planted markers.
 * Workspace mode serves a real folder; generic detectors flag restricted data the AI reads or repeats,
 * and the owner's .trialrun.json blocks paths. Monitor mode returns file content unchanged; logs and
 * reports hold labels and redacted snippets only.
 *
 * In the default student role the AI can only read and self-check; it can't change the access policy
 * or reset the log. Those tools exist only for TRIALRUN_ROLE=assessor, or through the policy CLI.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GatewayConfig, Mode } from './config.js';
import { FILES, SCENARIO, displayName, fileRestriction } from './scenario/scenario.js';
import { SessionStore } from './state.js';
import type { SourceInfo, ToolContext } from './tools/context.js';
import { registerScenarioTools } from './tools/scenario.js';
import { registerSharedTools } from './tools/shared.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { readPolicy } from './workspace.js';

export const SERVER_VERSION = '0.2.0';

/** The workspace policy file's mode wins over the configured default; an invalid policy fails closed to enforce. */
export function effectiveMode(config: GatewayConfig): Mode {
  if (!config.workspace) return config.mode;
  const policy = readPolicy(config.workspace);
  return policy.ok ? policy.policy.mode ?? config.mode : 'enforce';
}

function scenarioSource(fileId: string): SourceInfo | undefined {
  const file = FILES.find((f) => f.id === fileId);
  return file ? { name: displayName(file), restriction: fileRestriction(file) } : undefined;
}

export function createGateway(config: GatewayConfig): McpServer {
  const server = new McpServer({ name: 'trialrun-gateway', version: SERVER_VERSION });
  const { workspace } = config;
  const ctx: ToolContext = {
    config,
    store: new SessionStore(config.statePath),
    mode: () => effectiveMode(config),
    scanOptions: () => {
      if (!workspace) return { terms: [], scenario: true };
      const policy = readPolicy(workspace);
      return { terms: policy.ok ? policy.policy.sensitive_terms : [], scenario: false };
    },
    describe: () => (workspace ? 'Workspace mode.' : `Scenario: ${SCENARIO.client}.`),
    // Workspace paths are the user's own names; they must never resolve against the scenario's files.
    describeSource: workspace ? () => undefined : scenarioSource,
  };
  if (workspace) registerWorkspaceTools(server, ctx, workspace);
  else registerScenarioTools(server, ctx);
  registerSharedTools(server, ctx);
  return server;
}
