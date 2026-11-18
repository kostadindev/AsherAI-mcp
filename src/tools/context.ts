import type { GatewayConfig, Mode } from '../config.js';
import type { Category } from '../detectors.js';
import type { ScanOptions } from '../scan.js';
import type { SessionStore } from '../state.js';

export interface SourceInfo { name: string; restriction: Category | null }

/** What every tool module needs: the configuration, the session log and the mode-specific settings. */
export interface ToolContext {
  config: GatewayConfig;
  store: SessionStore;
  /** Effective mode: the workspace policy file wins over the configured default. */
  mode(): Mode;
  scanOptions(): ScanOptions;
  /** One-line description of the session for the report. */
  describe(): string;
  /** Known metadata for a logged file id, if this mode has any (the scenario does; a real folder doesn't). */
  describeSource(fileId: string): SourceInfo | undefined;
}

interface TextContent { type: 'text'; text: string }
export interface ToolResult { [key: string]: unknown; content: TextContent[]; isError?: boolean }

export const textResult = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
export const jsonResult = (value: unknown): ToolResult => textResult(JSON.stringify(value, null, 2));
export const errorResult = (text: string): ToolResult => ({ ...textResult(text), isError: true });
