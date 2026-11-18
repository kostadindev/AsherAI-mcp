#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configFromEnv } from '../config.js';
import { createGateway, effectiveMode } from '../gateway.js';

const config = configFromEnv();
await createGateway(config).connect(new StdioServerTransport());
// stdout carries the MCP protocol, so status goes to stderr.
console.error(`[trialrun-gateway] ready: role=${config.role}, mode=${effectiveMode(config)}, ${config.workspace ? `workspace=${config.workspace}` : 'scenario'}, state=${config.statePath}`);
