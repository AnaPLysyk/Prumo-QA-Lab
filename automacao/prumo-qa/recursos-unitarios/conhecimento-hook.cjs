// Entrada exclusiva do runner: mantém a janela real e substitui só conhecimento por memória.
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
// Propaga a substituição aos subprocessos Node dos fixtures, nunca ao aplicativo distribuído.
const requireHook = '--require ' + JSON.stringify(__filename);
if (!(process.env.NODE_OPTIONS ?? '').includes(__filename)) process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, requireHook].filter(Boolean).join(' ');
const fixture = pathToFileURL(path.join(__dirname, 'conhecimento-falso.mjs')).href;
const substitutos = require('./conhecimento-substitutos.cjs');
registerHooks({ load(url, context, nextLoad) {
  const relativo = url.split('/dist/')[1];
  const s = relativo && substitutos[relativo];
  if (s) return { format: 'module', shortCircuit: true, source: `import { memoria } from ${JSON.stringify(fixture)};\nexport const ${s[0]} = memoria.${s[1]};\n` };
  return nextLoad(url, context);
} });
