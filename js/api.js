// Apps Script の窓口に頼む。本文は text/plain で送る（Apps Script は事前確認に答えられないため）
import { config, getToken } from './auth.js';
export { NeedLogin } from './auth.js';

export class Forbidden extends Error {}
export class Offline extends Error {}

// 手元の確認用：localhost で ?mock を付けると、Mac に保存した旅データで画面を動かす
const mockWanted = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('mock');
const mock = mockWanted ? import('../dev-mock.js') : null; // 公開先には置かない。手元のサーバーが tools/ から渡す
export const isMock = !!mock;

export async function call(action, extra = {}) {
  if (mock) return (await mock).call(action, extra);
  const { apiUrl } = config();
  if (!apiUrl) throw new Error('config.js に窓口のURLが入っていません');
  const token = await getToken();
  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token, action }, extra))
    });
  } catch {
    throw new Offline();
  }
  const data = await res.json();
  if (data.error === 'forbidden') throw new Forbidden();
  if (data.error) throw new Error(data.message || data.error);
  return data;
}
