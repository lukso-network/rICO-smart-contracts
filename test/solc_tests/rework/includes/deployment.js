
function requiresERC1820Instance() {
    // test requires ERC1820.instance
    if (helpers.ERC1820.instance == false) {
        console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
        process.exit();
    }
}

async function deployContract(name, args = {}) {
    
    const contractInstance = await helpers.utils.deployNewContractInstance(
        helpers, name, args
    );

    console.log("      Contract deployed:  ", name);
    console.log("        Gas used:         ", contractInstance.receipt.gasUsed);
    console.log("        Contract Address: ", contractInstance.receipt.contractAddress);
    
    return {
        instance: contractInstance,
        receipt: contractInstance.receipt,
        address: contractInstance.receipt.contractAddress
    }
}

async function deployTokenContract() {
   return await deployContract(
       "RicoToken", 
       {
            from: holder,
            arguments: [
                setup.settings.token.supply.toString(),
                defaultOperators = [], // accounts[0] maybe
            ],
            gas: 6500000,
            gasPrice: helpers.solidity.gwei * 10
        }
    );
}

async function deployRICOContract() {
    return await deployContract("ReversibleICOMock");
}

async function doFreshDeployment(phase = 0, settings = null ) {

    requiresERC1820Instance();
    const snapShotKey = testKey+"_"+phase;

    if (typeof snapshots[snapShotKey] !== "undefined" && snapshotsEnabled) {
        // restore snapshot
        await helpers.web3.evm.revert(snapshots[snapShotKey]);

        // save again because whomever wrote test rpc had the impression no one would ever restore twice.. dafuq
        snapshots[snapShotKey+"_"+phase] = await helpers.web3.evm.snapshot();

        // reset account nonces..
        helpers.utils.resetAccountNonceCache(helpers);

    } else {

        const TokenContract = await deployTokenContract();
        TokenContractInstance = TokenContract.instance;
        TokenContractAddress = TokenContract.address;
        TokenContractReceipt = TokenContract.receipt;

        const RICOContract = await deployRICOContract();
        ReversibleICOInstance = RICOContract.instance;
        ReversibleICOAddress = RICOContract.address;
        ReversibleICOReceipt = RICOContract.receipt;

        // Setup token contract by adding RICO address
        await TokenContractInstance.methods.setup(
            ReversibleICOAddress
        ).send({
            from: holder,  // initial token supply holder
        });

        // phase = 1 -> init RICO with Settings 
        if(phase >= 1 ) {
        
            if(settings == null) {
                throw "Settings cannot be null";
            }

            /*
            *   Add RICO Settings
            */
            currentBlock = await ReversibleICOInstance.methods.getCurrentBlockNumber().call();

            // starts in one day
            commitPhaseStartBlock = parseInt(currentBlock, 10) + settings.blocksPerDay * 1;

            // 22 days allocation
            commitPhaseBlockCount = settings.blocksPerDay * settings.commitPhaseDays; // 22
            commitPhasePrice = settings.salePrice;

            // 12 x 30 day periods for distribution
            StageCount = settings.stageCount;
            StageBlockCount = settings.blocksPerDay * settings.stageDays; // 30
            StagePriceIncrease = settings.salePriceIncrease;
            commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;

            BuyPhaseEndBlock = commitPhaseEndBlock + ( (StageBlockCount + 1) * StageCount );

            await ReversibleICOInstance.methods.init(
                TokenContractAddress,       // address _TokenContractAddress
                whitelistControllerAddress, // address _whitelistControllerAddress
                projectWalletAddress,       // address _projectWalletAddress
                commitPhaseStartBlock,      // uint256 _StartBlock
                commitPhaseBlockCount,      // uint256 _commitPhaseBlockCount,
                commitPhasePrice,           // uint256 _commitPhasePrice in wei
                StageCount,                 // uint8   _StageCount
                StageBlockCount,            // uint256 _StageBlockCount
                StagePriceIncrease          // uint256 _StagePriceIncrease in wei
            ).send({
                from: deployerAddress,  // deployer
                gas: 3000000
            });

                
            buyPhaseStartBlock = parseInt(await ReversibleICOInstance.methods.buyPhaseStartBlock().call(), 10);
            buyPhaseEndBlock = parseInt(await ReversibleICOInstance.methods.buyPhaseEndBlock().call(), 10);

        }

        // phase = 2 -> transfer tokens to rico
        if(phase >= 2 ) {

            // transfer tokens to rico
            await TokenContractInstance.methods.send(
                ReversibleICOInstance.receipt.contractAddress,
                RicoSaleSupply,
                ERC777data
            ).send({
                from: holder,  // initial token supply holder
                gas: 100000
            });

            expect(
                await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
            ).to.be.equal(RicoSaleSupply.toString());
        }

        // create snapshot
        if (snapshotsEnabled) {
            snapshots[snapShotKey] = await helpers.web3.evm.snapshot();
        }
    }

    // reinitialize instances so revert works properly.
    TokenContractInstance = await helpers.utils.getContractInstance(helpers, "RicoToken", TokenContractAddress);
    TokenContractInstance.receipt = TokenContractReceipt;
    ReversibleICOInstance = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", ReversibleICOAddress);
    ReversibleICOInstance.receipt = ReversibleICOReceipt;

    // do some validation
    expect(
        await helpers.utils.getBalance(helpers, ReversibleICOAddress)
    ).to.be.bignumber.equal( new BN(0) );

    let expectedTokenSupply = "0";
    if(phase >= 2 ) {
        expectedTokenSupply = RicoSaleSupply.toString();
    }
    expect(await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()).to.be.equal(expectedTokenSupply);

    expect(
        await ReversibleICOInstance.methods.tokenSupply().call()
    ).to.be.equal(
        await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call()
    );

    return {
        TokenContractInstance: TokenContractInstance,
        ReversibleICOInstance: ReversibleICOInstance,
    }
};

module.exports = {
    requiresERC1820Instance,
    doFreshDeployment
}