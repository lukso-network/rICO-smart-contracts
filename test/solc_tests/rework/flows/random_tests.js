const {
    validatorHelper,
    clone
} = require('../includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot,
} = require('../includes/deployment');

const testKey = "WithdrawTokenTests";

describe("ReversibleICO - Withdraw Token Balance", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;
    let ReversibleICO;
    // generate n participants
    let numberOfParticipants = 2;
    let participants = [];

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.startBlockDelay = 11;
    customTestSettings.rico.blocksPerDay = 3;
    customTestSettings.rico.stageDays = 2;
    customTestSettings.rico.stageCount = 10;

    let commitPhaseStartBlock = customTestSettings.rico.startBlockDelay;
    let commitPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.stageDays;
    let buyPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.stageDays * customTestSettings.rico.stageCount;
    let buyPhaseEndBlock = 60 + commitPhaseStartBlock + commitPhaseBlockCount + buyPhaseBlockCount;

    const commitPhasePrice = helpers.solidity.ether * 0.002;

    let project = {
        address: projectWalletAddress,
        weiBalance: new BN(0)
    };

    // add accounts
    for(let i = 0; i < numberOfParticipants; i++){
        participants[i] = {
            address: accounts[i+5],
            weiBalance: new BN(0),
            tokenBalance: new BN(0)
        };
        // participants[i].weiBalance = getRandomInt(numberOfParticipants) * 1000000000000000000;
    }

    priceInStage = (_stageId) => {
        // commitPhasePrice + stage * stagePriceIncrease
        return new BN(customTestSettings.rico.commitPhasePrice).add(
            new BN(_stageId).mul(
                new BN(customTestSettings.rico.stagePriceIncrease)
            )
        );
    }

    function getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }

    async function revertToFreshDeployment() {

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = ReversibleICO.receipt.contractAddress;


        const currentBlock = await helpers.utils.jumpToContractStage(ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));
    }

    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = ReversibleICO.receipt.contractAddress;


        const currentBlock = await helpers.utils.jumpToContractStage(ReversibleICO, deployerAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));

    });

    describe("randomly contribute and exit", async function () {

        before(async () => {
            await revertToFreshDeployment();

            // await helpers.utils.jumpToContractStage(ReversibleICO, deployerAddress, commitPhaseStartBlock);
            await ReversibleICO.methods.jumpToBlockNumber(commitPhaseStartBlock).send({
                from: deployerAddress,
                gas: 100000
            });

        });


        // console.log('rICO duration in blocks: ', (commitPhaseBlockCount + buyPhaseBlockCount));
        // console.log('Commit phase start block: ', commitPhaseStartBlock);
        // console.log('Current block: ', await ReversibleICO.methods.getCurrentBlockNumber().call());

        // iterate over all phases
        for (let blockNumber = commitPhaseStartBlock; blockNumber < buyPhaseEndBlock; blockNumber++) {

            console.log('Current Block: ', blockNumber);

            // go over every participant
            for (let i = 0; i < numberOfParticipants; i++) {
                let participant = participants[i];

                // we have 10, so that in 80% ther is no actions, as only 2 numbers represent actions
                let task = getRandomInt(10);

                let taskName = '';
                if(task === 1)
                    taskName = 'CONTRIBUTE';
                if(task === 2)
                    taskName = 'WITHDRAW';
                if(task === 3)
                    taskName = 'PROJECT WITHDRAW';

                console.log(participant.address +' Task: ' + taskName + ' '+ task);

                // CONTRIBUTE
                if(task === 1) {

                    it(participant.address + ": Buy tokens", async function () {

                        // WHITELIST
                        let isWhitelisted = await ReversibleICO.methods.isWhitelisted(participant.address).call();

                        if (!isWhitelisted) {
                            await ReversibleICO.methods.whitelist(
                                [participant.address],
                                true
                            ).send({
                                from: whitelistControllerAddress
                            });
                        }

                        // calc random token amount
                        // user balance: 1000000 ETH?
                        const contribTokenAmount = new BN(getRandomInt(100)); // 0-100 tokens //
                        const stageId = await ReversibleICO.methods.getCurrentStage().call();

                        if (contribTokenAmount > 0) {
                            const ContributionAmount = priceInStage(stageId).mul(contribTokenAmount);
                            await helpers.web3Instance.eth.sendTransaction({
                                from: participant.address,
                                to: ReversibleICO.receipt.contractAddress,
                                value: ContributionAmount.toString(),
                                gasPrice: helpers.networkConfig.gasPrice
                            });

                            // update his balance
                            participant.tokenBalance = participant.tokenBalance.add(contribTokenAmount.mul(new BN('1000000000000000000')));
                        }

                    });
                }

                // WITHDRAW
                if(task === 2) {

                    it(participant.address + ": Return tokens", async function () {

                        const maxTokens = await ReversibleICO.methods.currentReservedTokenAmount(participant.address).call();

                        // console.log(maxTokens);
                        // console.log(getRandomInt(maxTokens));

                        // calc random token amount
                        const returnTokenAmount = new BN(String(getRandomInt(maxTokens))); // 0-max reserved tokens

                        if(returnTokenAmount > 0) {
                            await TokenContractInstance.methods.transfer(ReversibleICO.receipt.contractAddress, returnTokenAmount.toString()).send({from: participant.address, gas: 1000000});

                            // update his balance
                            participant.tokenBalance = participant.tokenBalance.sub(returnTokenAmount);
                        }

                    });
                }


                // PROJECT WITHDRAW
                if(task === 1) {
                    it("Project: Withdraws ETH", async function () {
                        const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();

                        // withdraw everything the project can at that point in time
                        await ReversibleICO.methods.projectWithdraw(getAvailableProjectETH).send({
                            from: project.address,
                            gas: 1000000
                        });
                        project.weiBalance = project.weiBalance.add(new BN(getAvailableProjectETH));
                    });
                }

            }

            it("Jump to the next block: "+ blockNumber, async function () {
                // jump to the next block
                await ReversibleICO.methods.jumpToBlockNumber(blockNumber).send({
                    from: deployerAddress,
                    gas: 100000
                });
            });
        }

        console.log('Number of Participants: ', numberOfParticipants);
        // let balance = 0;

        it("rICO should be finished", async function () {
            const blockNumber = await ReversibleICO.methods.getCurrentBlockNumber().call();
            const buyPhaseEndBlock = await ReversibleICO.methods.buyPhaseEndBlock().call();
            expect(blockNumber).to.be.equal(buyPhaseEndBlock);
        });

        // it("rICO should have all committed ETH as balance", async function () {
        //     const committedEth = await ReversibleICO.methods.committedETH().call();
        //     const rICOEthbalance = await helpers.web3Instance.eth.getBalance(ReversibleICO.receipt.contractAddress);
        //     expect(committedEth).to.be.equal(rICOEthbalance);
        // });

        it("rICO balance - getAvailableProjectETH should be 0", async function () {
            const rICOEthbalance = await helpers.web3Instance.eth.getBalance(ReversibleICO.receipt.contractAddress);
            const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();
            expect(new BN(rICOEthbalance).sub(new BN(getAvailableProjectETH)).toString()).to.be.equal('0');
        });

        it("rICO rest balance should be no more or less than 0% off to what was ever committed ETH", async function () {
            const rICOEthbalance = await helpers.web3Instance.eth.getBalance(ReversibleICO.receipt.contractAddress);
            const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();
            const difference = new BN(rICOEthbalance).sub(new BN(getAvailableProjectETH));
            const committedETH = await ReversibleICO.methods.committedETH().call();
            console.log('difference', difference.mul(new BN(10000)).toString());
            console.log('committedETH', committedETH);
            console.log('result', difference.mul(new BN(10000)).div(new BN(committedETH)).toString());
            expect(difference.mul(new BN(10000)).div(new BN(committedETH)).toString() / 10000 * 100 + '%').to.be.equal('0%');
        });

        it("rICO balance should have all getAvailableProjectETH still", async function () {
            const rICOEthbalance = await helpers.web3Instance.eth.getBalance(ReversibleICO.receipt.contractAddress);
            const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();
            expect(rICOEthbalance).to.be.equal(getAvailableProjectETH);
        });

        it("Project balance + getAvailableProjectETH should be committedETH", async function () {
            const committedETH = await ReversibleICO.methods.committedETH().call();
            const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();
            expect(project.weiBalance.add(new BN(getAvailableProjectETH)).toString()).to.be.equal(committedETH);
        });

        it("Project should have all projectWithdrawnETH", async function () {
            const projectWithdrawnETH = await ReversibleICO.methods.projectWithdrawnETH().call();
            expect(project.weiBalance.toString()).to.be.equal(projectWithdrawnETH);
        });


        //1.071895458893164771
        //0.158799946098144033

        // go over every participant
        for (let i = 0; i < numberOfParticipants; i++) {
            let participant = participants[i];

            it(participant.address + ": compare full token balances", async function () {
                const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();
                expect(balance).to.be.equal(participant.tokenBalance.toString());

                console.log('Participant stats ', await ReversibleICO.methods.participants(participant.address).call());
                console.log('currentReservedTokenAmount ', await ReversibleICO.methods.currentReservedTokenAmount(participant.address).call());
                console.log('currentUnlockedTokenAmount ', await ReversibleICO.methods.currentUnlockedTokenAmount(participant.address).call());
            });
            it(participant.address + ": reserved token balance should be 0", async function () {
                const balance = await ReversibleICO.methods.currentReservedTokenAmount(participant.address).call();
                expect(balance).to.be.equal("0");
            });
            it(participant.address + ": unlocked token balance should be all bought tokens", async function () {
                const balance = await ReversibleICO.methods.currentUnlockedTokenAmount(participant.address).call();
                expect(balance).to.be.equal(participant.tokenBalance.toString());
            });
        }

    });

});