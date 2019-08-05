const web3util      = require('web3-utils');
const dateFormat    = require('dateformat');

/*
 ascii escape codes

 Black        0;30     Dark Gray     1;30
 Red          0;31     Light Red     1;31
 Green        0;32     Light Green   1;32
 Brown/Orange 0;33     Yellow        1;33
 Blue         0;34     Light Blue    1;34
 Purple       0;35     Light Purple  1;35
 Cyan         0;36     Light Cyan    1;36
 Light Gray   0;37     White         1;37

 */

let colors = {
    none:         "\x1B[0m",
    black:        '\x1B[0;30m',
    dark_gray:    '\x1B[1;30m',
    red:          '\x1B[0;31m',
    light_red:    '\x1B[1;31m',
    green:        '\x1B[0;32m',
    light_green:  '\x1B[1;32m',
    orange:       '\x1B[0;33m',
    yellow:       '\x1B[1;33m',
    blue:         '\x1B[0;34m',
    light_blue:   '\x1B[1;34m',
    purple:       '\x1B[0;35m',
    light_purple: '\x1B[1;35m',
    cyan:         '\x1B[0;36m',
    light_cyan:   '\x1B[1;36m',
    light_gray:   '\x1B[0;37m',
    white:        '\x1B[1;37m'
};

let logPre = "      ";

module.exports = {
    hasEvent(tx, eventNamePlusReturn) {
        console.log(tx);
        
        let eventSig = web3util.sha3(eventNamePlusReturn);
        return tx.receipt.logs.filter(x => x.topics[0] === eventSig);
    },
    getEventArgs(tx) {
        // tx.receipt.logs[0].topics[2];
    },
    colors,
    toLog( what ) {
        console.log(colors.white, what, colors.none);
    },
    toDate(seconds) {
        return dateFormat(parseInt(seconds) * 1000, "yyyy-mm-dd, HH:MM:ss TT");
    },
    topicToAddress(hexString) {
        return hexString.replace("0x000000000000000000000000", "0x");
    },
    toDateFromHex(hex) {
        return this.toDate( web3util.toDecimal(hex) );
    },
    async getBalance(helpers, address) {
        return new helpers.BN( await new helpers.web3Instance.eth.getBalance(address) );
    },
    transferTo(artifacts, _val, _from, _to) {
        let solAccUtils = artifacts.require('SolidityAccountUtils');
        return solAccUtils.new().then(function(instance){ return instance.transferTo(_to, {value: _val, from: _from}) });
    },

    /*
        This is useless for testing.. time is going to really depend on testrpc internal time,
        and we can't do anything about going back to test multiple things.

        instead we mock time in both ApplicationEntity and Assets
    */
    /*
    async timeTravelTo(helpers, time) {
        console.log("timeTravelTo: ", helpers.utils.toDate(time) );
        let now = new Date().getTime() / 1000; // seconds
        let difference = parseInt(time).toFixed(0) - parseInt(now).toFixed(0);
        if(difference > 0) {
            return new Promise((resolve, reject) => {
                helpers.web3.currentProvider.sendAsync({
                    jsonrpc: "2.0",
                    method: "evm_increaseTime",
                    params: [difference],
                    id: new Date().getTime()
                }, (err, result) => {
                    if (err) {
                        return reject(err)
                    }
                    return resolve(result)
                });
            })
        } else {
            return ;
        }
    },
    */
    async evm_snapshot(helpers) {
        return new Promise((resolve, reject) => {
            helpers.web3.currentProvider.sendAsync({
                jsonrpc: "2.0",
                method: "evm_snapshot",
                params: [],
                id: new Date().getTime()
            }, (err, result) => {
                if (err) {
                    return reject(err)
                }
                return resolve(result)
            });
        })
    },
    async evm_revert(helpers, snapshotId) {
        return new Promise((resolve, reject) => {
            helpers.web3.currentProvider.sendAsync({
                jsonrpc: "2.0",
                method: "evm_revert",
                params: [snapshotId],
                id: new Date().getTime()
            }, (err, result) => {
                if (err) {
                    return reject(err)
                }
                return resolve(result)
            });
        })
    },
    getAccounts: function(web3) {
        return web3.eth.getAccounts();
    },
    async getAbi(name) {
        const data = await require("../../build/contracts/"+name+".json");
        return data.abi;
    },
    async getAbiFile(name) {
        return require("../../build/contracts/"+name+".json");
    },
    async getContractInstance(helpers, name, address) {
        return new helpers.web3.eth.Contract(
            await helpers.utils.getAbi(name),
            address
        );
    },
    async deployNewContractInstance(helpers, name, options) {
        // Load contract data from file
        const ContractData = await helpers.utils.getAbiFile(name);

        let from = accounts[0];
        let gas = 6700000;
        let gasPrice = helpers.defaultGasPrice;

        if(options && options.from) {
            from = options.from;
        }
        
        if(options && options.gas) {
            gas = options.gas;
        }

        if(options && options.gasPrice) {
            gasPrice = options.gasPrice;
        }

        if(options && options.debug) {
            console.log("Deploying new contract ["+name+"]");
        }

        const deployArguments = {
            data: ContractData.bytecode
        }
        if(options && options.arguments) {
            deployArguments.arguments = options.arguments;
        }
        

        let ContractReceipt;
        const ContractInstance = await new helpers.web3Instance.eth.Contract(
            ContractData.abi,
            "0x0000000000000000000000000000000000000000"
        ).deploy(
            deployArguments
        ).send({
            from: from,
            gas: gas,
            gasPrice: gasPrice,
        }, function(error, transactionHash){
            if( error ) {
                console.log("error", error);
            }
        }).on('receipt', function(receipt){
            let Contract_address = receipt.contractAddress;
            ContractReceipt = receipt;
            if(options && options.debug) {
                console.log("New address: "+Contract_address);
            }
        });

        ContractInstance.receipt = ContractReceipt;
        return ContractInstance;
    },
    async showAccountBalances(helpers, accounts) {
        helpers.utils.toLog(logPre + " TestRPC Balances: ");
        for (let i = 0; i < accounts.length; i++) {
            let balance = await helpers.utils.getBalance(helpers, accounts[i]);
            helpers.utils.toLog(
                logPre +
                "["+i+"] "+accounts[i]+ ": "+ helpers.web3util.fromWei(balance, "ether")
            );
        }
    },
    async showContractBalance(helpers, contract) {
        helpers.utils.toLog("\n" + logPre + " Contract Balances: ");
        let balance = await helpers.utils.getBalance(helpers, contract.address.toString());
        helpers.utils.toLog(
            logPre +
            contract.address.toString()+ ": "+ helpers.web3util.fromWei(balance, "ether")
        );
    },
    toEth(helpers, amount) {
        return helpers.web3util.fromWei(amount, "ether");
    },
    async showGasUsage(helpers, tx, name) {
        helpers.utils.toLog(name + " GAS USAGE: " +
            helpers.utils.colors.purple +
            tx.receipt.cumulativeGasUsed
        );
    },
    async getGasPrice(helpers) {
        let stub = await helpers.getContract("EmptyStub");
        return stub.class_defaults.gasPrice;
    },
    async getGasUsage(helpers, tx, name) {
        return(name + "GAS USAGE: " +
            helpers.utils.colors.purple +
            tx.receipt.cumulativeGasUsed
        );
    },
    async measureCallExecution(Call, gas = true, options = {} ) {
        const startTime = process.hrtime();
        const item = await Call.call( options );
        const endTime = process.hrtime(startTime);
        const actualTime = endTime[0] + endTime[1] / 1000000000;
        let gasUsage = 0;
        if(gas) {
            gasUsage = await Call.estimateGas();
        }
        const callBinary = Call.encodeABI();
        return {
            data: item,
            gas: gasUsage,
            time: actualTime,
            bin: callBinary,
        }
    },
    async measureExecution(Call) {
        const startTime = process.hrtime();
        const item = await Call();
        const endTime = process.hrtime(startTime);
        const actualTime = endTime[0] + endTime[1] / 1000000000;

        return { item, actualTime }
    },
    resetAccountNonceCache(helpers) {
        helpers.web3Instance.currentProvider.engine._providers[1].nonceCache = {};
    },
    toFullToken(helpers, balance) {
        return helpers.web3util.fromWei(balance, "ether");
        const decimals = new helpers.BN("10").pow("18");
        return new helpers.BN(balance.toString()).div(decimals);
    }
};
