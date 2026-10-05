/* Vireon — wallet.js
 * Wallet connect via Reown AppKit (ethers adapter), Robinhood Chain mainnet.
 * Allowlist domain situs (vireonflow.online) di cloud.reown.com untuk PROJECT_ID ini.
 * Dipakai di SEMUA halaman:
 * <script type="module" src="wallet.js"></script>
 *
 * API publik: window.VireonWallet
 *   connect()        -> Promise<{address, chainId} | null>
 *   disconnect()     -> Promise<void>
 *   onChange(cb)     -> unsubscribe fn; cb({address, chainId}) saat akun/chain berubah
 *   getBalance(asset)-> Promise<string | null>   asset: {address, decimals, isNative}
 *   getProvider()    -> EIP-1193 provider | null
 *   address, chainId -> state terakhir
 * Event: document 'vireonwallet:ready' (setelah API siap), 'vireonwallet:change'.
 */

const PROJECT_ID = '2ee5bb382849649365d9a79c10cbddb3';

import { createAppKit } from 'https://esm.sh/@reown/appkit';
import { EthersAdapter } from 'https://esm.sh/@reown/appkit-adapter-ethers';
import { defineChain } from 'https://esm.sh/@reown/appkit/networks';

const CHAIN_ID = 4663;
const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const ZERO = '0x0000000000000000000000000000000000000000';

const robinhood = defineChain({
  id: CHAIN_ID,
  caipNetworkId: 'eip155:' + CHAIN_ID,
  chainNamespace: 'eip155',
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } }
});

// Tombol yang dikelola wallet.js. Tombol yang sudah punya handler sendiri
// (token.html: #btnConnectNav memanggil VireonWallet.connect()) dilewati supaya tidak dobel.
const BTN_SELECTOR = '.btn-connect';
const SELF_MANAGED = ['btnConnectNav', 'btnConnectTrade'];
const DEFAULT_LABEL = 'Connect Wallet';
const WRONG_CHAIN_LABEL = 'Switch to Robinhood Chain';

const root = document.documentElement;
const currentTheme = () => (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

let appkit = null;
try {
  if (!PROJECT_ID || PROJECT_ID.startsWith('YOUR_')) throw new Error('PROJECT_ID belum diisi di wallet.js');
  appkit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: [robinhood],
    defaultNetwork: robinhood,
    projectId: PROJECT_ID,
    metadata: {
      name: 'Vireon',
      description: 'Vireon — Token Launch & Discovery on Robinhood Chain',
      url: window.location.origin,
      icons: []
    },
    features: { analytics: false, email: false, socials: false, onramp: false, swaps: false },
    themeMode: currentTheme(),
    themeVariables: {
      '--w3m-accent': '#C8FF00',
      '--w3m-color-mix': '#0D1110',
      '--w3m-color-mix-strength': 20,
      '--w3m-border-radius-master': '1px'
    }
  });
} catch (err) {
  console.error('[wallet.js]', err);
}

// Modal wallet ikut tema situs (dark/light).
function syncModalTheme() {
  try { if (appkit && appkit.setThemeMode) appkit.setThemeMode(currentTheme()); } catch (e) { /* noop */ }
}
syncModalTheme();
new MutationObserver(syncModalTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);

const state = { address: null, chainId: null };
const listeners = new Set();

function snapshot() {
  return state.address ? { address: state.address, chainId: state.chainId } : null;
}

function buttonLabel() {
  if (!state.address) return DEFAULT_LABEL;
  if (state.chainId !== null && state.chainId !== CHAIN_ID) return WRONG_CHAIN_LABEL;
  return short(state.address);
}

function setLabels() {
  const label = buttonLabel();
  document.querySelectorAll(BTN_SELECTOR).forEach((b) => {
    if (SELF_MANAGED.includes(b.id)) return; // dilabeli oleh halamannya sendiri
    b.textContent = label;
  });
}

function emitChange() {
  setLabels();
  const next = snapshot();
  listeners.forEach((cb) => { try { cb(next); } catch (e) { console.error('[wallet.js] onChange', e); } });
  document.dispatchEvent(new CustomEvent('vireonwallet:change', { detail: next }));
}

// Provider EIP-1193 dari koneksi AppKit (injected maupun WalletConnect); fallback ke window.ethereum.
function getProvider() {
  try {
    const p = appkit && appkit.getWalletProvider && appkit.getWalletProvider();
    if (p && typeof p.request === 'function') return p;
  } catch (e) { console.error('[wallet.js] getWalletProvider', e); }
  return window.ethereum || null;
}

// JSON-RPC langsung ke RPC Robinhood Chain: pembacaan saldo tidak butuh wallet terbuka.
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

function formatUnits(value, decimals) {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (frac.length > 6) frac = frac.slice(0, 6).replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

async function getBalance(asset) {
  if (!state.address || !asset) return null;
  try {
    const native = asset.isNative || (asset.address && asset.address.toLowerCase() === ZERO);
    if (native) {
      const hex = await rpc('eth_getBalance', [state.address, 'latest']);
      return formatUnits(BigInt(hex), 18);
    }
    // Aset statis/placeholder (mis. 'static:cbBTC') belum punya alamat kontrak nyata.
    if (!isAddress(asset.address)) return null;
    const data = '0x70a08231' + state.address.slice(2).toLowerCase().padStart(64, '0'); // balanceOf(address)
    const hex = await rpc('eth_call', [{ to: asset.address, data }, 'latest']);
    if (!hex || hex === '0x') return null;
    let decimals = Number(asset.decimals);
    if (!Number.isInteger(decimals)) {
      const d = await rpc('eth_call', [{ to: asset.address, data: '0x313ce567' }, 'latest']); // decimals()
      decimals = Number(BigInt(d));
    }
    return formatUnits(BigInt(hex), decimals);
  } catch (e) {
    console.warn('[wallet.js] getBalance gagal:', e);
    return null;
  }
}

async function ensureChain() {
  try { if (appkit && appkit.switchNetwork) await appkit.switchNetwork(robinhood); } catch (e) { console.warn('[wallet.js] switchNetwork', e); }
}

// Buka modal wallet dan tunggu hasilnya: state terhubung, atau null kalau modal ditutup tanpa konek.
function connect() {
  if (!appkit) {
    alert('Wallet belum dikonfigurasi (Project ID belum diisi).');
    return Promise.resolve(null);
  }
  if (state.address) {
    if (state.chainId !== null && state.chainId !== CHAIN_ID) {
      return ensureChain().then(() => snapshot());
    }
    appkit.open(); // sudah konek -> modal akun (ada Disconnect)
    return Promise.resolve(snapshot());
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      listeners.delete(onAcc);
      try { unsubModal && unsubModal(); } catch (e) { /* noop */ }
      resolve(val);
    };
    const onAcc = (s) => { if (s) finish(s); };
    listeners.add(onAcc);
    let unsubModal = null;
    try {
      unsubModal = appkit.subscribeState((s) => { if (s && s.open === false) setTimeout(() => finish(snapshot()), 150); });
    } catch (e) { /* subscribeState tidak tersedia: hasil tetap lewat onChange */ }
    appkit.open();
  });
}

async function disconnect() {
  try { if (appkit && appkit.disconnect) await appkit.disconnect(); } catch (e) { console.error('[wallet.js] disconnect', e); }
}

window.VireonWallet = {
  get address() { return state.address; },
  get chainId() { return state.chainId; },
  appkit,
  getProvider,
  connect,
  disconnect,
  getBalance,
  onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
};

if (appkit) {
  const apply = (address, chainId) => {
    const a = address || null;
    const c = chainId != null ? Number(chainId) : null;
    if (a === state.address && c === state.chainId) return;
    state.address = a;
    state.chainId = a ? c : null;
    emitChange();
  };
  appkit.subscribeAccount((acc) => {
    const addr = acc && acc.isConnected && acc.address ? acc.address : null;
    apply(addr, state.chainId);
  });
  try {
    appkit.subscribeNetwork((net) => { apply(state.address, net && net.chainId); });
  } catch (e) { console.warn('[wallet.js] subscribeNetwork', e); }
}

// Tombol connect generik (halaman yang tidak punya handler sendiri).
document.querySelectorAll(BTN_SELECTOR).forEach((b) => {
  if (SELF_MANAGED.includes(b.id)) return;
  b.addEventListener('click', (e) => { e.preventDefault(); connect(); });
});

document.dispatchEvent(new CustomEvent('vireonwallet:ready'));
