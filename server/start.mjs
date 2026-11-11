/* 《太史公》一键启动
 *   node server/start.mjs            探测地址并启动服务
 *   node server/start.mjs --check    只探测地址，不启动（上课前复核 WAN IP 用）
 * 双击 start.bat 等价于第一条。零依赖，只用 Node 内置模块。
 */
import os from 'node:os';
import fs from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES = 'https://pm-yanmao.github.io/taishigong-web/'; // 仓库改名时改这一行
const ST = 'urn:schemas-upnp-org:service:WANIPConnection:1';

/* 项目要求 Node 18+（内置 fetch / AbortSignal.timeout）。低版本要提前说清楚，
 * 否则服务能起、生成全回退，课堂上很难排查。 */
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
if (NODE_MAJOR < 18) {
  console.error('');
  console.error('  需要 Node 18 或更高版本，当前 ' + process.versions.node + '。');
  console.error('  https://nodejs.org/ 下载 LTS 版本后重试。');
  console.error('');
  process.exit(1);
}

function readEnv() {
  const out = {};
  const p = path.join(HERE, '.env');
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = readEnv();
const PORT = Number(process.env.PORT || env.PORT || 8787);
const HOST = process.env.TSG_HOST || env.TSG_HOST || '127.0.0.1';
const HAS_KEY = !!(process.env.TSG_API_KEY || env.TSG_API_KEY);

function portFree(port) {
  return new Promise(res => {
    const s = net.createServer();
    s.once('error', () => res(false));
    s.once('listening', () => { s.close(); res(true); });
    s.listen(port, '0.0.0.0');
  });
}
function primaryIP() {
  return new Promise(res => {
    const s = dgram.createSocket('udp4');
    let timer = null;
    const done = v => { if (timer) clearTimeout(timer); try { s.close(); } catch (e) {} res(v); };
    timer = setTimeout(() => done(null), 900);
    s.once('error', () => done(null));
    s.connect(53, '223.5.5.5', () => done(s.address().address));
  });
}
/* 只列与主用地址同网段的物理网卡：滤掉 Hyper-V / WSL / VPN / APIPA 等虚拟地址，
 * 否则会把 198.18.x.x 之类地址当作「教室局域网」打印出来，学生根本连不上。 */
const VIRTUAL_IF = /(vethernet|hyper-v|vmware|virtualbox|loopback|wsl|tap|tun|docker|vpn|zerotier|tailscale|radmin|hamachi)/i;
function lanIPs(primary) {
  const prefix = primary ? primary.split('.').slice(0, 3).join('.') + '.' : null;
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_IF.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254')) continue;
      if (prefix && !a.address.startsWith(prefix)) continue;
      out.push(a.address);
    }
  }
  return [...new Set(out)];
}
async function getText(url, ms = 2000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  return r.text();
}
async function soap(url, action, inner) {
  const body = '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    '<s:Body><u:' + action + ' xmlns:u="' + ST + '">' + inner + '</u:' + action + '</s:Body></s:Envelope>';
  const r = await fetch(url, {
    method: 'POST', body, signal: AbortSignal.timeout(2500),
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: '"' + ST + '#' + action + '"' },
  });
  return r.text();
}

/* SSDP 找到路由器 → 读设备描述 → 查 WAN IP 与 8787 映射状态。失败静默跳过。 */
async function probeRouter(bindIP) {
  const loc = await new Promise(res => {
    const s = dgram.createSocket('udp4');
    let found = null;
    s.on('message', m => {
      const x = /LOCATION:\s*(\S+)/i.exec(m.toString());
      if (x && !found) found = x[1];
    });
    s.once('error', () => res(null));
    try {
      s.bind(0, bindIP || '0.0.0.0', () => {
        const q = 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\n' +
          'MAN: "ssdp:discover"\r\nMX: 1\r\n' +
          'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n';
        s.send(Buffer.from(q), 1900, '239.255.255.250');
        setTimeout(() => { try { s.close(); } catch (e) {} res(found); }, 1400);
      });
    } catch (e) { res(null); }
  });
  if (!loc) return null;
  try {
    const desc = await getText(loc);
    const ub = /<URLBase>(.*?)<\/URLBase>/is.exec(desc);
    const base = (ub ? ub[1] : new URL(loc).origin).replace(/\/$/, '');
    let ctrl = null;
    for (const m of desc.matchAll(/<service>([\s\S]*?)<\/service>/g)) {
      if (!/WANIPConnection/.test(m[1])) continue;
      const c = /<controlURL>(.*?)<\/controlURL>/i.exec(m[1]);
      if (c) ctrl = c[1].startsWith('http') ? c[1] : base + '/' + c[1].replace(/^\//, '');
    }
    if (!ctrl) return null;
    const ipm = /<NewExternalIPAddress>(.*?)<\/NewExternalIPAddress>/is
      .exec(await soap(ctrl, 'GetExternalIPAddress', ''));
    const wan = ipm ? ipm[1].trim() : null;
    const common = '<NewRemoteHost></NewRemoteHost><NewExternalPort>' + PORT +
      '</NewExternalPort><NewProtocol>TCP</NewProtocol>';
    const map = await soap(ctrl, 'GetSpecificPortMappingEntry', common);
    const lm = /<NewLeaseDuration>(.*?)<\/NewLeaseDuration>/is.exec(map);
    return {
      wan,
      mapped: /<NewInternalClient>/.test(map),
      days: lm ? (Number(lm[1]) / 86400).toFixed(1) : null,
    };
  } catch (e) { return null; }
}

async function main() {
  const ip = await primaryIP();
  const loopback = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
  const router = loopback ? null : await probeRouter(ip);
  console.log('');
  console.log('  太史公 · 课堂演示服务');
  console.log('  接口模式    ' + (HAS_KEY ? '在线生成（已配置 Key）' : '离线剧本包（未配置 Key）'));
  console.log('  监听        ' + HOST + ':' + PORT);
  console.log('');
  console.log('  教师机      http://localhost:' + PORT);
  if (loopback) {
    /* 只监听回环地址时，局域网地址一定连不上——不要打印误导学生 */
    console.log('  局域网      仅本机可访问（多设备演示请先在 server/.env 里设 TSG_HOST=0.0.0.0）');
  } else {
    const ips = lanIPs(ip);
    if (ips.length) {
      for (const a of ips) console.log('  局域网      http://' + a + ':' + PORT + (a === ip ? '   <- 主用' : ''));
    } else {
      console.log('  局域网      未发现物理网卡地址（可能处于虚拟/VPN 网络）');
    }
    if (router && router.wan) {
      console.log('  路由器 WAN  ' + router.wan +
        (router.mapped ? '   （UPnP 端口映射已启用）' : '   （未发现 UPnP 映射，跨网段访问需自行配置）'));
    }
  }
  console.log('  公网只读    ' + PAGES);
  console.log('');
  console.log('  Ctrl+C 停止。下课记得关服务 / 删 UPnP 映射。');
  console.log('');

  if (process.argv.includes('--check')) return;
  if (!(await portFree(PORT))) {
    console.log('  端口 ' + PORT + ' 已被占用——服务可能已在运行，直接打开上面的地址即可。');
    console.log('');
    process.exit(1);
  }
  await import('./index.mjs');
}
main().catch(e => { console.error('  启动失败:', e.message); process.exit(1); });
