import React from 'react';
import { WalletConnect } from 'some-wallet-library';

const HomePage = () => {
    const [randomNumber, setRandomNumber] = React.useState(0);

    const generateRandomNumber = () => {
        setRandomNumber(Math.floor(Math.random() * 100));
    };

    return (
        <div>
            <h1>Random Number Generator</h1>
            <button onClick={generateRandomNumber}>Generate Random Number</button>
            <p>Your random number is: {randomNumber}</p>
            <WalletConnect />
            {/* Payment flow component can be added here */}
        </div>
    );
};

export default HomePage;