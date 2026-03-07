#!/usr/bin/env node

import 'dotenv/config';
import process from 'node:process';
import { createProgram } from '../src/cli/index.js';

const program = createProgram();
program.parse(process.argv);
