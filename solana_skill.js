/**
 * Skill: Solana Wallet Analyzer 🛡️
 */

export default {
    name: 'solana_analyzer',
    description: 'Analiza una wallet de Solana para segmentación de marketing (whale/trader/holder/newbie).',
    parameters: [
        {
            name: 'wallet',
            type: 'string',
            description: 'Wallet de Solana'
        }
    ],
    async handler({ wallet }) {
        const apiKey = '0e30b3cc-22b6-4404-be2b-2acd651d3ca6';
        const url = 'https://api-mainnet.helius-rpc.com/v0/addresses/' + wallet + '/transactions?api-key=' + apiKey + '&limit=20';
        try {
            const resp = await fetch(url);
            const data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) return 'Sin transacciones.';
            let totalSol = 0; let txCount = data.length; let isTrader = false;
            data.forEach(tx => {
                const desc = (tx.description || '').toLowerCase();
                if (desc.includes('jupiter') || desc.includes('raydium') || desc.includes('swap')) isTrader = true;
                if (tx.nativeTransfers) tx.nativeTransfers.forEach(t => totalSol += (t.amount / 1e9));
            });
            const avgSol = totalSol / txCount;
            let segment = 'newbie';
            if (avgSol > 10) segment = 'whale 🐋';
            else if (isTrader) segment = 'trader 📈';
            else if (txCount > 5) segment = 'holder 💎';
            return { wallet, tx_count: txCount, avg_sol: avgSol.toFixed(4), segment, status: 'success' };
        } catch (e) { return 'Error: ' + e.message; }
    }
};
