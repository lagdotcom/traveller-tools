#!/usr/bin/env node
import { fileStore } from './fsStore.js';
import { mount } from './mount.js';

mount({ store: fileStore() });
