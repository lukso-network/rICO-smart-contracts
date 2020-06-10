const {
    validatorHelper,
    clone
} = require('./includes/setup');

const {
    requiresERC1820Instance,
    doFreshDeployment,
    saveSnapshot,
    restoreFromSnapshot,
} = require('./includes/deployment');

const testKey = "RandomWithdrawTokenTests";
let minContribution, maxContribution = 0;

describe("ReversibleICO - Random Withdraw Token Balance", function () {

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
    customTestSettings.rico.startBlockDelay = 10; // current block + this = commitPhaseStart
    customTestSettings.rico.buyPhaseStartBlock = 40;
    customTestSettings.rico.buyPhaseEndBlock = 180;
    customTestSettings.rico.stageCount = 20;
    customTestSettings.rico.stageTokenLimitIncrease = "50000000000000000000000"; // 500k

    customTestSettings.rico.commitPhasePrice = "25000000000000"; // 0.025 ETH
    customTestSettings.rico.stagePriceIncrease = "1000000000000"; // 0.003333... ETH //3333333333333333

    let commitPhaseStartBlock = customTestSettings.rico.startBlockDelay;
    // let buyPhaseStartBlock = customTestSettings.rico.buyPhaseStartBlock;
    let buyPhaseEndBlock = customTestSettings.rico.buyPhaseEndBlock;


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


    function getRandomInt(max) {
        return Math.floor(Math.random() * Math.floor(max));
    }


    before(async function () {
        requiresERC1820Instance();
        await restoreFromSnapshot("ERC1820_ready");

        const contracts = await doFreshDeployment(testKey, 2, customTestSettings);
        ReversibleICO = contracts.ReversibleICOInstance;
        TokenContractInstance = contracts.TokenContractInstance;
        TokenContractAddress = TokenContractInstance.receipt.contractAddress;
        RICOContractAddress = ReversibleICO.receipt.contractAddress;

    });

    describe("randomly contribute and exit", async function () {

        before(async () => {
            // await revertToFreshDeployment();
            // helpers.utils.resetAccountNonceCache(helpers);

            await ReversibleICO.methods.jumpToBlockNumber(commitPhaseStartBlock).send({
                from: deployingAddress,
                gas: 200000
            });

        });

        it("rICO details", async function () {
            // freeze contract in the middle
            // for(let i = 0; i <= 20; i++) {
            //     let stage = await ReversibleICO.methods.stages(i).call();
            //     console.log(stage);
            // }
            participants.forEach(async (partici)=>{
                console.log(partici.address, await web3.eth.getBalance(partici.address), 'ETH');
            });

            // set minContribution
            minContribution = new BN(await ReversibleICO.methods.minContribution().call());
            maxContribution = new BN(await ReversibleICO.methods.maxContribution().call());
        });

        // iterate over all phases
        //commitPhaseStartBlock
        for (let blockNumber = commitPhaseStartBlock; blockNumber <= buyPhaseEndBlock+ 11  /*  add frozen period */; blockNumber++) {

            console.log('Current Block: ', blockNumber);

            if(blockNumber === 22) {
                it("Freeze contract at block "+ blockNumber, async function () {
                    // freeze contract in the middle
                    await ReversibleICO.methods.freeze().send({
                        from: projectAddress,
                        gas: 2000000
                    });
                });
            }

            if(blockNumber === 33) {
                it("Unfreeze contract at block "+ blockNumber, async function () {
                    // freeze contract in the middle
                    await ReversibleICO.methods.unfreeze().send({
                        from: projectAddress,
                        gas: 2000000
                    });
                });
            }

            // project increases the rICO holding
            if(blockNumber === 40) {
                it("Project added more token to the rICO at block "+ blockNumber, async function () {

                    console.log('rICO TOKENS before', await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call());

                    await TokenContractInstance.methods.transfer(ReversibleICOAddress, '85000000000000000000000000').send({
                        from: projectAddress
                    });

                    console.log('rICO TOKENS after', await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call());
                });
            }


            if(blockNumber < 22 || blockNumber > 33) {

                // if(blockNumber == 15) {
                //     it("Change stage 0 price in commit phase at block "+ blockNumber, async function () {
                //         // change stage price in the commit phase
                //         await ReversibleICO.methods.changeStage(0, '28000000000000', '500000000000000000000000').send({
                //             from: projectAddress,
                //             gas: 2000000
                //         });
                //     });
                // }

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

                    if(!participant.contrCount)
                        participant.contrCount = 0;
                    if(!participant.withdCount)
                        participant.withdCount = 0;

                    it(participant.address + ": unlocked + locked tokens should tokens balance", async function () {
                        const partici = await ReversibleICO.methods.participants(participant.address).call();
                        const getParticipantReservedTokens = await ReversibleICO.methods.getParticipantReservedTokens(participant.address).call();
                        const getParticipantUnlockedTokens = await ReversibleICO.methods.getParticipantUnlockedTokens(participant.address).call();
                        const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();

                        // console.log('-> Unlock percentage', new BN(getParticipantUnlockedTokens).div(new BN(partici.reservedTokens)).mul(new BN(100)).toString());

                        expect(new BN(getParticipantUnlockedTokens).add(new BN(getParticipantReservedTokens)).toString()).to.be.equal(balance);
                    });


                    // CONTRIBUTE
                    if(task === 1 && participant.contrCount <= 10) {

                        participant.contrCount++;


                        it(participant.address + ": Buy tokens", function (done) {


                            ( async function(){
                                let particip = await ReversibleICO.methods.participants(participant.address).call();

                                // WHITELIST
                                if (!particip.whitelisted && blockNumber >= 2) { // make some users not whitelist on their first contribution
                                    await ReversibleICO.methods.whitelist(
                                        [participant.address],
                                        true
                                    ).send({
                                        from: whitelistingAddress
                                    }).then((receipt) => {

                                        particip.whitelisted = true;

                                        console.log('---> Whitelisting: ', receipt.gasUsed + ' GAS');

                                    }).catch(done);
                                }

                                // calc random token amount
                                // user balance: 1000000 ETH?
                                const contribTokenAmount = new BN(getRandomInt(500000)); // 0-100 tokens //
                                const currentPrice = await ReversibleICO.methods.getCurrentPrice().call();

                                // console.log('BEFORE', particip.whitelisted && particip.contributions > 0, particip.reservedTokens);


                                // TEST that contributing without data works too
                                const data = (particip.whitelisted && particip.contributions > 2) ? '' : '0x3c7a3aff'; // commit()

                                if (contribTokenAmount.toString() > '0') {
                                    const ContributionAmount = new BN(currentPrice).mul(contribTokenAmount);


                                    // Require ito be above min contribution AND to be below max contribution
                                    if(
                                        ContributionAmount.lte(minContribution) ||
                                        new BN(particip.committedETH).add(ContributionAmount).gte(maxContribution)
                                    ) {
                                        done();
                                        return;
                                    }


                                    await helpers.web3Instance.eth.sendTransaction({
                                        from: participant.address,
                                        to: ReversibleICO.receipt.contractAddress,
                                        value: ContributionAmount.toString(),
                                        data: data, // commit()
                                        gasPrice: helpers.networkConfig.gasPrice
                                    }).then(async (receipt) => {
                                        // let particip = await ReversibleICO.methods.participants(participant.address).call();
                                        // console.log('AFTER', particip.whitelisted && particip.contributions > 0, particip.reservedTokens);


                                        let text = (particip.whitelisted) ? 'with auto accepting :': ':';

                                        console.log('---> Contribution '+ text, receipt.gasUsed + ' GAS');


                                        let tokensBought = new BN(0);
                                        receipt.logs.forEach((log, i) => {
                                            if (log.topics[0] === '0xb2164840ce0fc0bd8bb63f912be03052e55ed2918270ca7f3a3d1b28b6df7611') { // event ContributionsAccepted(address indexed participantAddress, uint256 indexed ethAmount, uint256 indexed tokenAmount, uint8 stageId);
                                                let token = new BN(log.topics[3].replace('0x', ''), 16);
                                                let stg = new BN(log.data.replace('0x', ''), 16).toString();
                                                console.log('Token bought in stage '+ stg, token.toString());
                                                tokensBought = tokensBought.add(token);
                                            }
                                        });
                                        console.log('Tokens bought ', tokensBought.toString());

                                        // update his balance
                                        participant.tokenBalance = participant.tokenBalance.add(tokensBought);
                                        // participant.tokenBalance = participant.tokenBalance.add(contribTokenAmount.mul(new BN('1000000000000000000')));
                                        participant.pricesPaid.push(new BN(currentPrice)); // TODO incorrect right now, would need to check stages



                                        done();
                                    }, (error) => {
                                        console.log('Error', error);
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
                    if(task === 2 && participant.contrCount > 5 && blockNumber > 40) {

                        participant.withdCount++;

                        it(participant.address + ": Return tokens", function (done) {

                            ( async function(){

                                const maxTokens = await ReversibleICO.methods.getParticipantReservedTokens(participant.address).call();
                                // const maxTokens = await TokenContractInstance.methods.balanceOf(participant.address).call();

                                // calc random token amount
                                const returnTokenAmount = new BN(maxTokens);//new BN(String(getRandomInt(new BN(maxTokens).toString())));//getRandomInt(maxTokens))); // 0-max reserved tokens

                                if(returnTokenAmount.toString() > '0') {

                                    await TokenContractInstance.methods.transfer(ReversibleICO.receipt.contractAddress, returnTokenAmount.toString()).send({from: participant.address, gas: 2000000})
                                        .then(async (receipt) => {

                                            // console.log('returnTokenAmount', returnTokenAmount.toString());
                                            // const DEBUG1 = await ReversibleICO.methods.DEBUG1().call();
                                            // const DEBUG2 = await ReversibleICO.methods.DEBUG2().call();
                                            // console.log('DEBUG1', DEBUG1);
                                            // console.log('DEBUG2', DEBUG2);
                                            // expect(DEBUG1).to.be.equal(DEBUG2);
                                            //
                                            // const DEBUG3 = await ReversibleICO.methods.DEBUG3().call();
                                            // const DEBUG4 = await ReversibleICO.methods.DEBUG4().call();
                                            // console.log('DEBUG1', DEBUG3);
                                            // console.log('DEBUG2', DEBUG3);
                                            // expect(DEBUG3).to.be.equal(DEBUG4);

                                            // console.log('DEBUG3', await ReversibleICO.methods.DEBUG3().call());
                                            // console.log('DEBUG4', await ReversibleICO.methods.DEBUG4().call());

                                            console.log('---> Withdraw: ', receipt.gasUsed + ' GAS');


                                            // update his balance
                                            participant.tokenBalance = participant.tokenBalance.sub(returnTokenAmount);

                                            if(receipt.events['0']) {
                                                let pow18 = new BN(10).pow(new BN(18));

                                                // console.log('RET TOKEN', returnTokenAmount.toString());
                                                console.log('TOKEN RETURNED', new BN(receipt.events[0].raw.topics[3].replace('0x',''), 16).toString());

                                                participant.pricesAtWithdraw.push( // TODO incorrect? As transfer events are coming from token contract, not rICO
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
                        it(project.address +" Project: Withdraws ETH", function (done) {

                            ( async function(){
                                const getAvailableProjectETH = await ReversibleICO.methods.getAvailableProjectETH().call();

                                // withdraw everything the project can at that point in time
                                await ReversibleICO.methods.projectWithdraw(getAvailableProjectETH).send({
                                    from: project.address,
                                    gas: 2000000
                                }).then((receipt) => {

                                    console.log('---> Project withdraw: ', receipt.gasUsed + ' GAS');


                                    project.weiBalance = project.weiBalance.add(new BN(getAvailableProjectETH));

                                    done();
                                }, (error) => {
                                    helpers.utils.resetAccountNonceCache(helpers);
                                    done(error);
                                });
                            })();
                        });
                    }
                }
            }

            it("Jump to the next block: "+ blockNumber, async function () {

                console.log('Blocknumber', blockNumber);

                // jump to the next block
                await ReversibleICO.methods.jumpToBlockNumber(blockNumber).send({
                    from: deployingAddress,
                    gas: 200000
                });

                const stage = await ReversibleICO.methods.getCurrentStage().call();
                const price = await ReversibleICO.methods.getCurrentPrice().call();

                console.log('Stage: '+ stage + ', Price: '+ price);
            });
        }

        console.log('Number of Participants: ', numberOfParticipants);

        it("rICO should be finished", async function () {
            const blockNumber = await ReversibleICO.methods.getCurrentEffectiveBlockNumber().call();
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

            // it(participant.address + ": compare full token balances", async function () {
            //     console.log('rICO TOKENS end balance', await TokenContractInstance.methods.balanceOf(ReversibleICOAddress).call());
            //
            //     const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();
            //     expect(balance).to.be.equal(participant.tokenBalance.toString());
            //
            // });
            // it(participant.address + ": unlocked token balance should be all bought tokens", async function () {
            //     const getParticipantUnlockedTokens = await ReversibleICO.methods.getParticipantUnlockedTokens(participant.address).call();
            //     // const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();
            //     expect(getParticipantUnlockedTokens).to.be.equal(participant.tokenBalance.toString());
            // });
            it(participant.address + ": unlocked token balance should be all bought tokens", async function () {
                const getParticipantUnlockedTokens = await ReversibleICO.methods.getParticipantUnlockedTokens(participant.address).call();
                const balance = await TokenContractInstance.methods.balanceOf(participant.address).call();
                expect(getParticipantUnlockedTokens).to.be.equal(balance);
            });

            it(participant.address + ": reserved token balance should be 0", async function () {
                const getParticipantReservedTokens = await ReversibleICO.methods.getParticipantReservedTokens(participant.address).call();
                expect(getParticipantReservedTokens).to.be.equal("0");
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


                console.log('Participant Stats: '+ participant.address, await ReversibleICO.methods.participants(participant.address).call());

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