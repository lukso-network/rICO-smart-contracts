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

    const deployingAddress = accounts[0];
    const whitelistingAddress = accounts[1];
    let TokenContractAddress, RICOContractAddress;
    let TokenContractInstance;
    let ReversibleICO;
    // generate n participants
    let numberOfParticipants = 4;
    let participants = [];

    const customTestSettings = clone(setup.settings);
    // custom settings for this test
    customTestSettings.rico.startBlockDelay = 11;
    customTestSettings.rico.blocksPerDay = 3;
    customTestSettings.rico.commitPhaseDays = 2;
    customTestSettings.rico.stageDays = 2;
    customTestSettings.rico.stageCount = 10;

    customTestSettings.rico.commitPhasePrice = "25000000000000000"; // 0.025 ETH
    customTestSettings.rico.stagePriceIncrease = "3333333333333333"; // 0.003333... ETH

    let commitPhaseStartBlock = customTestSettings.rico.startBlockDelay;
    let commitPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.commitPhaseDays;
    let buyPhaseStartBlock = commitPhaseStartBlock + commitPhaseBlockCount + 1;
    let buyPhaseBlockCount = customTestSettings.rico.blocksPerDay * customTestSettings.rico.stageDays * customTestSettings.rico.stageCount;
    let buyPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount + buyPhaseBlockCount;


    let project = {
        address: projectAddress,
        weiBalance: new BN(0)
    };

    // add accounts
    for(let i = 0; i < numberOfParticipants; i++){
        participants[i] = {
            address: accounts[i+5],
            pricesPaid: [],
            pricesAtWithdraw: [],
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


        const currentBlock = await helpers.utils.jumpToContractStage(ReversibleICO, deployingAddress, 0);
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


        // const currentBlock = await helpers.utils.jumpToContractStage(ReversibleICO, deployingAddress, 0);
        this.jsValidator = new validatorHelper(customTestSettings, parseInt( currentBlock, 10));

    });

    describe("randomly contribute and exit", async function () {

        before(async () => {
            await revertToFreshDeployment();
            // helpers.utils.resetAccountNonceCache(helpers);

            await ReversibleICO.methods.jumpToBlockNumber(commitPhaseStartBlock).send({
                from: deployingAddress,
                gas: 100000
            });

        });

        // iterate over all phases
        //commitPhaseStartBlock
        for (let blockNumber = commitPhaseStartBlock; blockNumber < buyPhaseEndBlock; blockNumber++) {

            console.log('Current Block: ', blockNumber);

            // go over every participant
            for (let i = 0; i < numberOfParticipants; i++) {
                let participant = participants[i];

                // we have 10, so that in 70% there is no actions, as only 3 numbers represent actions
                let task = getRandomInt(10);

                let taskName = '';
                if(task === 1)
                    taskName = 'CONTRIBUTE';
                if(task === 2)
                    taskName = 'WITHDRAW';
                if(task === 3)
                    taskName = 'PROJECT WITHDRAW';

                console.log(participant.address +' Task: ' + taskName + ' '+ task);

                // if(!participants[i].contrCount)
                //     participants[i].contrCount = 0;
                // if(!participants[i].withdCount)
                //     participants[i].withdCount = 0;

                // CONTRIBUTE
                if(task === 1) {// && participants[i].contrCount <= 3) {

                    // participants[i].contrCount++;


                    it(participant.address + ": Buy tokens", function (done) {


                        ( async function(){
                            // WHITELIST
                            let isWhitelisted = await ReversibleICO.methods.isWhitelisted(participant.address).call();

                            if (!isWhitelisted) {
                                await ReversibleICO.methods.whitelist(
                                    [participant.address],
                                    true
                                ).send({
                                    from: whitelistingAddress
                                });
                            }

                            // calc random token amount
                            // user balance: 1000000 ETH?
                            const contribTokenAmount = new BN(getRandomInt(100)); // 0-100 tokens //
                            const stageId = await ReversibleICO.methods.getCurrentStage().call();
                            const currentPrice = await ReversibleICO.methods.getCurrentPrice().call();

                            if (contribTokenAmount.toString() > '0') {
                                const ContributionAmount = priceInStage(stageId).mul(contribTokenAmount);
                                await helpers.web3Instance.eth.sendTransaction({
                                    from: participant.address,
                                    to: ReversibleICO.receipt.contractAddress,
                                    value: ContributionAmount.toString(),
                                    data: '0x3c7a3aff', // commit()
                                    gasPrice: helpers.networkConfig.gasPrice
                                }).then(() => {

                                    // update his balance
                                    participant.pricesPaid.push(new BN(currentPrice));
                                    participant.tokenBalance = participant.tokenBalance.add(contribTokenAmount.mul(new BN('1000000000000000000')));

                                    done();
                                }, (error) => {
                                    helpers.utils.resetAccountNonceCache(helpers);
                                    done(error);
                                });

                            } else {
                                done();
                            }
                        })();
                    });
                }
                // WITHDRAW
                if(task === 2) {// && participants[i].withdCount <= 3) {

                    // participants[i].withdCount++;


                    it(participant.address + ": Return tokens", function (done) {


                        ( async function(){
                            const maxTokens = await ReversibleICO.methods.currentReservedTokenAmount(participant.address).call();
                            // const maxTokens = await TokenContractInstance.methods.balanceOf(participant.address).call();

                            // calc random token amount
                            const returnTokenAmount = new BN(String(getRandomInt(maxTokens)));//getRandomInt(maxTokens))); // 0-max reserved tokens

                            if(returnTokenAmount.toString() > '0') {

                                await TokenContractInstance.methods.transfer(ReversibleICO.receipt.contractAddress, returnTokenAmount.toString()).send({from: participant.address, gas: 1000000})
                                    .then(async (receipt) => {

                                        // console.log('returnTokenAmount', returnTokenAmount.toString());
                                        // console.log('DEBUG1', await ReversibleICO.methods.DEBUG1().call());
                                        // console.log('DEBUG2', await ReversibleICO.methods.DEBUG2().call());
                                        // console.log('DEBUG3', await ReversibleICO.methods.DEBUG3().call());
                                        // console.log('DEBUG4', await ReversibleICO.methods.DEBUG4().call());


                                        // update his balance
                                        participant.tokenBalance = participant.tokenBalance.sub(returnTokenAmount);

                                        if(receipt.events['0']) {
                                            let pow18 = new BN(10).pow(new BN(18));

                                            // console.log('RET TOKEN', returnTokenAmount.toString());
                                            // console.log('ETH RETURNED', new BN(receipt.events[0].raw.topics[3].replace('0x',''), 16).toString());

                                            participant.pricesAtWithdraw.push(
                                                new BN(receipt.events[0].raw.topics[3].replace('0x',''), 16).mul(pow18)
                                                    .div(returnTokenAmount)
                                                    // .mul(new BN('1000000000000000000')) // * 1 ETH
                                            );
                                        }

                                        done();
                                    }, (error) => {
                                        helpers.utils.resetAccountNonceCache(helpers);
                                        done(error);
                                    });

                            } else {
                                done();
                            }
                        })();

                    });
                }


                // PROJECT WITHDRAW
                if(task === 3) {
                    it(project.address +" Project: Withdraws ETH", async function () {
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
                    from: deployingAddress,
                    gas: 100000
                });

                const stage = await ReversibleICO.methods.getCurrentStage().call();
                const price = await ReversibleICO.methods.getCurrentPrice().call();

                console.log('Stage: '+ stage + ', Price: '+ price);
            });
        }

        console.log('Number of Participants: ', numberOfParticipants);

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
            // console.log('difference', difference.mul(new BN(10000)).toString());
            // console.log('committedETH', committedETH);
            // console.log('result', difference.mul(new BN(10000)).div(new BN(committedETH)).toString());
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


        // go over every participant
        for (let i = 0; i < numberOfParticipants; i++) {
            let participant = participants[i];

            it(participant.address + ": compare full token balances", async function () {
                const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();
                expect(balance).to.be.equal(participant.tokenBalance.toString());
            });
            it(participant.address + ": reserved token balance should be 0", async function () {
                const currentReservedTokenAmount = await ReversibleICO.methods.currentReservedTokenAmount(participant.address).call();
                expect(currentReservedTokenAmount).to.be.equal("0");
            });
            it(participant.address + ": unlocked token balance should be all bought tokens", async function () {
                const currentUnlockedTokenAmount = await ReversibleICO.methods.currentUnlockedTokenAmount(participant.address).call();
                expect(currentUnlockedTokenAmount).to.be.equal(participant.tokenBalance.toString());
            });

            it(participant.address + ": compare price average, should be 0", async function () {

                let pricesPaidSum = new BN(0);
                participant.pricesPaid.forEach((price, i) => {
                    // console.log('Compare paid '+i, price.toString());
                    pricesPaidSum = pricesPaidSum.add(price);
                });

                let pricesWithdrawnSum = new BN(0);
                participant.pricesAtWithdraw.forEach((price, i) => {
                    // console.log('Compare withdraw '+i, price.toString());
                    pricesWithdrawnSum = pricesWithdrawnSum.add(price);
                });


                console.log('Participant Stats ', await ReversibleICO.methods.participants(participant.address).call());

                console.log('-------');
                if(participant.pricesPaid.length)
                    console.log('Compare prices paid ', pricesPaidSum.div(new BN(participant.pricesPaid.length)).toString());

                if(participant.pricesAtWithdraw.length)
                    console.log('Compare prices withdraw ', pricesWithdrawnSum.div(new BN(participant.pricesAtWithdraw.length)).toString());

                // if(participant.pricesAtWithdraw.length && participant.pricesPaid.length)
                //     let difference = pricesWithdrawnSum.div(new BN(participant.pricesAtWithdraw.length)).sub(pricesPaidSum.div(new BN(participant.pricesPaid.length)));

                // expect(difference.mul(new BN(10000)).div(pricesPaidSum.div(new BN(participant.pricesPaid.length))).toString() / 10000 * 100 + '%').to.be.equal('0%');

            });
        }
    });

});