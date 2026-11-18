#!/usr/bin/env node
import { configFromEnv } from '../config.js';
import { runPolicy } from '../policy-cli.js';

process.exitCode = runPolicy(process.argv.slice(2), configFromEnv(), {
  out: (line) => { console.log(line); },
  err: (line) => { console.error(line); },
});
