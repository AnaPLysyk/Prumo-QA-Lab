/** Exercita a fronteira IPC com remetentes sintéticos, sem janela, banco ou perfil do usuário. */
import test from 'node:test';
import assert from 'node:assert/strict';

test('IPC rejeita subframe, janela clonada, URL diferente e janela destruída antes do handler', async (t) => {
  let tratar; let chamadas = 0; const diagnosticos = [];
  t.mock.module('electron', { exports: { app: { getVersion: () => 'fixture' }, BrowserWindow: class {}, Tray: class {}, dialog: {}, shell: {}, Menu: class {}, session: {}, nativeImage: {}, safeStorage: {}, Notification: class { static isSupported() { return false; } }, ipcMain: { handle: (_nome, fn) => { tratar = fn; } } } });
  t.mock.module('../../../../dist/logs/banco/registrarDiagnostico.js', { exports: { registrarDiagnostico: (registro) => diagnosticos.push(registro) } });
  const { registrarCanal } = await import('../../../../dist/aplicativo/api/registrarCanal.js');
  const { estadoDoAplicativo } = await import('../../../../dist/aplicativo/estadoDoAplicativo.js');
  const { origemPermitida } = await import('../../../../dist/aplicativo/tipos/aplicativo.js');
  const frame = { url: origemPermitida };
  const sender = { mainFrame: frame };
  const janela = { webContents: sender, isDestroyed: () => false };
  estadoDoAplicativo.janelaPrincipal = janela;
  registrarCanal('app:info', (_args, origem) => { chamadas++; assert.equal(origem, janela); return { fixture: true }; });
  assert.deepEqual(await tratar({ sender, senderFrame: frame }, {}), { ok: true, data: { fixture: true } });
  const invasores = [
    { sender, senderFrame: { url: origemPermitida } },
    { sender: { mainFrame: frame }, senderFrame: frame },
    { sender, senderFrame: null }
  ];
  for (const evento of invasores) {
    const resultado = await tratar(evento, {});
    assert.equal(resultado.ok, false); assert.match(resultado.error, /IPC_SENDER_REJECTED/);
  }
  for (const url of [origemPermitida + '?clone', origemPermitida + '#clone', origemPermitida.replace('index.html', 'outra.html')]) {
    frame.url = url;
    assert.match((await tratar({ sender, senderFrame: frame }, {})).error, /IPC_SENDER_REJECTED/);
  }
  frame.url = origemPermitida; janela.isDestroyed = () => true;
  assert.match((await tratar({ sender, senderFrame: frame }, {})).error, /IPC_SENDER_REJECTED/);
  estadoDoAplicativo.janelaPrincipal = null;
  assert.match((await tratar({ sender, senderFrame: frame }, {})).error, /IPC_SENDER_REJECTED/);
  assert.equal(chamadas, 1, 'nenhum invasor alcança a operação');
  assert.equal(diagnosticos.filter((d) => d.state === 'ERROR').length, 8);
});
