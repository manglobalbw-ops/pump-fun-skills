import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { ethers } from 'ethers';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  background-color: #f8f9fa;
`;

const WalletButton = styled.button`
  margin: 10px;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    background-color: #0056b3;
  }
`;

const TransactionHistory = styled.div`
  margin-top: 20px;
  width: 100%;
`

const TransactionItem = styled.div`
  background: #fff;
  padding: 10px;
  margin: 5px 0;
  border: 1px solid #dee2e6;
  border-radius: 4px;
`

const App = () => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [transactionHistory, setTransactionHistory] = useState([]);

  const connectWallet = async () => {
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletAddress(accounts[0]);
      window.ethereum.on('accountsChanged', connectWallet);
    } else {
      alert('Please install MetaMask!');
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
  };

  const generateNumber = () => {
    return Math.floor(Math.random() * 100);
  };

  const handlePaymentAndGenerate = async () => {
    if (!walletAddress) return;
    const number = generateNumber();
    // Simulate payment processing
    // Here you would implement payment logic
    setTransactionHistory([...transactionHistory, { address: walletAddress, number }]);
  };

  return (
    <Container>
      <h1>Pump.fun Wallet Integration</h1>
      {walletAddress ? (
        <div>
          <p>Connected Wallet: {walletAddress}</p>
          <WalletButton onClick={disconnectWallet}>Disconnect Wallet</WalletButton>
          <WalletButton onClick={handlePaymentAndGenerate}>Generate Number & Process Payment</WalletButton>
        </div>
      ) : (
        <WalletButton onClick={connectWallet}>Connect Wallet</WalletButton>
      )}
      <TransactionHistory>
        <h2>Transaction History</h2>
        {transactionHistory.map((tx, index) => (
          <TransactionItem key={index}>Wallet: {tx.address}, Generated Number: {tx.number}</TransactionItem>
        ))}
      </TransactionHistory>
    </Container>
  );
};

export default App;