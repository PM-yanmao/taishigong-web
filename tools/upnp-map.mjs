/* UPnP 端口映射工具（开发/课堂运维用，零依赖）：
 *   node tools/upnp-map.mjs list     查看路由器现有映射
 *   node tools/upnp-map.mjs add      把 TCP 8787 映射到本机 LAN IP
 *   node tools/upnp-map.mjs remove   删除 8787 映射（下课后）
 * 环境变量：EXT_PORT / INT_PORT / LEASE（秒，0=求永久）/ INTERNAL_IP / DESC。
 * 路由器租期未必给 0；JDBox 实测会回 604800（7 天），到期前重跑 add 续期。
 * 只在课堂演示时用；remove 用于下课后清理。 */
import dgram from 'node:dgram';
import os from 'node:os';

const ST = 'urn:schemas-upnp-org:service:WANIPConnection:1';
const ST2 = 'urn:schemas-upnp-org:service:WANPPPConnection:1';
const EXT_PORT = Number(process.env.EXT_PORT || 8787);
const INT_PORT = Number(process.env.INT_PORT || 8787);
const LEASE = Number(process.env.LEASE || 0); // 0 = 永久（路由器支持时）
const DESC = process.env.DESC || 'taishigong-web';

function primaryIP() {
  return new Promise((res) => {
    const s = dgram.createSocket('udp4');
    s.once('error', () => res('0.0.0.0'));
    s.connect(53, '223.5.5.5', () => { const a = s.address().address; try { s.close(); } catch {} res(a); });
    setTimeout(() => { try { s.close(); } catch {} res('0.0.0.0'); }, 900);
  });
}
function ssdp(st, bindIP, timeout = 3000) {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    const found = [];
    s.on('message', (m) => {
      const t = m.toString();
      const loc = /LOCATION:\s*(\S+)/i.exec(t);
      if (loc) found.push(loc[1]);
    });
    s.once('error', () => resolve(found));
    s.bind(0, bindIP, () => {
      const q = 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\nMX: 2\r\nST: ' + st + '\r\n\r\n';
      const buf = Buffer.from(q);
      s.send(buf, 1900, '239.255.255.250');
      setTimeout(() => s.send(buf, 1900, '239.255.255.250'), 300);
      setTimeout(() => { try { s.close(); } catch {} resolve([...new Set(found)]); }, timeout);
    });
  });
}
async function getText(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  return r.text();
}
function services(xml, base) {
  const out = [];
  for (const m of xml.matchAll(/<service>([\s\S]*?)<\/service>/g)) {
    const b = m[1];
    const type = /<serviceType>(.*?)<\/serviceType>/i.exec(b)?.[1] || '';
    const ctrl = /<controlURL>(.*?)<\/controlURL>/i.exec(b)?.[1] || '';
    out.push({ type, ctrl: ctrl.startsWith('http') ? ctrl : base.replace(/\/$/, '') + '/' + ctrl.replace(/^\//, '') });
  }
  return out;
}
async function soap(ctrl, type, action, inner = '') {
  const body = '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    '<s:Body><u:' + action + ' xmlns:u="' + type + '">' + inner + '</u:' + action + '></s:Body></s:Envelope>';
  const r = await fetch(ctrl, {
    method: 'POST', body, signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: '"' + type + '#' + action + '"' },
  });
  const text = await r.text();
  return { status: r.status, text };
}
function tag(xml, name) {
  return (new RegExp('<' + name + '>(.*?)</' + name + '>', 'is').exec(xml) || [])[1] || '';
}

const bindIP = await primaryIP();
const lanIPs = Object.values(os.networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal && a.address.startsWith('192.168.'))
  .map((a) => a.address);
const internalClient = process.env.INTERNAL_IP || lanIPs[0] || bindIP;
console.log('bind IP:', bindIP, '| internal client:', internalClient);

const locations = [...new Set([
  ...(await ssdp(ST, bindIP)), ...(await ssdp(ST2, bindIP)),
])];
if (!locations.length) { console.error('未发现 UPnP IGD（路由器可能禁用了 UPnP）'); process.exit(1); }

let wan = null;
for (const loc of locations) {
  try {
    const desc = await getText(loc);
    const base = (tag(desc, 'URLBase') || new URL(loc).origin).replace(/\/$/, '');
    const svc = services(desc, base).find((s) => /WAN(IP|PPP)Connection:1$/.test(s.type));
    if (!svc) continue;
    const ip = await soap(svc.ctrl, svc.type, 'GetExternalIPAddress');
    const wanIP = tag(ip.text, 'NewExternalIPAddress');
    console.log('IGD:', loc, '| WAN IP:', wanIP);
    wan = { ...svc, wanIP };
    break;
  } catch (e) { console.warn('device skipped:', e.message); }
}
if (!wan) { console.error('没有可用的 WANIPConnection 服务'); process.exit(1); }

const action = (process.argv[2] || 'list').toLowerCase();

async function getSpecific() {
  return soap(wan.ctrl, wan.type, 'GetSpecificPortMappingEntry',
    '<NewRemoteHost></NewRemoteHost><NewExternalPort>' + EXT_PORT + '</NewExternalPort><NewProtocol>TCP</NewProtocol>');
}
async function listAll() {
  for (let i = 0; i < 30; i++) {
    const r = await soap(wan.ctrl, wan.type, 'GetGenericPortMappingEntry', '<NewPortMappingIndex>' + i + '</NewPortMappingIndex>');
    if (!/<NewInternalClient>/.test(r.text)) { console.log('(共', i, '条映射)'); break; }
    console.log(`#${i} ext:${tag(r.text, 'NewExternalPort')}/${tag(r.text, 'NewProtocol')} -> ${tag(r.text, 'NewInternalClient')}:${tag(r.text, 'NewInternalPort')}  desc="${tag(r.text, 'NewPortMappingDescription')}" lease=${tag(r.text, 'NewLeaseDuration')} enabled=${tag(r.text, 'NewEnabled')}`);
  }
}

if (action === 'list') {
  console.log('\n当前映射：');
  await listAll();
  const cur = await getSpecific();
  console.log('\n8787 专用查询:', /<NewInternalClient>/.test(cur.text) ? '存在' : '不存在', '| HTTP', cur.status);
} else if (action === 'add') {
  const inner = '<NewRemoteHost></NewRemoteHost>' +
    '<NewExternalPort>' + EXT_PORT + '</NewExternalPort>' +
    '<NewProtocol>TCP</NewProtocol>' +
    '<NewInternalPort>' + INT_PORT + '</NewInternalPort>' +
    '<NewInternalClient>' + internalClient + '</NewInternalClient>' +
    '<NewEnabled>1</NewEnabled>' +
    '<NewPortMappingDescription>' + DESC + '</NewPortMappingDescription>' +
    '<NewLeaseDuration>' + LEASE + '</NewLeaseDuration>';
  const r = await soap(wan.ctrl, wan.type, 'AddPortMapping', inner);
  console.log('AddPortMapping HTTP', r.status, r.status === 200 ? 'OK' : r.text.slice(0, 400));
  console.log('外网地址: http://' + wan.wanIP + ':' + EXT_PORT + '/');
  const cur = await getSpecific();
  console.log('回读:', /<NewInternalClient>/.test(cur.text)
    ? `→ ${tag(cur.text, 'NewInternalClient')}:${tag(cur.text, 'NewInternalPort')} lease=${tag(cur.text, 'NewLeaseDuration')} enabled=${tag(cur.text, 'NewEnabled')}`
    : '未找到映射（HTTP ' + cur.status + '）');
} else if (action === 'remove') {
  const r = await soap(wan.ctrl, wan.type, 'DeletePortMapping',
    '<NewRemoteHost></NewRemoteHost><NewExternalPort>' + EXT_PORT + '</NewExternalPort><NewProtocol>TCP</NewProtocol>');
  console.log('DeletePortMapping HTTP', r.status, r.status === 200 ? '已删除' : r.text.slice(0, 300));
} else {
  console.error('用法: node analysis/upnp-map.mjs list|add|remove');
  process.exit(1);
}
