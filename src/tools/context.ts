import type { GatewayConfig, Mode } from '../config.js';
import type { ScanOptions } from '../scan.js';
import type { SessionStore } from '../state.js';

/** What every tool module needs: the configuration, the session log and the effective settings. */
export interface ToolContext {
  config: GatewayConfig;
  store: SessionStore;
  /** Effective mode: the workspace policy file wins over the configured default. */
  mode(): Mode;
  scanOptions(): ScanOptions;
  /** One-line description of the session for the report. */
  describe(): string;
}

interface TextContent { type: 'text'; text: string }
export interface ToolResult { [key: string]: unknown; content: TextContent[]; isError?: boolean }

export const textResult = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
export const jsonResult = (value: unknown): ToolResult => textResult(JSON.stringify(value, null, 2));
export const errorResult = (text: string): ToolResult => ({ ...textResult(text), isError: true });
