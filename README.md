# Reversible ICO smart contracts

The first ever Reversible ICO smart contract.
Reversible ICO is a way to collect funding over time. While conventional ICOs collect ETH and return a token. Collecting a lot of ETH within a short amount of time can lead to scams or other issues with the project team.

The rICO tries to solve that by keeping investors in control of their funds over a defined period of time, while buying tokens gradually.

## Functionality

The rICO is set in stages that can be defined in the `init` function.

**Stage 0** is seen as the **"commit phase"**: In this period no ETH from the contract moves to the project, investors can commit or reverse their commitment by sending back the tokens.

**Stage 1-x** is called **"buy phase"**, this is where the committed ETH gradually buy the token over time. ETH that already bought tokens is withdrawable by the project. While ETH that is just committed, can be withdrawn by any investor at any point in time, by sending back tokens to the rICO smart contract.

Each stage can also have a price increase, so that committing early is rewarded.
The scheme looks a little bit as follows:

![alt text](https://github.com/lukso-network/rICO-smart-contracts/raw/master/rICO-diagram.png "rICO Diagram")

### What happens if somebody commits during stage 1-x

Committing during stage 1-x means that a percentage of the ETH committed will automatically buy tokens according to the current point in time. So instantly only *part* of the ETH can be withdrawn by sending back tokens.
The time passing is for every investor the same, so late comers buy as much tokens at a certain point in time, as early adopters.

### Why do I get the full balance of tokens, if I have not bought them yet?

This is done so that normal token wallets can function as an interface to reverse a commitment.
You will see the full token balance on your address, but will only be able to move the amount you have actually bough at this point in time.

While in reverse you will only be able to send back the amount of tokens that you still have committed ETH for. Should you send a higher balance than what you can withdraw in ETH you will only return the amount matching your unbought token balance.

### What is the pending state?

When you commit ETH your address needs to be whitelisted first. This is done by the project by calling `whitelistApproveOrReject()` on the rICO smart contract. Should your address be rejected, then you will recevie your committed ETH back. Should it be approved you will see your full token balance.

### What if i want to withdraw ETH while my address is pending?

This can be done by sending an ETH transaction with 0 value, or smaller than `minContribution` (default 0.001 ether) to the rICo smart contract address. This will trigger a cancel of the pending commitment.

## Development

### Building Requirements

-   [Node.js](https://nodejs.org)
-   [npm](https://www.npmjs.com/)

```bash
sudo apt-get update
sudo apt-get install nodejs
sudo apt-get install npm
```

### Running Tests

```bash
npm test
```

### Merging contracts for deployment

```bash
npm run merge-contracts
```

Outputs the merged contracts in `./contracts-merged`