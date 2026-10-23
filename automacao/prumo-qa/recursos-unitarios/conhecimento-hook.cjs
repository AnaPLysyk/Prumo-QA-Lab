// Entrada exclusiva do runner: mantém a janela real e substitui só conhecimento por memória.
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
// Propaga a substituição aos subprocessos Node dos fixtures, nunca ao aplicativo distribuído.
const requireHook = '--require ' + JSON.stringify(__filename);
if (!(process.env.NODE_OPTIONS ?? '').includes(__filename)) process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, requireHook].filter(Boolean).join(' ');
const fixture = pathToFileURL(path.join(__dirname, 'conhecimento-falso.mjs')).href;
const substitutos = require('./conhecimento-substitutos.cjs');
// Em Node puro, `import { app } from 'electron'` falha: o pacote só exporta o caminho do executável. Lá o Electron é o
// simulado; dentro do Electron real (testes de janela) continua o verdadeiro.
const electronSimulado = pathToFileURL(path.join(__dirname, 'electron-simulado.mjs')).href;
registerHooks({ resolve(especificador, context, nextResolve) {
  if (especificador === 'electron' && !process.versions.electron) return { url: electronSimulado, format: 'module', shortCircuit: true };
  return nextResolve(especificador, context);
}, load(url, context, nextLoad) {
  const relativo = url.split('/dist/')[1];
  const mapa = relativo && substitutos[relativo];
  // O arquivo consolidado inteiro continua real (importado com ?real); só as funções do mapa viram a versão em memória.
  if (mapa) return { format: 'module', shortCircuit: true, source: `import { memoria } from ${JSON.stringify(fixture)};\nexport * from ${JSON.stringify(url + '?real')};\n` + Object.entries(mapa).map(([exportado, nome]) => `export const ${exportado} = memoria.${nome};`).join('\n') + '\n' };
  return nextLoad(url, context);
} });
