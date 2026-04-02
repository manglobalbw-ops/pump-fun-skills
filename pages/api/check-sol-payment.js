import { Connection, PublicKey } from '@solana/web3.js';

// Define the wallet address for payment validation
const VALID_WALLET_ADDRESS = 'CF4mr4WgZHHVt1tN3qQgYvqm5DonVDcy8LFn1atGYq9t';

// Create a connection to the Solana blockchain
const connection = new Connection('https://api.mainnet-beta.solana.com');

export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { transactionSignature } = req.body;

        try {
            // Get the transaction details using the signature
            const transaction = await connection.getParsedConfirmedTransaction(transactionSignature);

            // Validate the transaction
            const isValid = validateTransaction(transaction);

            if (isValid) {
                return res.status(200).json({ message: 'Payment validated successfully.' });
            } else {
                return res.status(400).json({ message: 'Invalid payment. Transaction does not match the required wallet.' });
            }
        } catch (error) {
            return res.status(500).json({ message: 'An error occurred while validating the transaction.', error: error.message });
        }
    } else {
        return res.status(405).json({ message: 'Method not allowed. Please send a POST request.' });
    }
}

function validateTransaction(transaction) {
    if (!transaction || transaction.meta.err) {
        return false; // Transaction failed or does not exist
    }

    const transactionAccounts = transaction.transaction.message.accountKeys;

    const walletPublicKey = new PublicKey(VALID_WALLET_ADDRESS);

    // Check if the wallet address matches the expected address
    const matchedAccount = transactionAccounts.includes(walletPublicKey.toBase58());

    return matchedAccount;
}