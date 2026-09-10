'use strict';
const crypto = require('crypto');
const { env } = require('../config/env');
const http = require('../lib/http');
const logger = require('../lib/logger');

const cfg = env.egovChain;

let ethersMod = null;
function loadEthers() {
  if (ethersMod) return ethersMod;
  ethersMod = require('ethers');
  return ethersMod;
}

function scrubSecrets(msg) {
  return String(msg == null ? '' : msg).replace(/0x[0-9a-fA-F]{40,}/g, '0x<redacted>');
}

/** Exactly one JSON-RPC request. No retries or polling are allowed here. */
async function rpc(method, params) {
  const response = await http.post(cfg.rpcUrl, { jsonrpc: '2.0', id: 1, method, params });
  if (response && response.error) {
    const error = new Error(`eGovChain ${method} failed: ${response.error.message || 'JSON-RPC error'}`);
    error.code = response.error.code;
    throw error;
  }
  return response && response.result;
}

/**
 * Anchor a SHA-256 fingerprint directly in zero-value transaction calldata.
 *
 * This is the live-verified strategy used by another public hackathon implementation. It avoids
 * a separate contract while preserving the material guarantee: an immutable signed transaction
 * contains the record fingerprint and no PHI or patient identifier.
 *
 * Submission makes exactly two metered calls: nonce read + raw transaction broadcast. The
 * explicit verify endpoint later performs one transaction read. Never add tx.wait(), a receipt
 * loop, a watcher, or a provider subscription to this gateway.
 */
async function anchorHash(recordHash) {
  if (cfg.mode !== 'live' || !cfg.rpcUrl) return mockAnchor(recordHash);
  try {
    return await anchorLive(recordHash);
  } catch (err) {
    logger.error('eGovChain live anchor failed', { integration: 'egovChain', err: scrubSecrets(err.message) });
    throw err;
  }
}

async function anchorLive(recordHash) {
  const ethers = loadEthers();
  const wallet = new ethers.Wallet(cfg.privateKey);
  const nonceHex = await rpc('eth_getTransactionCount', [wallet.address, 'pending']);
  const raw = await wallet.signTransaction({
    type: 0,
    chainId: cfg.chainId,
    nonce: Number(BigInt(nonceHex)),
    gasLimit: 100000,
    gasPrice: 0,
    to: ethers.ZeroAddress,
    data: recordHash,
    value: 0,
  });
  const txHash = await rpc('eth_sendRawTransaction', [raw]);
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) {
    throw new Error('eGovChain returned an invalid transaction hash');
  }
  return {
    hash: recordHash,
    txHash,
    blockNumber: null,
    anchoredAt: new Date().toISOString(),
    verified: false,
    status: 'submitted',
    strategy: 'calldata',
    provider: 'egovchain',
  };
}

function mockAnchor(recordHash) {
  const txHash = '0x' + crypto.createHash('sha256').update('tx:' + recordHash).digest('hex');
  return { hash: recordHash, txHash, blockNumber: null, anchoredAt: new Date().toISOString(), verified: true, strategy: 'mock', provider: 'mock' };
}

/** Verify a calldata anchor with exactly one eth_getTransactionByHash call. */
async function verifyAnchor(recordHash, txHash) {
  if (cfg.mode !== 'live' || !cfg.rpcUrl) {
    return { verified: cfg.mode !== 'live' && !!txHash, recordHash, txHash };
  }
  if (!recordHash || !txHash) return { verified: false, recordHash, txHash, error: 'missing_hash' };
  try {
    const ethers = loadEthers();
    const expectedSigner = new ethers.Wallet(cfg.privateKey).address.toLowerCase();
    const tx = await rpc('eth_getTransactionByHash', [txHash]);
    const input = String((tx && (tx.input || tx.data)) || '').toLowerCase();
    const verified = !!tx
      && tx.blockNumber != null
      && String(tx.from || '').toLowerCase() === expectedSigner
      && String(tx.to || '').toLowerCase() === ethers.ZeroAddress.toLowerCase()
      && input === String(recordHash).toLowerCase();
    return {
      verified,
      recordHash,
      txHash,
      blockNumber: tx && tx.blockNumber ? Number(BigInt(tx.blockNumber)) : null,
      strategy: 'calldata',
    };
  } catch (err) {
    logger.warn('anchor verify RPC failed — silently degrading', { integration: 'egovChain', fallback: 'rpc_unavailable', err: scrubSecrets(err.message) });
    return { verified: false, recordHash, txHash, error: 'rpc_unavailable' };
  }
}

module.exports = { anchorHash, verifyAnchor };
