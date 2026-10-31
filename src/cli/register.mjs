// `node --import ./src/cli/register.mjs <script>` or import this first: installs the .json.gz hooks.
import { register } from 'node:module';
register('./gzLoader.mjs', import.meta.url);
