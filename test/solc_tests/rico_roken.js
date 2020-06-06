
const {
    requiresERC1820Instance,
    restoreFromSnapshot,
} = require('./includes/deployment');

const testKey = "TokenBefore_rICO";
let BN = helpers.web3Instance.utils.BN;

describe("rICO Token - Phases", function () {

    const deployingAddress = accounts[0];
    const freezerAddress = accounts[1];
    const rescuerAddress = accounts[2];
    const projectAddress = accounts[3];
    const whitelistingAddress = accounts[4];

    const testAddress1 = accounts[5];
    const testAddress2 = accounts[6];
    const testAddress3 = accounts[7];
    const testAddress4 = accounts[8];
    const testAddress5 = accounts[9];

    const oneToken = helpers.solidity.etherBN;
    const tokenMigrationAddress = "0x0000000000000000000000000000000000000001";

    let TokenContractAddress, RICOContractAddress, currentBlock;
    let TokenContractInstance, RICOContractInstance;

    before(async function () {
        requiresERC1820Instance();
    });

    describe("Deployment with rICO address(0)", async function () {

        before(async function () {
            await restoreFromSnapshot("ERC1820_ready");

            TokenContractInstance = await helpers.utils.deployNewContractInstance(
                helpers,
                "ReversibleICOToken",
                {
                    from: deployingAddress,
                    arguments: [
                        setup.settings.token.name,
                        setup.settings.token.symbol,
                        [], // defaultOperators
                    ],
                    gas: 6500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );

            await TokenContractInstance.methods
                .init(
                    "0x0000000000000000000000000000000000000000",   // _ricoAddress
                    freezerAddress,                                 // _freezerAddress
                    rescuerAddress,                                 // _rescuerAddress
                    projectAddress,                                 // _projectAddress
                    setup.settings.token.supply.toString()          // _initialSupply
                )
                .send({ from: deployingAddress, gas: 200000 });

            console.log(
                "      Gas used for deployment:",
                TokenContractInstance.receipt.gasUsed
            );
            console.log(
                "      Contract Address:",
                TokenContractInstance.receipt.contractAddress
            );
            console.log("");

            TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        });

        it("Gas usage should be lower than network configuration gas.", async function () {
            expect(TokenContractInstance.receipt.gasUsed).to.be.below(helpers.networkConfig.gas);
        });

        it("returns the deployer", async function () {
            expect(await TokenContractInstance.methods.deployingAddress().call()).to.be.equal(
                deployingAddress
            );
        });
        it("returns the freezer", async function () {
            expect(await TokenContractInstance.methods.freezerAddress().call()).to.be.equal(
                freezerAddress
            );
        });
        
        it("returns the rescuer", async function () {
            expect(await TokenContractInstance.methods.rescuerAddress().call()).to.be.equal(
                rescuerAddress
            );
        });

        it("returns the projectAddress", async function () {
            expect(await TokenContractInstance.methods.tokenGenesisAddress().call()).to.be.equal(
                projectAddress
            );
        });

        it("returns the frozen status correctly", async function () {
            expect(await TokenContractInstance.methods.frozen().call()).to.be.equal(
                false
            );
        });

        it("Property initialized should be true", async function () {
            expect(await TokenContractInstance.methods.initialized().call()).to.be.equal(true);
        });

        it("Property frozen should be false", async function () {
            expect(await TokenContractInstance.methods.frozen().call()).to.be.equal(false);
        });

        it("Property rICO should be 0x0000000000000000000000000000000000000000", async function () {
            expect(await TokenContractInstance.methods.rICO().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

        describe("Transfers with no rICO attached", function () {

            it("projectAddress has full token balance", async function () {
                expect(await TokenContractInstance.methods.balanceOf(projectAddress).call())
                    .to.be.equal(setup.settings.token.supply.toString());
            });

            it("testAddress1 has token balance 0", async function () {
                expect(await TokenContractInstance.methods.balanceOf(testAddress1).call()).to.be.equal("0");
            });

            it("testAddress2 has token balance 0", async function () {
                expect(await TokenContractInstance.methods.balanceOf(testAddress2).call()).to.be.equal("0");
            });

            it("testAddress3 has token balance 0", async function () {
                expect(await TokenContractInstance.methods.balanceOf(testAddress3).call()).to.be.equal("0");
            });

            it("testAddress4 has token balance 0", async function () {
                expect(await TokenContractInstance.methods.balanceOf(testAddress4).call()).to.be.equal("0");
            });

            it("testAddress5 has token balance 0", async function () {
                expect(await TokenContractInstance.methods.balanceOf(testAddress5).call()).to.be.equal("0");
            });

            it("projectAddress can transfer 10000 tokens to testAddress1", async function () {

                await TokenContractInstance.methods.transfer(
                    testAddress1,            // receiver
                    new BN("10000").mul(oneToken).toString()
                ).send({ 
                    from: projectAddress,   // sender
                    gas: 200000 
                });
                
                expect(await TokenContractInstance.methods.balanceOf(testAddress1).call()).to.be.equal(
                    new BN("10000").mul(oneToken).toString()
                );
            });

            it("testAddress1 can transfer 4000 tokens to testAddress2", async function () {

                await TokenContractInstance.methods.transfer(
                    testAddress2,            // receiver
                    new BN("4000").mul(oneToken).toString()
                ).send({ 
                    from: testAddress1,      // sender
                    gas: 200000 
                });
                
                expect(await TokenContractInstance.methods.balanceOf(testAddress2).call()).to.be.equal(
                    new BN("4000").mul(oneToken).toString()
                );
            });

            it("projectAddress can transfer 25000 tokens to testAddress4", async function () {

                await TokenContractInstance.methods.transfer(
                    testAddress4,            // receiver
                    new BN("25000").mul(oneToken).toString()
                ).send({ 
                    from: projectAddress,   // sender
                    gas: 200000 
                });
                
                expect(await TokenContractInstance.methods.balanceOf(testAddress4).call()).to.be.equal(
                    new BN("25000").mul(oneToken).toString()
                );
            });

            it("projectAddress can transfer 50000 tokens to testAddress5", async function () {

                await TokenContractInstance.methods.transfer(
                    testAddress5,            // receiver
                    new BN("50000").mul(oneToken).toString()
                ).send({ 
                    from: projectAddress,   // sender
                    gas: 200000 
                });
                
                expect(await TokenContractInstance.methods.balanceOf(testAddress5).call()).to.be.equal(
                    new BN("50000").mul(oneToken).toString()
                );
            });
            
        });

        describe("Deploy rICO and set it up", function () {

            it("deploy rICO contract", async function () {
                // deploy mock contract so we can set block times. ( ReversibleICOMock )
                this.ReversibleICO = await helpers.utils.deployNewContractInstance(helpers, "ReversibleICOMock");

                console.log("        - Gas used for deployment:", this.ReversibleICO.receipt.gasUsed);
                console.log("        - Contract Address:", this.ReversibleICO.receipt.contractAddress);
                console.log("");

                helpers.addresses.Rico = this.ReversibleICO.receipt.contractAddress;
            });

            it("init rICO contract", async function () {

                const blocksPerDay = 6450;

                currentBlock = await this.ReversibleICO.methods.getCurrentEffectiveBlockNumber().call();

                // starts in one day
                commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;
    
                // 22 days allocation
                commitPhaseBlockCount = blocksPerDay * 22;
                commitPhasePrice = helpers.solidity.ether * 0.002;
    
                // 12 x 30 day periods for distribution
                StageCount = 12;
                StageBlockCount = blocksPerDay * 30;
                StagePriceIncrease = helpers.solidity.ether * 0.0001;
    
                commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;
    
                // for validation
                BuyPhaseEndBlock = commitPhaseEndBlock + StageBlockCount * StageCount;

                await this.ReversibleICO.methods.init(
                    TokenContractAddress,       // address _tokenAddress
                    whitelistingAddress,        // address _whitelistingAddress
                    freezerAddress,             // address _freezerAddress
                    rescuerAddress,             // address _rescuerAddress
                    projectAddress,             // address _projectAddress
                    commitPhaseStartBlock,      // uint256 _commitPhaseStartBlock
                    commitPhaseBlockCount,      // uint256 _buyPhaseStartBlock,
                    commitPhasePrice,           // uint256 _initialPrice in wei
                    StageCount,                 // uint8   _stageCount
                    StageBlockCount,            // uint256 _stageLimitAmountIncrease
                    StagePriceIncrease          // uint256 _stagePriceIncrease in wei
                ).send({
                    from: deployingAddress,     // deployer
                    gas: 3000000
                });

                RICOContractInstance = this.ReversibleICO;
                RICOContractAddress = RICOContractInstance.receipt.contractAddress;
            });

            it("projectAddress transfers sale token supply to rICO", async function () {

                await TokenContractInstance.methods.transfer(
                    RICOContractAddress,    // receiver
                    setup.settings.token.sale.toString()
                ).send({ 
                    from: projectAddress,   // sender
                    gas: 200000
                });

                expect(await TokenContractInstance.methods.balanceOf(RICOContractAddress).call()).to.be.equal(
                    setup.settings.token.sale.toString()
                );
            });

            describe("Token.setRICOaddress(address)", function () {

                it("will revert if called by other address than tokenGenesisAddress", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);

                    await helpers.assertInvalidOpcode( async () => {
                        await TokenContractInstance.methods.setRICOaddress(RICOContractAddress).send({
                            from: deployingAddress, gas: 200000
                        });
                    }, "Only the tokenGenesisAddress can call this method.");
                });

                it("will revert if provided address is 0x", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);
                    await helpers.assertInvalidOpcode( async () => {
                        await TokenContractInstance.methods.setRICOaddress("0x0000000000000000000000000000000000000000").send({
                            from: projectAddress, gas: 200000
                        });
                    }, "rICO address cannot be 0x");
                });

                it("will set rico address if previous address was 0x and is called by projectAddress", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);

                    const before_rICOAddress = await TokenContractInstance.methods.rICO().call();
                    expect(before_rICOAddress).to.be.equal("0x0000000000000000000000000000000000000000");

                    await TokenContractInstance.methods.setRICOaddress(RICOContractAddress).send({
                        from: projectAddress, gas: 200000
                    });

                    const after_rICOAddress = await TokenContractInstance.methods.rICO().call();
                    expect(after_rICOAddress).to.be.equal(RICOContractAddress.toString());
                });

                it("will revert if rICO address is already set", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);

                    await helpers.assertInvalidOpcode( async () => {
                        await TokenContractInstance.methods.setRICOaddress("0x0000000000000000000000000000000000000001").send({
                            from: projectAddress, gas: 200000
                        });
                    }, "rICO address already set!");

                    helpers.utils.resetAccountNonceCache(helpers);

                });
            });

            it("jump in time to commitPhaseStartBlock", async function () {
                // jump to commitPhaseStartBlock
                currentBlock = await helpers.utils.jumpToContractStage(RICOContractInstance, deployingAddress, 0);
            });

            describe("do some rICO contributions", function () {

                describe("testAddress1 contributes 10 eth", async function () {

                    const ContributionAmount = new helpers.BN("10").mul( helpers.solidity.etherBN );
                    const participant = testAddress1;

                    it("starts with 6000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("6000").mul(oneToken).toString()
                        );
                    });

                    it("starts with 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });                    

                    it("contributes to rICO", async function () {
                        const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                            from: participant,
                            to: RICOContractInstance.receipt.contractAddress,
                            value: ContributionAmount.toString(),
                            data: '0x3c7a3aff', // commit()
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                    });

                    it("still has 6000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("6000").mul(oneToken).toString()
                        );
                    });

                    it("still has 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("is whitelisted", async function () {
                        await RICOContractInstance.methods.whitelist(
                            [participant],
                            true
                        ).send({
                            from: whitelistingAddress
                        });
                    });

                    it("balance increases by reserved amount ( 6000 + 5000 )", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("6000").mul(oneToken).add(
                                new BN("5000").mul(oneToken)
                            ).toString()
                        );
                    });

                    it("still has 6000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("6000").mul(oneToken).toString()
                        );
                    });

                    it("locked tokens increase by 5000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("5000").mul(oneToken).toString()
                        );
                    });

                });



                describe("testAddress2 contributes 10 eth", async function () {

                    const ContributionAmount = new helpers.BN("10").mul( helpers.solidity.etherBN );
                    const participant = testAddress2;

                    it("starts with 4000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("4000").mul(oneToken).toString()
                        );
                    });

                    it("starts with 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });                    

                    it("contributes to rICO", async function () {
                        const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                            from: participant,
                            to: RICOContractInstance.receipt.contractAddress,
                            value: ContributionAmount.toString(),
                            data: '0x3c7a3aff', // commit()
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                    });

                    it("still has 4000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("4000").mul(oneToken).toString()
                        );
                    });

                    it("still has 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("is whitelisted", async function () {
                        await RICOContractInstance.methods.whitelist(
                            [participant],
                            true
                        ).send({
                            from: whitelistingAddress
                        });
                    });

                    it("balance increases by reserved amount ( 4000 + 5000 )", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("4000").mul(oneToken).add(
                                new BN("5000").mul(oneToken)
                            ).toString()
                        );
                    });

                    it("still has 4000 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("4000").mul(oneToken).toString()
                        );
                    });

                    it("locked tokens increase by 5000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("5000").mul(oneToken).toString()
                        );
                    });
                });


                describe("testAddress3 contributes 20 eth", async function () {

                    const ContributionAmount = new helpers.BN("20").mul( helpers.solidity.etherBN );
                    const participant = testAddress3;

                    it("starts with 0 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("starts with 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });                    

                    it("contributes to rICO", async function () {
                        const ContributionTx = await helpers.web3Instance.eth.sendTransaction({
                            from: participant,
                            to: RICOContractInstance.receipt.contractAddress,
                            value: ContributionAmount.toString(),
                            data: '0x3c7a3aff', // commit()
                            gasPrice: helpers.networkConfig.gasPrice
                        });
                    });

                    it("still has 0 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("still has 0 locked tokens", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("is whitelisted", async function () {
                        await RICOContractInstance.methods.whitelist(
                            [participant],
                            true
                        ).send({
                            from: whitelistingAddress
                        });
                    });

                    it("balance increases by reserved amount 10000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("10000").mul(oneToken).toString()
                        );
                    });

                    it("still has 0 unlocked tokens", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked tokens increase by 10000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("10000").mul(oneToken).toString()
                        );
                    });

                });

            });

            describe("jump in time to stage 3 end (25%)", function () {
                it("done", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);
                    currentBlock = await helpers.utils.jumpToContractStage(RICOContractInstance, deployingAddress, 3, true);
                });
            });

            describe("validate balances", async function () {

                describe("testAddress1 - 6000 + 10 eth contribution", async function () {
                    const participant = testAddress1;

                    it("balance remains the same at 11000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("11000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked raises to 6000 + 1250 ( 25% of 5000 )", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("7250").mul(oneToken).toString()
                        );
                    });

                    it("locked lowers by 25% from 5000 to 3750", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3750").mul(oneToken).toString()
                        );
                    });

                });

                describe("testAddress2 - 4000 + 10 eth contribution", async function () {
                    const participant = testAddress2;

                    it("balance remains the same at 9000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("9000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked raises to 4000 + 1250 ( 25% of 5000 )", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("5250").mul(oneToken).toString()
                        );
                    });

                    it("locked lowers by 25% from 5000 to 3750", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3750").mul(oneToken).toString()
                        );
                    });

                });

                describe("testAddress3 - 0 + 20 eth contribution", async function () {
                    const participant = testAddress3;

                    it("balance remains the same at 10000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("10000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked raises by 25% from 0 to 2500", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("2500").mul(oneToken).toString()
                        );
                    });

                    it("locked lowers by 25% from 10000 to 7500", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("7500").mul(oneToken).toString()
                        );
                    });

                });

                describe("testAddress4 - 25000 + no contributions", async function () {
                    const participant = testAddress4;

                    it("balance remains the same at 25000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("25000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked remains 25000", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("25000").mul(oneToken).toString()
                        );
                    });

                    it("locked remains 0", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                });


                describe("testAddress5 - 50000 + no contributions", async function () {
                    const participant = testAddress5;

                    it("balance remains the same at 50000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("50000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked remains 50000", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("50000").mul(oneToken).toString()
                        );
                    });

                    it("locked remains 0", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                });

            });


            describe("Token.setMigrationAddress(address)", function () {

                it("migrationAddress is 0x0000000000000000000000000000000000000000", async function () {
                    expect(
                        await TokenContractInstance.methods.migrationAddress().call()
                    ).to.be.equal("0x0000000000000000000000000000000000000000");
                });
                
                it("will revert if called by other address than tokenGenesisAddress", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);

                    await helpers.assertInvalidOpcode( async () => {
                        await TokenContractInstance.methods.setMigrationAddress(tokenMigrationAddress).send({
                            from: deployingAddress, gas: 200000
                        });
                    }, "Only the tokenGenesisAddress can call this method.");
                });

                it("will set migrationAddress address if called by projectAddress", async function () {
                    helpers.utils.resetAccountNonceCache(helpers);

                    const before_migrationAddress = await TokenContractInstance.methods.migrationAddress().call();
                    expect(before_migrationAddress).to.be.equal("0x0000000000000000000000000000000000000000");

                    await TokenContractInstance.methods.setMigrationAddress(tokenMigrationAddress).send({
                        from: projectAddress, gas: 200000
                    });

                    const after_migrationAddress = await TokenContractInstance.methods.migrationAddress().call();
                    expect(after_migrationAddress).to.be.equal(tokenMigrationAddress);
                });
            });


            describe("transfer tokens to migration address", async function () {
                
                describe("testAddress5 - 50000 + no contributions", async function () {
                    const participant = testAddress5;

                    it("1 - withdraw reverts - send 1000 tokens to rICO while having no locked", async function () {
                        helpers.utils.resetAccountNonceCache(helpers);

                        await helpers.assertInvalidOpcode( async () => {
  
                            await TokenContractInstance.methods.transfer(
                                RICOContractAddress,  // receiver
                                new BN("750").mul(oneToken).toString(),
                            ).send({ 
                                from: participant,      // sender
                                gas: 200000 
                            });

                        }, "You can not withdraw, you have no locked tokens.");
                    });

                    it("2 - transfers all tokens to migration address", async function () {

                        await TokenContractInstance.methods.transfer(
                            tokenMigrationAddress,  // receiver
                            await TokenContractInstance.methods.balanceOf(participant).call(),
                        ).send({ 
                            from: participant,      // sender
                            gas: 200000 
                        });

                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal("0");
                    });

                    it("balance is 0", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 0", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked is 0", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                });

                describe("testAddress1 - 6000 + 10 eth contribution", async function () {
                    const participant = testAddress1;

                    it("balance is 11000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("11000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 7250", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("7250").mul(oneToken).toString()
                        );
                    });

                    it("locked is 3750", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3750").mul(oneToken).toString()
                        );
                    });

                    it("1 - withdraw works - send 750 locked tokens back", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        await TokenContractInstance.methods.transfer(
                            RICOContractAddress,  // receiver
                            new BN("750").mul(oneToken).toString(),
                        ).send({ 
                            from: participant,      // sender
                            gas: 500000 
                        });
                    });

                    it("balance is 10250", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("10250").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 7250", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("7250").mul(oneToken).toString()
                        );
                    });

                    it("locked reduces to 3000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );
                    });

                    it("2 - transfers all tokens to migration address", async function () {
                        helpers.utils.resetAccountNonceCache(helpers);

                        await TokenContractInstance.methods.transfer(
                            tokenMigrationAddress,  // receiver
                            await TokenContractInstance.methods.balanceOf(participant).call(),
                        ).send({ 
                            from: participant,      // sender
                            gas: 200000 
                        });

                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal("0");
                    });

                    it("balance is 0", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 0", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked remains 3000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );
                    });

                    it("3 - withdraw ? - reverts 'Sending failed: Insufficient funds' because you cannot transfer balance you don't have", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        await helpers.assertInvalidOpcode( async () => {
                            await TokenContractInstance.methods.transfer(
                                RICOContractAddress,  // receiver
                                "1",
                            ).send({ 
                                from: participant,      // sender
                                gas: 500000 
                            });
                        }, "Sending failed: Insufficient funds");

                    });

                    it("balance is 0", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 0", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked remains 3000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );
                    });

                    it("4 - gets 3000 tokens", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        await TokenContractInstance.methods.transfer(
                            participant,            // receiver
                            new BN("3000").mul(oneToken).toString()
                        ).send({ 
                            from: projectAddress,   // sender
                            gas: 200000
                        });
                        
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );

                    });

                    it("balance is 3000", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 0", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked remains 3000", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("3000").mul(oneToken).toString()
                        );
                    });

                    it("5 - withdraw works again", async function () {

                        helpers.utils.resetAccountNonceCache(helpers);

                        await TokenContractInstance.methods.transfer(
                            RICOContractAddress,  // receiver
                            new BN("3000").mul(oneToken).toString(),
                        ).send({ 
                            from: participant,      // sender
                            gas: 500000 
                        });
                    });

                    it("balance is 0", async function () {
                        expect(await TokenContractInstance.methods.balanceOf(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("unlocked is 0", async function () {
                        expect(await TokenContractInstance.methods.getUnlockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                    it("locked is 0", async function () {
                        expect(await TokenContractInstance.methods.getLockedBalance(participant).call()).to.be.equal(
                            new BN("0").mul(oneToken).toString()
                        );
                    });

                });

            });
            


        });



    });
});
