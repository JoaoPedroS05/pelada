import { randomBytes } from 'node:crypto';

// Contrato de qualquer gateway (Mercado Pago / Asaas / Efí):
//   createCharge({ txid, valorCentavos, descricao }) -> { txid, copiaECola }
// O gateway real deve chamar POST /webhooks/pix quando o pagamento for liquidado.
export class MockPix {
  async createCharge({ txid, valorCentavos }) {
    const valor = (valorCentavos / 100).toFixed(2);
    return { txid, copiaECola: `00020126MOCK${txid}5406${valor}6304${randomBytes(2).toString('hex').toUpperCase()}` };
  }
}

export function criaGatewayPix(provider = process.env.PIX_PROVIDER || 'mock') {
  if (provider === 'mock') return new MockPix();
  throw new Error(`Gateway PIX "${provider}" ainda não implementado (ver .plan Fase 1)`);
}
