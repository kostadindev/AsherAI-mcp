import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GatewayConfig } from '../src/config.js';
import { createGateway } from '../src/gateway.js';

export const tempDir = (prefix = 'trialrun-') => mkdtempSync(join(tmpdir(), prefix));

/** The first element, failing the test clearly if there is none. */
export function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

export function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return { role: 'student', workspace: null, statePath: join(tempDir(), 'session.json'), mode: 'monitor', ...overrides };
}

export interface ToolCallResult { content: { type: string; text: string }[]; isError?: boolean }

/** Run the gateway in-process and connect an MCP client to it. */
export async function connect(config: GatewayConfig) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createGateway(config).connect(serverTransport);
  const client = new Client({ name: 'trialrun-test', version: '0.0.0' });
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolCallResult;
  const text = async (name: string, args: Record<string, unknown> = {}) => first((await call(name, args)).content).text;
  const json = async <T = unknown>(name: string, args: Record<string, unknown> = {}) => JSON.parse(await text(name, args)) as T;
  const tools = async () => (await client.listTools()).tools.map((t) => t.name);
  const resource = async (uri: string) => {
    const { contents } = await client.readResource({ uri });
    return (first(contents) as { text: string }).text;
  };
  return { client, call, text, json, tools, resource, close: () => client.close() };
}
