/* data/sample.js — A's clearly-labelled sample block, behaviour unchanged.
   Pure: era/daa/blue are passed in so the API layer can keep feeding the same
   live values it always did (A read them off the shared state object). */
import { hexGen } from '../util/format.js';

export function sampleBlock(era = 2, daaScore = 474165582, blueScore = 468912044) {
  const tx = Array.from({ length: 11 }, (_, i) => ({
    version: i ? (era === 1 ? 0 : 1) : 0,
    subnetworkId: i === 0 ? '01' + '0'.repeat(38) : (i % 4 === 0 ? '0000000' + (i % 3 + 1) + '0'.repeat(32) : '0'.repeat(40)),
    mass: 2400 + i * 310,
    verboseData: { computeMass: 1100 + i * 90, transactionId: hexGen(800 + i) },
    inputs: i ? [
      { previousOutpoint: { transactionId: hexGen(100 + i), index: i % 3 }, signatureScript: hexGen(200 + i).slice(0, 120 + i * 8), sequence: 4294967295, computeBudget: (i % 4) + 1, sigOpCount: 1 },
      { previousOutpoint: { transactionId: hexGen(300 + i), index: 0 }, signatureScript: hexGen(400 + i).slice(0, 104), sequence: 0, computeBudget: 2, sigOpCount: 1 }
    ] : [],
    outputs: [
      { amount: String(5430000 + i * 1000000), scriptPublicKey: { version: 0, scriptPublicKey: hexGen(500 + i).slice(0, 66) } },
      { amount: String(123456 + i * 1000), scriptPublicKey: { version: 0, scriptPublicKey: hexGen(600 + i).slice(0, 68) }, covenant: (era !== 1 && i % 5 === 2) ? { authorizingInput: 0, covenantId: hexGen(20 + i) } : undefined }
    ],
    lockTime: 0,
    gas: (i % 4 === 0 && i) ? 1000 : null,
    payload: i === 0 ? 'd172542200000000c792470c00000000000022202f576f6f6c79506f6f6c7953616d706c65' + hexGen(700).slice(0, 60) : ''
  }));
  return {
    header: { version: era === 1 ? 1 : 2, hashMerkleRoot: hexGen(1), acceptedIdMerkleRoot: hexGen(2), utxoCommitment: hexGen(3), timestamp: String(Date.now()), bits: 453042187, nonce: '9183746502938475', daaScore: String(daaScore), blueScore: String(blueScore), blueWork: '1a2b3c4d5e6f7890', pruningPoint: hexGen(4), parents: [{ parentHashes: [hexGen(10), hexGen(11), hexGen(12), hexGen(13)] }] },
    transactions: tx,
    verboseData: { hash: hexGen(9), selectedParentHash: hexGen(10), mergeSetBluesHashes: [hexGen(10), hexGen(11), hexGen(12)], mergeSetRedsHashes: [hexGen(13)], childrenHashes: [], isChainBlock: true },
    extra: { minerInfo: 'sample data' }
  };
}
