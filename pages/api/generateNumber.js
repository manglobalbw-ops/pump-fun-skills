export default function handler(req, res) {
    const randomNumber = Math.floor(Math.random() * 1001);
    res.status(200).json({ number: randomNumber });
}