// `node --import ./src/cli/register.mjs <script>` or import this first: installs the .json.gz hooks.
import { registerHooks } from 'node:module';
import { resolve, load } from './gzLoader.mjs';
registerHooks({ resolve, load });
