const ERC1820FundsSupplierIndex = 0; // 0 is either account[0] or deployerAddress generated from PK

// development network uses testrpc mnemonic and these indexes
const deployerAddressIndex      = 0;
const projectAddressIndex       = 1;
const freezerAddressIndex       = 2;
const rescuerAddressIndex       = 3;
const whitelistingAddressIndex  = 4;

const fs = require("fs");
// contract utils helpers
const utils = require("../test/solc_tests/helpers/utils.js");
const HDWalletProvider = require("truffle-hdwallet-provider");
const Web3 = require("web3");
let BN = Web3.utils.BN;
// import our settings
const rICOConfig = require("./rICO-config-deployment.js");

global.deployment_progress = loadProgress();

try {
    runDeployment();
} catch (e) {
    console.log(e);
    process.exit(1);
}


async function runDeployment() {
    
    const network = process.argv[2];
    let resume = false;
    if(process.argv[3] == "resume") {
        resume = true;
    }

    let web3Instance = null,
        projectWeb3Instance = null,
        deployerAddress,
        projectAddress,
        freezerAddress,
        rescuerAddress,
        whitelistingAddress, 
        ERC1820FundsSupplierAddress;

    // *** SET ADDRESSES
    if (network == "live") {
    
        utils.toLog("Using live network");

        web3Instance = await new Web3(
            new HDWalletProvider(
                [rICOConfig.settings.keys.deployerPrivateKey],
                rICOConfig.settings.provider
            )
        );

        if(rICOConfig.settings.address.liveProjectAddress == null ) {
            projectWeb3Instance = await new Web3(
                new HDWalletProvider(
                    [rICOConfig.settings.keys.projectPrivateKey],
                    rICOConfig.settings.provider
                )
            );
            projectAddress = await web3Instance.eth.accounts.privateKeyToAccount("0x"+rICOConfig.settings.keys.projectPrivateKey).address;
        } else {
            projectAddress = rICOConfig.settings.address.liveProjectAddress;
        }

        deployerAddress = await web3Instance.eth.accounts.privateKeyToAccount("0x"+rICOConfig.settings.keys.deployerPrivateKey).address;
        freezerAddress = rICOConfig.settings.address.liveFreezerAddress;
        rescuerAddress = rICOConfig.settings.address.liveRescuerAddress;
        whitelistingAddress = rICOConfig.settings.address.liveWhitelistingAddress;
        ERC1820FundsSupplierAddress = deployerAddress;

        console.log('deployerAddress');

    } else if (network == "development") {
    
        utils.toLog("Using development network");

        const mnemonic = fs.readFileSync("scripts/rpcs/_seed_words").toString().trim();
    
        web3Instance = await new Web3(
            new HDWalletProvider(
                mnemonic,
                "http://127.0.0.1:8545/",
                0,
                11,
                false
            )
        );

        const accounts = await web3Instance.eth.getAccounts();
        
        deployerAddress = accounts[deployerAddressIndex];
        projectAddress = accounts[projectAddressIndex];
        freezerAddress = accounts[freezerAddressIndex];
        rescuerAddress = accounts[rescuerAddressIndex];
        whitelistingAddress = accounts[whitelistingAddressIndex];
        ERC1820FundsSupplierAddress = accounts[ERC1820FundsSupplierIndex];

    } else {
    
        console.log("Specified Network not found.");
        process.exit(1);
   
    }
    
    // import chai assert / expect
    const chaiBN = require('chai-bn')(BN);
    const { assert, expect } = require("chai").use(chaiBN);

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 1 - Setting up helpers and globals \n" +
        "  ----------------------------------------------------------------"
    );


    // import ERC1820 data
    const { ERC1820 } = require("../test/ERC1820.js");
    const ERC1820_ContractAddress = ERC1820.ContractAddress;

    // edit this to change "funds supplier address"
    ERC1820.FundsSupplierAddress = ERC1820FundsSupplierAddress;

    const web3util = require("web3-utils");

    utils.toLog(" Done");
    utils.toLog("");

    /*
    *
    *   ERC1820 Check.
    * 
    */
    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 2 - ERC1820 Check or deploy new instance \n" +
        "  ----------------------------------------------------------------"
    );
    utils.toLog("  Should be deployed at: " + utils.colors.yellow + ERC1820_ContractAddress);


    let gasUsage = new BN(0);
    let deployedERC1820 = false;

    const ERC1820Code = await web3Instance.eth.getCode(ERC1820_ContractAddress);

    if ((ERC1820Code).length > '0x0'.length) {
        utils.toLog("  - found at address " + ERC1820_ContractAddress);

    } else {
        
        deployedERC1820 = true;

        utils.toLog(" 1 - Checks:");

        // 1 - Checks
        utils.toLog("   - Contract Code at address: " + ERC1820_ContractAddress + " is 0x.");
        const ContractCode = await new web3Instance.eth.getCode(ERC1820_ContractAddress);
        expect( ContractCode ).to.be.equal( "0x" );

        utils.toLog("   - Deployer address: " + ERC1820.SenderAddress + " balance should be 0 eth.");
        const SenderBalance = await web3Instance.eth.getBalance(ERC1820.SenderAddress);
        expect( SenderBalance ).to.equal( '0' );

        utils.toLog("   - Funds Supplier address: " + ERC1820.FundsSupplierAddress + " balance should be at least 0.08 eth.");
        const SupplierBalance = new BN(await web3Instance.eth.getBalance(ERC1820.FundsSupplierAddress));
        expect( SupplierBalance ).to.be.bignumber.above( ERC1820.deploymentCost );

        // 2 - Supply funds to deployer
        utils.toLog(" 2 - Supply funds to deployer:");

        utils.toLog("   Transfer deploymentCost from SupplierBalance to SenderAddress");

        // transfer deploymentCost from SupplierBalance to SenderAddress and validate
        const valueTransferTx = await web3Instance.eth.sendTransaction({
            from: ERC1820.FundsSupplierAddress,
            to: ERC1820.SenderAddress,
            value: ERC1820.deploymentCost.toString(),
            gasPrice: rICOConfig.settings.networkGasPrice,
        });

        utils.toLog("   - Hash: " + utils.colors.green + valueTransferTx.transactionHash);

        utils.toLog("   - Check: SenderAddress balance is now equal to deploymentCost");
        const newSenderBalance = new BN( await web3Instance.eth.getBalance(ERC1820.SenderAddress) );
        expect( newSenderBalance ).to.be.bignumber.equal( ERC1820.deploymentCost );

        // 3 - Deployment
        utils.toLog(" 3 - Deployment:");

        // sendRawTransaction if upgrading to the latest web3
        const deploymentTx = await web3Instance.eth.sendSignedTransaction( ERC1820.RawTx );
        utils.toLog("   - Hash: " + utils.colors.green + deploymentTx.transactionHash);
        utils.toLog("   - Gas used: " + utils.colors.purple + deploymentTx.gasUsed);
        utils.toLog("   - Contract Address: " + utils.colors.yellow + deploymentTx.contractAddress);
        utils.toLog("");

        // saveProgressPoint(
        //     network,
        //     "ERC1820", { 
        //         "hash" : deploymentTx.transactionHash,
        //         "status": "new"
        //     }
        // );

        // const mined = await waitForMining(_web3Instance, deploymentTx.transactionHash);
        // if(!mined) {
        //     process.exit();
        // }
    }

    

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 3 - Deploy contracts \n" +
        "  ----------------------------------------------------------------"
    );

    const TokenContract = await deployContract(
        utils,
        web3Instance,
        "ReversibleICOToken",
        {
            from: deployerAddress,
            arguments: [
                rICOConfig.settings.token.name,
                rICOConfig.settings.token.symbol,
                defaultOperators = [], // no operator.. add some in if you want them
            ],
            gasPrice: rICOConfig.settings.networkGasPrice,
            gas: 6500000,   // 4794308
        }
    );
    
    const TokenContractInstance = TokenContract;
    const TokenContractAddress = TokenContract.receipt.contractAddress;
    const TokenContractReceipt = TokenContract.receipt;

    utils.toLog("    - Contract deployed: ReversibleICOToken");
    utils.toLog("       Hash:             " + utils.colors.green + TokenContractReceipt.transactionHash);
    utils.toLog("       Gas used:         " + utils.colors.purple + TokenContractReceipt.gasUsed);
    utils.toLog("       Contract Address: " + utils.colors.yellow + TokenContractAddress);

    gasUsage = gasUsage.add( new BN(TokenContractReceipt.gasUsed) );

    const RICOContract = await deployContract(
        utils,
        web3Instance,
        "ReversibleICO",
        {
            from: deployerAddress,
            gasPrice: rICOConfig.settings.networkGasPrice,
            gas: 6500000,   // 6164643
        }
    );

    const ReversibleICOInstance = RICOContract;
    const ReversibleICOAddress = RICOContract.receipt.contractAddress;
    const ReversibleICOReceipt = RICOContract.receipt;

    utils.toLog("    - Contract deployed: ReversibleICO");
    utils.toLog("       Hash:             " + utils.colors.green + ReversibleICOReceipt.transactionHash);
    utils.toLog("       Gas used:         " + utils.colors.purple + ReversibleICOReceipt.gasUsed);
    utils.toLog("       Contract Address: " + utils.colors.yellow + ReversibleICOAddress);

    gasUsage = gasUsage.add( new BN(ReversibleICOReceipt.gasUsed) );

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 4 - Initialise Token Contract \n" +
        "  ----------------------------------------------------------------"
    );

    utils.toLog("   - Settings:");
    utils.toLog("       - ReversibleICOAddress: " + utils.colors.yellow + ReversibleICOAddress);
    utils.toLog("       - freezerAddress:       " + utils.colors.yellow + freezerAddress);
    utils.toLog("       - rescuerAddress:       " + utils.colors.yellow + rescuerAddress);
    utils.toLog("       - projectAddress:       " + utils.colors.yellow + projectAddress);
    utils.toLog("       - initialSupply:        " + utils.colors.yellow + web3util.fromWei(rICOConfig.settings.token.supply.toString(), "ether") + " tokens");
    utils.toLog("   - Caller: " + utils.colors.yellow + deployerAddress);

    // Setup token contract by adding RICO address
    let tx = await TokenContractInstance.methods.init(
        ReversibleICOAddress,   // address _ricoAddress,
        freezerAddress,         // address _freezerAddress,
        rescuerAddress,         // address _rescuerAddress,
        projectAddress,         // address _projectAddress,
        rICOConfig.settings.token.supply.toString() // uint256 _initialSupply
    ).send({
        from: deployerAddress,  // initial token supply holder
        gasPrice: rICOConfig.settings.networkGasPrice,
    });

    utils.toLog("   - Hash: " + utils.colors.green + tx.transactionHash);
    utils.toLog("   - Gas used: " + utils.colors.purple + tx.gasUsed);
    utils.toLog("   - Done");

    gasUsage = gasUsage.add( new BN(tx.gasUsed) );

    /*
    *   Add RICO Settings
    */

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Step 5 - Initialise rICO Contract \n" +
        "  ----------------------------------------------------------------"
    );

    const commitPhaseStartBlock = rICOConfig.settings.rico.startBlock;

    // allocation phase
    const commitPhaseBlockCount = rICOConfig.settings.rico.blocksPerDay * rICOConfig.settings.rico.commitPhaseDays;
    const commitPhasePrice = rICOConfig.settings.rico.commitPhasePrice;

    // buy phase
    stageCount = rICOConfig.settings.rico.stageCount;
    stageBlockCount = rICOConfig.settings.rico.blocksPerDay * rICOConfig.settings.rico.stageDays;
    stagePriceIncrease = rICOConfig.settings.rico.stagePriceIncrease;

    utils.toLog("   - Settings:");
    utils.toLog("       - TokenContractAddress:     " + utils.colors.yellow + TokenContractAddress);
    utils.toLog("       - whitelistingAddress       " + utils.colors.yellow + whitelistingAddress);
    utils.toLog("       - freezerAddress:           " + utils.colors.yellow + freezerAddress);
    utils.toLog("       - rescuerAddress:           " + utils.colors.yellow + rescuerAddress);
    utils.toLog("       - projectAddress:           " + utils.colors.yellow + projectAddress);
    utils.toLog("       - commitPhaseStartBlock:    " + utils.colors.yellow + commitPhaseStartBlock);
    utils.toLog("       - commitPhaseBlockCount:    " + utils.colors.yellow + commitPhaseBlockCount);
    utils.toLog("       - commitPhasePrice:         " + utils.colors.yellow + commitPhasePrice + " wei");
    utils.toLog("       - stagePriceIncrease:       " + utils.colors.yellow + stagePriceIncrease + " wei");
    utils.toLog("       - stageCount:               " + utils.colors.yellow + stageCount);
    utils.toLog("       - stageBlockCount:          " + utils.colors.yellow + stageBlockCount);

    utils.toLog("   - Caller: " + utils.colors.yellow + deployerAddress);

    tx = await ReversibleICOInstance.methods.init(
        TokenContractAddress,       // address _TokenContractAddress
        whitelistingAddress,        // address _whitelistingAddress
        freezerAddress,             // address _freezerAddress
        rescuerAddress,             // address _rescuerAddress
        projectAddress,             // address _projectAddress
        commitPhaseStartBlock,      // uint256 _commitPhaseStartBlock
        commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
        commitPhasePrice,           // uint256 _commitPhasePrice in wei
        stageCount,                 // uint8   _StageCount
        stageBlockCount,            // uint256 _StageBlockCount
        stagePriceIncrease          // uint256 _StagePriceIncrease in wei
    ).send({
        from: deployerAddress,      // deployer
        gasPrice: rICOConfig.settings.networkGasPrice,
        gas: 3000000
    });

    utils.toLog("   - Hash: " + utils.colors.green + tx.transactionHash);
    utils.toLog("   - Gas used: " + utils.colors.purple + tx.gasUsed);
    utils.toLog("   - Done");
    gasUsage = gasUsage.add( new BN(tx.gasUsed) );

    // *** SEND TOKENS from PROJECT to rICO
    // Skipped when project key is not present
    if(rICOConfig.settings.address.liveProjectAddress == null ) {

        utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 6 - Distributing Tokens\n" +
            "  ----------------------------------------------------------------"
        );

        const projectTokenBalance = await getTokenBalanceFor(TokenContractInstance, BN, projectAddress);
        utils.toLog("   Project Wallet Balance: " + utils.colors.yellow + web3util.fromWei(projectTokenBalance, "ether") + " tokens");
        utils.toLog("   Sale Supply:            " + utils.colors.yellow + web3util.fromWei(rICOConfig.settings.token.sale.toString(), "ether") + " tokens");

        utils.toLog("   - Send Token Sale supply from projectAddress to rICO Contract");

        if(projectWeb3Instance == null) {
            projectWeb3Instance = web3Instance;
        }

        const projectTokenContractInstance = new projectWeb3Instance.eth.Contract(
            await utils.getAbi("ReversibleICOToken"),
            TokenContractAddress
        );

        // transfer tokens to rico
        tx = await projectTokenContractInstance.methods.send(
            ReversibleICOAddress,
            rICOConfig.settings.token.sale.toString(),
            projectWeb3Instance.utils.sha3('777TestData')
        ).send({
            from: projectAddress,  // initial token supply holder
            gasPrice: rICOConfig.settings.networkGasPrice,
            gas: 200000
        });

        expect(
            await getTokenBalanceFor(TokenContractInstance, BN, ReversibleICOAddress)
        ).to.be.bignumber.equal(rICOConfig.settings.token.sale);

        utils.toLog("   - Hash: " + utils.colors.green + tx.transactionHash);
        utils.toLog("   - Gas used: " + utils.colors.purple + tx.gasUsed);
        utils.toLog("   - Done");
        gasUsage = gasUsage.add( new BN(tx.gasUsed) );


        expect(
            await getTokenBalanceFor(TokenContractInstance, BN, projectAddress)
        ).to.be.bignumber.equal(
            projectTokenBalance.sub(rICOConfig.settings.token.sale)
        );

        expect(
            await getTokenBalanceFor(TokenContractInstance, BN, deployerAddress)
        ).to.be.bignumber.equal( new BN(0) );


        utils.toLog(
            " ----------------------------------------------------------------\n" +
            "  Step 7 - Validation \n" +
            "  ----------------------------------------------------------------"
        );

        utils.toLog("   - Check: rICO ETH balance is 0");
        expect(
            new BN( await web3Instance.eth.getBalance(ReversibleICOAddress) )
        ).to.be.bignumber.equal( new BN(0) );

        utils.toLog("   - Check: rICO Token balance equals token.sale");
        const rICOTokenSupply = await getTokenBalanceFor(TokenContractInstance, BN, ReversibleICOAddress);
        expect(rICOTokenSupply).to.be.bignumber.equal(rICOConfig.settings.token.sale);

        utils.toLog("   - Check: rICO.tokenSupply returns Token balance");
        expect(await ReversibleICOInstance.methods.tokenSupply().call()).to.be.equal(rICOTokenSupply.toString());
    
    }

    utils.toLog(
        " ----------------------------------------------------------------\n" +
        "  Run Report \n" +
        "  ----------------------------------------------------------------"
    );

    utils.toLog("   Deployed ERC1820 Registry contract: " + utils.colors.yellow + deployedERC1820.toString() );
    utils.toLog("   ERC1820 Registry Address: " + utils.colors.yellow + ERC1820.ContractAddress );
    utils.toLog("");
    utils.toLog("   Token Contract Address:   " + utils.colors.yellow + TokenContractAddress);
    utils.toLog("   rICO Contract Address:    " + utils.colors.yellow + ReversibleICOAddress);
    utils.toLog("");
    utils.toLog("   deployerAddress:          " + utils.colors.yellow + deployerAddress);
    utils.toLog("   projectAddress:           " + utils.colors.yellow + projectAddress);
    utils.toLog("   freezerAddress:           " + utils.colors.yellow + freezerAddress);
    utils.toLog("   rescuerAddress:           " + utils.colors.yellow + rescuerAddress);
    utils.toLog("   whitelistingAddress:      " + utils.colors.yellow + whitelistingAddress);
    utils.toLog("");
    utils.toLog("   Gas price:                " + web3util.fromWei(new BN(rICOConfig.settings.networkGasPrice), "ether") + " ether");
    utils.toLog("   Total Gas usage:          " + gasUsage.toString());
    utils.toLog("   Deployment cost:          " + web3util.fromWei(gasUsage.mul(new BN(rICOConfig.settings.networkGasPrice)), "ether") + " ether");
    utils.toLog("");
    utils.toLog("   - Done");
    utils.toLog("");

    process.exit(0);
}

async function saveProgressPoint(network, _key, values) {
    deployment_progress[network + "_" + _key] = values;
    return fs.writeFileSync("./deployment/progress.json", JSON.stringify(deployment_progress), 'utf8');
}

function loadProgress() {
    const data = fs.readFileSync("./deployment/progress.json").toString();
    return JSON.parse(data);
}

async function getProgressPoint(_key) {
    deployment_progress[_key] = values;
}


async function waitForMining(_web3Instance, _transactionHash) {
    const receipt = await getTransactionReceiptMined(web3Instance, _transactionHash, 60, 10);
    return receipt.status;
}

async function getTokenBalanceFor(TokenContractInstance, BN, address) {
   return new BN( await TokenContractInstance.methods.balanceOf(address).call() );
}

async function deployContract(utils, web3Instance, name, options) {

    const from = options.from;
    const gas = options.gas;
    const gasPrice = options.gasPrice;

    // Load contract data from file
    const ContractData = await utils.getAbiFile(name);

    const deployArguments = {
        data: ContractData.bytecode
    }

    if(options && options.arguments) {
        deployArguments.arguments = options.arguments;
    }

    let ContractReceipt;
    const ContractInstance = await new web3Instance.eth.Contract(
        ContractData.abi,
        "0x0000000000000000000000000000000000000000"
    )
    .deploy(deployArguments)
    .send({
        from: from,
        gas: gas,
        gasPrice: gasPrice,
    }, function(error, transactionHash){
        if( error ) {
            console.log("error", error);
        }
    })
    .on('receipt', function(receipt){
        ContractReceipt = receipt;
    });

    ContractInstance.receipt = ContractReceipt;
    return ContractInstance;
}

function getTransactionReceiptMined(_web3Instance, txHash, interval, retries = 30, tryCount = 0) {
    
    const transactionReceiptAsync = function(resolve, reject) {
        _web3Instance.eth.getTransactionReceipt(txHash, (error, receipt) => {
            if (error) {
                reject(error);
            } else if (receipt == null) {
                if(tryCount == retries) {
                    reject(error);
                } else {
                    setTimeout(() => transactionReceiptAsync(resolve, reject), interval ? interval : 500, retries, tryCount);
                }
            } else {
                resolve(receipt);
            }
        });
    };

    if (Array.isArray(txHash)) {
        return Promise.all(txHash.map(oneTxHash => getTransactionReceiptMined(_web3Instance, oneTxHash, interval, retries, tryCount)));
    } else if (typeof txHash === "string") {
        return new Promise(transactionReceiptAsync);
    } else {
        throw new Error("Invalid Type: " + txHash);
    }
};