import { useState } from 'react';

export default function Home() {
  const [randomNumber, setRandomNumber] = useState(null);

  const generateNumber = async () => {
    const response = await fetch('/api/generateNumber');
    const data = await response.json();
    setRandomNumber(data.number);
  };

  const processPayment = async () => {
    const response = await fetch('/api/processPayment', {
      method: 'POST',
    });
    const data = await response.json();
    alert(data.message);
  };

  return (
    <div>
      <h1>Random Number Generator</h1>
      <button onClick={generateNumber}>Generate Random Number</button>
      {randomNumber !== null && <p>Your random number is: {randomNumber}</p>}
      <button onClick={processPayment}>Process Payment</button>
    </div>
  );
}
