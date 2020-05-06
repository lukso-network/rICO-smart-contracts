# Reversible ICO smart contracts

The first ever Reversible ICO smart contract.
Reversible ICO is a way to collect funding over time. While conventional ICOs collect ETH and return a token. Collecting a lot of ETH within a short amount of time can lead to scams or other issues with the project team.

The rICO tries to solve that by keeping investors in control of their funds over a defined period of time, while buying tokens gradually.

## Functionality

The rICO is set in stages that can be defined in the `init` function.

**Stage 0** is seen as the **"commit phase"**: In this period no ETH buys tokens, and no ETH is allocated to the project, 
investors can commit or reverse their commitment by sending back the tokens.

**Stage 1-x** is called **"buy phase"**, this is where the committed ETH gradually buys the token over time. 
ETH that already bought tokens is available to the project for withdraw.

Tokens that are still "reserved" (meaning they haven't been unlocked for the participant),
can be returned to withdraw their corresponding ETH by any investor at any point in time.

**Each stage has a price increase, so that committing early is rewarded.**
The scheme looks a little bit as follows:

![alt text](https://github.com/lukso-network/rICO-smart-contracts/raw/master/rICO-diagram.png "rICO Diagram")

### How do I reserve tokens?

To reserve tokens at any stage, call the `commit()` function and send the amount of ETH along for which you want to reserve tokens with.

### What happens if somebody commits during stage 1-x

Committing during stage 1-x means that the rICO period of buying of tokens over time is shorter for yourself, 
as the period starts for everyone at the point in time of *their* commitment.

E.g. If you come in at month 3 of 10, your rICO will take place over 7 months and end with everyone else.

### Why do I see the full balance of tokens, if I have not bought them yet?

This is done so that normal token wallets can function as an interface to the rICO.
You will see the full token balance at your address, but will only be able to move the amount you have actually bought by the current point in time.

While in reverse you will only be able to send back the amount of tokens that you have still reserved. 
Should you send a higher than reserved token balance you will only return the amount of ETH matching your total reserved token balance, 
and get the rest tokens returned automatically.

### What is the pending state?

When you commit ETH your address needs to be whitelisted first. 
This is done by the projects whitelisting address by calling `whitelist(address[], bool)` on the rICO smart contract. 
Should your address be rejected (the project calling `whitelist([0xyouraddress], false)`), you will receive your committed ETH back.
Should it be approved you will see your full token balance at your committing address.

### What if I want to withdraw ETH while my address is still pending?

This can be done by sending an ETH transaction with 0 value, or smaller than `minContribution` (default 0.001 ether) to the rICO smart contract address.
Or call the `cancel()` function directly. This will trigger a cancel of all your pending ETH.

## Security Measurements

The rICO as well as the token contract was audited by (ConsenSys Diligence)[https://github.com/ConsenSys] in April 2020.
No severe issues were found. Find the audit report here: TODO add
 
### Escape hatch
The current version includes a security escape hatch in case of malfunction.
The security is split between two entities:

- The `freezerAddress`, who can *freeze* the rICO as well as the token contract, to prevent any interaction with it. (The rICO freezer can be different from the token freezer)
- The `rescuerAddress`, who should be held by an escrow company, only to be used in the severe case of emergency. (The rICO rescuer can be different from the token rescuer)
It can *when frozen* move the tokens of the rICO and ETH funds to another address (e.g. return contract, or updated rICO contract).
It can also point the token contract to another rICO contract, but only *when the token contract is frozen* as well.

The `freezerAddress` has the ability to to deactivate the freeze function in both token, and rICO contract, should the contracts deemed fully secure.
This will deactivate the ability to rescue funds or freeze the contracts all together.

## Development

### Building Requirements

-   [Node.js](https://nodejs.org)
-   [npm](https://www.npmjs.com/)

```bash
$ sudo apt-get update
$ sudo apt-get install nodejs
$ sudo apt-get install npm
```

### Recommended

- [nvm](https://github.com/nvm-sh/nvm)

```bash
$ nvm install v8.17.0
$ nvm use v8.17.0
$ npm install
$ npm run test
```

### Running Tests

```bash
$ npm test

// or to run the solc tests
$ npm run test-solc

// to only run the random tests
$ npm run test-random-standalone
```

### Merging contracts for deployment

```bash
$ npm run merge-contracts
```
Outputs the merged contracts in `./contracts-merged`

### Deployment

You can edit the rICO settings in `deployment/rICO-config-deployment.js` before deploying.

To test deploy on a local simulated development network.
The addresses will not be the one from the config file, but local generate ones.

```bash
$ npm run deploy-test
```

To deploy live, using the addresses from the config file:

```bash
$ npm run deploy-live
```


### Gas costs

- Contribution before whitelisting: ~60-130k GAS (first contribution is more expensive ~130k GAS)
- Contribution after whitelisting: ~190k GAS
- Project Withdraw: ~70k GAS
- Whitelisting: ~200k-650k GAS (with max 9 stages) (depends in how much stages were contributions)

**NOTE** Its not recommended to choose more than 50 stages!
9 stages require ~650k GAS when whitelisting contributions,
the whitelisting function could run out of gas with a high number of stages, preventing accepting contributions.

Test before using the `npm run test-random-standalone` and adjust `/test/solc_tests/0_standalone_random_tests.js`


## Main Contributors

- Micky Socaci <micky@binarzone.com>
- Fabian Vogelsteller <@frozeman>
- Marjorie Hernandez <marjorie@lukso.io>

## LICENSE

Apache 2.0