// const utils = require('./general')
const BigNumber = require("bignumber.js");
//const web3 = require("web3");
const web3 = require("web3-utils");
const web3JS = require("./web3.js");
const lightwallet = require("eth-lightwallet");

const GAS_PRICE = web3.toWei("100", "gwei");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const anyone = "0x0000000000000000000000000000000000000001";

let baseGasValue = function (hexValue) {
    switch (hexValue) {
        case "0x":
            return 0;
        case "00":
            return 4;
        default:
            return 68;
    }
};

let estimatebaseGasCosts = function (dataString) {
    const reducer = (accumulator, currentValue) =>
        (accumulator += baseGasValue(currentValue));

    return dataString.match(/.{2}/g).reduce(reducer, 0);
};

let estimateBaseGas = function (
    safe,
    to,
    value,
    data,
    operation,
    txGasEstimate,
    gasToken,
    refundReceiver,
    signatureCount,
    nonce
) {
    // numbers < 256 are 192 -> 31 * 4 + 68
    // numbers < 65k are 256 -> 30 * 4 + 2 * 68
    // For signature array length and baseGasEstimate we already calculated the 0 bytes so we just add 64 for each non-zero byte

    let signatureCost = signatureCount * (68 + 2176 + 2176 + 6000); // (array count (3 -> r, s, v) + ecrecover costs) * signature count
    let payload = safe.methods
        .execTransaction(
            to,
            value,
            data,
            operation,
            txGasEstimate,
            0,
            GAS_PRICE,
            gasToken,
            refundReceiver,
            "0x"
        )
        .encodeABI();

    let baseGasEstimate =
        estimatebaseGasCosts(payload) +
        signatureCost +
        (nonce > 0 ? 5000 : 20000) +
        1500; // 1500 -> hash generation costs
    return baseGasEstimate + 32000; // Add aditional gas costs (e.g. base tx costs, transfer costs)
};

let executeTransactionWithSigner = async function (
    signer,
    safe,
    subject,
    accounts,
    to,
    value,
    data,
    operation,
    executor,
    opts
) {
    let options = opts || {};
    let txFailed = options.fails || false;
    let txGasToken = options.gasToken || ZERO_ADDRESS;
    let refundReceiver = options.refundReceiver || ZERO_ADDRESS;

    // Estimate safe transaction (need to be called with from set to the safe address)
    let txGasEstimate = 1000000;

    //BYpassign gas estimations for now
    //   try {
    //     let estimateData = safe.methods
    //       .requiredTxGas(to, value, data, operation)
    //       .encodeABI();
    //     let estimateResponse = await safe.methods
    //       .requiredTxGas(to, value, data, operation)
    //       .call({
    //         from: safe._address,
    //         //from: safe.address
    //         //to: safe.address,
    //         data: estimateData
    //         //  gasPrice: 0
    //       });
    //     console.log(estimateResponse);

    //     txGasEstimate = new BigNumber(estimateResponse.substring(138), 16);
    //     // Add 10k else we will fail in case of nested calls
    //     txGasEstimate = txGasEstimate.toNumber() + 10000;
    //     console.log("    Tx Gas estimate: " + txGasEstimate);
    //   } catch (e) {
    //     console.log("    Could not estimate " + subject + "; cause: " + e);
    //   }

    let nonce = await safe.methods.nonce().call();

    //   let baseGasEstimate = estimateBaseGas(
    //     safe,
    //     to,
    //     value,
    //     data,
    //     operation,
    //     txGasEstimate,
    //     txGasToken,
    //     refundReceiver,
    //     accounts.length,
    //     nonce
    //   );
    let baseGasEstimate = 4000000;
    //console.log("    Base Gas estimate: " + baseGasEstimate);

    let gasPrice = GAS_PRICE;
    if (txGasToken != 0) {
        gasPrice = 1;
    }
    gasPrice = options.gasPrice || gasPrice;

    let sigs = await signer(
        to,
        value,
        data,
        operation,
        txGasEstimate,
        baseGasEstimate,
        gasPrice,
        txGasToken,
        refundReceiver,
        nonce
    );

    let payload = safe.methods
        .execTransaction(
            to,
            value,
            data,
            operation,
            txGasEstimate,
            baseGasEstimate,
            gasPrice,
            txGasToken,
            refundReceiver,
            sigs
        )
        .encodeABI();
    //console.log("    Data costs: " + estimatebaseGasCosts(payload));

    // Estimate gas of paying transaction
    let estimate = null;
    try {
        estimate = await safe.methods
            .execTransaction(
                to,
                value,
                data,
                operation,
                txGasEstimate,
                baseGasEstimate,
                gasPrice,
                txGasToken,
                refundReceiver,
                sigs
            )
            .estimateGas({
                from: executor,
                gasPrice: options.txGasPrice || gasPrice
            });
    } catch (e) {
        if (options.revertMessage == undefined || options.revertMessage == null) {
            throw e;
        }
        assert.equal(
            e.message,
            (
                "VM Exception while processing transaction: revert " +
                opts.revertMessage
            ).trim()
        );
        return null;
    }
    // Execute paying transaction
    // We add the txGasEstimate and an additional 10k to the estimate to ensure that there is enough gas for the safe transaction
    let tx = await safe.methods
        .execTransaction(
            to,
            value,
            data,
            operation,
            txGasEstimate,
            baseGasEstimate,
            gasPrice,
            txGasToken,
            refundReceiver,
            sigs
        )
        .send({
            from: executor,
            gas: estimate + txGasEstimate + 10000,
            gasPrice: options.txGasPrice || gasPrice
        });
    // let events = utils.checkTxEvent(
    //   tx,
    //   "ExecutionFailed",
    //   safe.address,
    //   txFailed,
    //   subject
    // );
    // if (txFailed) {
    //   let transactionHash = await safe.getTransactionHash(
    //     to,
    //     value,
    //     data,
    //     operation,
    //     txGasEstimate,
    //     baseGasEstimate,
    //     gasPrice,
    //     txGasToken,
    //     refundReceiver,
    //     nonce
    //   );
    //   assert.equal(transactionHash, events.args.txHash);
    // }
    //console.log(tx);

    return tx;
};

let executeTransaction = async function (
    lw,
    safe,
    subject,
    accounts,
    to,
    value,
    data,
    operation,
    executor,
    opts
) {
    let signer = async function (
        to,
        value,
        data,
        operation,
        txGasEstimate,
        baseGasEstimate,
        gasPrice,
        txGasToken,
        refundReceiver,
        nonce
    ) {
        let transactionHash = await safe.methods
            .getTransactionHash(
                to,
                value,
                data,
                operation,
                txGasEstimate,
                baseGasEstimate,
                gasPrice,
                txGasToken,
                refundReceiver,
                nonce
            )
            .call();

        // Confirm transaction with signed messages
        return signTransaction(lw, lw.accounts, transactionHash);
    };
    return executeTransactionWithSigner(
        signer,
        safe,
        subject,
        accounts,
        to,
        value,
        data,
        operation,
        executor,
        opts
    );
};

async function signTransaction(lw, signers, transactionHash) {
    let signatureBytes = "0x";
    signers.sort();
    for (var i = 0; i < signers.length; i++) {
        let sig = lightwallet.signing.signMsgHash(
            lw.keystore,
            lw.passwords,
            transactionHash,
            signers[i]
        );
        signatureBytes +=
            sig.r.toString("hex") + sig.s.toString("hex") + sig.v.toString(16);
    }
    return signatureBytes;
}

let deployToken = async function (deployer) {
    return deployContract(
        deployer,
        `contract TestToken {
        mapping (address => uint) public balances;
        constructor() public {
            balances[msg.sender] = 1000000000000;
        }

        function mint(address to, uint value) public returns (bool) {
            balances[to] += value;
            return true;
        }

        function transfer(address to, uint value) public returns (bool) {
            if (balances[msg.sender] < value) {
                return false;
            }
            balances[msg.sender] -= value;
            balances[to] += value;
            return true;
        }
    }`
    );
};

let deployContract = async function (deployer, source) {
    let output = await utils.compile(source);
    let contractInterface = output.interface;
    let contractBytecode = output.data;
    let transactionHash = await web3.eth.sendTransaction({
        from: deployer,
        data: contractBytecode,
        gas: 6000000
    });
    let receipt = web3.eth.getTransactionReceipt(transactionHash);
    const TestContract = web3.eth.contract(contractInterface);
    return TestContract.at(receipt.contractAddress);
};

Object.assign(exports, {
    estimateBaseGas,
    executeTransaction,
    executeTransactionWithSigner,
    deployToken,
    deployContract
});
