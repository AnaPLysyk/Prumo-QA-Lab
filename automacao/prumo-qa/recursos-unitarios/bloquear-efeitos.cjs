'use strict';
/** Defesa adicional no modo check:isolado. NAO e sandbox nem substitui revisão dos testes.
 * Recusa inicialização de navegadores, acesso SQLite via require e conexões TCP fora do loopback.
 * Os testes que usam recursos externos devem ficar NOT_RUN neste modo.
 */
const Module = require('node:module');
const cp = require('node:child_process');
const net = require('node:net');

const originalLoad = Module._load;
Module._load = function (specifier, ...args) {
  if (['node:sqlite', 'sqlite', 'sqlite3', 'better-sqlite3'].includes(specifier))
    throw new Error('TEST_ISOLATION_BLOCKED: SQLite nao autorizado');
  return originalLoad.call(this, specifier, ...args);
};
for (const metodo of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  const original = cp[metodo];
  cp[metodo] = function (comando, ...args) {
    const valor = String(comando || '').toLowerCase();
    if (/(^|[\\/])(electron|chrome|chromium|msedge)(\.exe)?($|\s|[\\/])/.test(valor) ||
        /playwright.*(chrome|chromium|electron)/.test(valor))
      throw new Error('TEST_ISOLATION_BLOCKED: navegador/Electron nao autorizado');
    return original.call(this, comando, ...args);
  };
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let conf = args[0];
  if (Array.isArray(conf)) conf = conf[0];
  if (typeof conf === 'number') conf = { port: conf, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (conf && typeof conf === 'object' && !conf.path) {
    const host = String(conf.host ?? conf.hostname ?? 'localhost').toLowerCase();
    if (!['localhost', '127.0.0.1', '::1', '[::1]', '0:0:0:0:0:0:0:1'].includes(host))
      throw new Error('TEST_EXTERNAL_NETWORK_BLOCKED: TCP fora de localhost');
  }
  return connect.apply(this, args);
};
