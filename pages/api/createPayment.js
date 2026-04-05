// pages/api/createPayment.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
    }

    const { amount, currency, paymentMethodId } = req.body || {};

    try {
        const paymentResult = await processPayment({ amount, currency, paymentMethodId });
        return res.status(200).json(paymentResult);
    } catch (error) {
        return res.status(500).json({ message: 'Payment processing failed', error: error.message });
    }
}

async function processPayment({ amount, currency, paymentMethodId }) {
    // Mock payment processing implementation
    // In a real application, integrate with a payment gateway API
    return { success: true, transactionId: 'abc123' };
}
