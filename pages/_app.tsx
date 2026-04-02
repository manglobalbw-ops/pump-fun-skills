import { WalletProvider } from '@solana/wallet-adapter-react';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { useMemo } from 'react';

const App = ({ Component, pageProps }) => {
    // You can specify the network (devnet, testnet, mainnet-beta) you'd like to connect to
    const network = clusterApiUrl('devnet');
    const endpoint = useMemo(() => network, [network]);

    return (
        <ConnectionProvider endPoint={endpoint}>
            <WalletProvider>
                <Component {...pageProps} />
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default App;