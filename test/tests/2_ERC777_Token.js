const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect;

const defaultOperators = []; // accounts[0] maybe
const data = web3.utils.sha3("OZ777TestData");
const operatorData = web3.utils.sha3("OZ777TestOperatorData");
const anyone = "0x0000000000000000000000000000000000000001";
const holder = accounts[10];
const newManager = accounts[9];

let _ricoAddress;

describe("ERC777 - RICO Token", async function () {
    before(async function () {
        // test requires ERC1820.instance
        if (helpers.ERC1820.instance == false) {
            console.log(
                "  Error: ERC1820.instance not found, please make sure to run it first."
            );
            process.exit();
        }
    });

    describe("Deployment", async function () {
        before(async function () {
            this.ReversibleICOMock777 = await helpers.utils.deployNewContractInstance(
                helpers,
                "ReversibleICOMock777",
                {
                    from: holder,
                    gas: 6500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );

            _ricoAddress = this.ReversibleICOMock777.receipt.contractAddress;

            this.RicoToken = await helpers.utils.deployNewContractInstance(
                helpers,
                "RicoToken",
                {
                    from: holder,
                    arguments: [setup.settings.token.supply.toString(), defaultOperators],
                    gas: 6500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );

            await this.RicoToken.methods
                .setup(_ricoAddress)
                .send({ from: holder, gas: 100000 });

            console.log(
                "      Gas used for deployment:",
                this.RicoToken.receipt.gasUsed
            );
            console.log(
                "      Contract Address:",
                this.RicoToken.receipt.contractAddress
            );
            console.log("");

            helpers.addresses.Token = this.RicoToken.receipt.contractAddress;
        });

        it("Gas usage should be lower than 6.7m.", function () {
            expect(this.RicoToken.receipt.gasUsed).to.be.below(6500000);
        });

        describe("basic information", function () {
            it("returns the name", async function () {
                expect(await this.RicoToken.methods.name().call()).to.equal(
                    setup.settings.token.name
                );
            });

            it("returns the symbol", async function () {
                expect(await this.RicoToken.methods.symbol().call()).to.equal(
                    setup.settings.token.symbol
                );
            });

            it("returns a granularity of 1", async function () {
                expect(await this.RicoToken.methods.granularity().call()).to.be.equal(
                    "1"
                );
            });

            it("returns the default operators", async function () {
                expect(
                    await this.RicoToken.methods.defaultOperators().call()
                ).to.deep.equal(defaultOperators);
            });

            it("default operators are operators for all accounts", async function () {
                for (const operator of defaultOperators) {
                    expect(
                        await this.RicoToken.methods.isOperatorFor(operator, anyone).call()
                    ).to.equal(true);
                }
            });

            it("returns the total supply", async function () {
                expect(await this.RicoToken.methods.totalSupply().call()).to.be.equal(
                    setup.settings.token.supply.toString()
                );
            });

            it("returns 18 when decimals is called", async function () {
                expect(await this.RicoToken.methods.decimals().call()).to.be.equal(
                    "18"
                );
            });

            it("returns the manager", async function () {
                expect(await this.RicoToken.methods.manager().call()).to.be.equal(
                    holder
                );
            });

            it("returns corrctly the frozen status", async function () {
                expect(await this.RicoToken.methods.frozen().call()).to.be.equal(
                    false
                );
            });

            it("the ERC777Token interface is registered in the registry", async function () {
                expect(
                    await helpers.ERC1820.instance.methods
                        .getInterfaceImplementer(
                            helpers.addresses.Token,
                            web3.utils.soliditySha3("ERC777Token")
                        )
                        .call()
                ).to.equal(helpers.addresses.Token);
            });

            it("the ERC20Token interface is registered in the registry", async function () {
                expect(
                    await helpers.ERC1820.instance.methods
                        .getInterfaceImplementer(
                            helpers.addresses.Token,
                            web3.utils.soliditySha3("ERC20Token")
                        )
                        .call()
                ).to.equal(helpers.addresses.Token);
            });
        });

        describe("Manager restricted functions", function () {
            context("Trasnfering to another manager", function () {
                it("fails if non-manager tries to transfer it", async function () {
                    await helpers.assertInvalidOpcode(async () => {
                        await this.RicoToken.methods
                            .changeManager(accounts[1])
                            .send({ from: accounts[1], gas: 100000 });
                    }, "onlyManager: Only manager can call this method");
                });
                it("Allows manager to transfer", async function () {
                    await this.RicoToken.methods
                        .changeManager(newManager)
                        .send({ from: holder, gas: 100000 });
                    expect(await this.RicoToken.methods.manager().call()).to.be.equal(
                        newManager
                    );
                });
            });
        });

        describe("balanceOf", function () {
            context("for an account with no tokens", function () {
                it("returns zero", async function () {
                    expect(
                        await this.RicoToken.methods.balanceOf(anyone).call()
                    ).to.be.equal("0");
                });
            });

            context("for an account with tokens", function () {
                it("returns their balance", async function () {
                    expect(
                        await this.RicoToken.methods.balanceOf(holder).call()
                    ).to.be.equal(setup.settings.token.supply.toString());
                });
            });

            context("for an account with locked tokens", function () {
                const lockedAmount = "10000000";

                it("returns their full balance when calling `balanceOf`", async function () {
                    expect(
                        await this.RicoToken.methods.balanceOf(holder).call()
                    ).to.be.equal(setup.settings.token.supply.toString());
                });

                it("returns their locked balance when calling `getLockedBalance` ", async function () {
                    await this.ReversibleICOMock777.methods
                        .setLockedTokenAmount(holder, lockedAmount)
                        .send({ from: holder, gas: 100000 });
                    expect(
                        await this.RicoToken.methods.getLockedBalance(holder).call()
                    ).to.be.equal(lockedAmount.toString());
                });
                it("returns their unlocked balance when calling `getUnlockedBalance` ", async function () {
                    await this.ReversibleICOMock777.methods
                        .setLockedTokenAmount(holder, lockedAmount)
                        .send({ from: accounts[0], gas: 100000 });
                    expect(
                        await this.RicoToken.methods.getUnlockedBalance(holder).call()
                    ).to.be.equal(
                        setup.settings.token.supply.sub(new BN(lockedAmount)).toString()
                    );
                });
            });
        }); //describe

        describe("freezing funcionality", function () {
            context("Should correctly set the frozen status", function () {
                it("to true", async function () {
                    await this.RicoToken.methods
                        .setFrozen(true)
                        .send({ from: newManager, gas: 100000 });
                    expect(await this.RicoToken.methods.frozen().call()).to.be.equal(
                        true
                    );
                });

                it("to false", async function () {
                    await this.RicoToken.methods
                        .setFrozen(false)
                        .send({ from: newManager, gas: 100000 });
                    expect(await this.RicoToken.methods.frozen().call()).to.be.equal(
                        false
                    );
                });

                it("Fails if non-manager calls freeze", async function () {
                    await helpers.assertInvalidOpcode(async () => {
                        await this.RicoToken.methods
                            .setFrozen(false)
                            .send({ from: accounts[3], gas: 100000 });
                    }, "onlyManager: Only manager can call this method");
                });
            });

            context("should block actions when frozen", function () {

                it("Blocks transfers", async function () {
                    await this.RicoToken.methods
                        .setFrozen(true)
                        .send({ from: newManager, gas: 100000 });

                    await helpers.assertInvalidOpcode(async () => {
                        await this.RicoToken.methods
                            .transfer(accounts[1], "1")
                            .send({ from: holder, gas: 1000000 });
                    }, "requireNotFrozen: Contract must not be frozen");
                });


                it("Blocks burns", async function () {
                    await this.RicoToken.methods
                        .setFrozen(true)
                        .send({ from: newManager, gas: 100000 });
                    await helpers.assertInvalidOpcode(async () => {
                        await this.RicoToken.methods.burn("1", "0x").send({ from: holder, gas: 100000 });
                    }, "revert");
                });

                it("Re-allows transfer when unfrozen", async function () {
                    await this.RicoToken.methods
                        .setFrozen(false)
                        .send({ from: newManager, gas: 100000 });
                    await this.RicoToken.methods
                        .transfer(accounts[5], 10000)
                        .send({ from: holder, gas: 100000});

                    const balance = await this.RicoToken.methods
                        .balanceOf(accounts[5])
                        .call();
                    assert.strictEqual(balance, "10000");
                });

            });
        }); //describe

        describe("Transfers with locked amount", () => {
            context(
                "It executes correctly for an account with locked tokens",
                async function () {
                    const lockedAmount = "100000000";
                    it("should transfer if amount is unlocked", async function () {
                        await this.ReversibleICOMock777.methods
                            .setLockedTokenAmount(holder, lockedAmount)
                            .send({ from: accounts[0], gas: 100000 });

                        await this.RicoToken.methods
                            .transfer(accounts[1], 10000)
                            .send({ from: holder, gas: 100000 });

                        const balance = await this.RicoToken.methods
                            .balanceOf(accounts[1])
                            .call();
                        assert.strictEqual(balance, "10000");
                    });

                    it("transfers: should fail when trying to transfer more than unlocked amount", async function () {
                        const balance = new helpers.BN(
                            await this.RicoToken.methods.balanceOf(holder).call()
                        );
                        const amt = balance.add(new helpers.BN("1"));

                        await this.ReversibleICOMock777.methods
                            .setLockedTokenAmount(holder, amt.toString())
                            .send({ from: accounts[0], gas: 100000 });

                        await helpers.assertInvalidOpcode(async () => {
                            await this.RicoToken.methods
                                .transfer(accounts[1], amt.toString())
                                .send({ from: holder, gas: 100000 });
                        }, "getUnlockedBalance: Insufficient funds");
                    });

                    it("should be able to transfer whole balance to RICO", async function () {

                        let locked = new BN("10000");
                        await this.RicoToken.methods
                            .transfer(accounts[0], locked.toString())
                            .send({ from: accounts[1], gas: 100000 });

                        // lock half
                        await this.ReversibleICOMock777.methods
                            .setLockedTokenAmount(
                                accounts[0],
                                locked.div(new BN("2")).toString()
                            )
                            .send({ from: accounts[0], gas: 100000 });

                        let balance = new BN(await this.RicoToken.methods.balanceOf(accounts[0]).call());

                        await this.RicoToken.methods
                            .transfer(
                                _ricoAddress,
                                balance.toString()
                            )
                            .send({ from: accounts[0], gas: 100000 });

                        balance = await this.RicoToken.methods
                            .balanceOf(accounts[0])
                            .call();
                        assert.strictEqual(balance, "0");
                    });

                    it("transfers: should fail when trying to transfer more than available RICO", async function () {

                        let locked = new BN("10000");

                        await this.ReversibleICOMock777.methods
                            .setLockedTokenAmount(holder, 0)
                            .send({ from: accounts[0] });

                        await this.RicoToken.methods
                            .transfer(accounts[0], locked.toString())
                            .send({ from: holder, gas: 100000 });

                        await this.ReversibleICOMock777.methods
                            .setLockedTokenAmount(holder, locked.toString())
                            .send({ from: accounts[0] });

                        let balance = new helpers.BN(await this.RicoToken.methods.balanceOf(accounts[0]).call());
                        const amt = balance.add(new helpers.BN("1"));

                        await helpers.assertInvalidOpcode(async () => {
                            await this.RicoToken.methods
                                .transfer(_ricoAddress, amt.toString())
                                .send({ from: accounts[0], gas: 100000 });
                        }, "getUnlockedBalance: Insufficient funds");
                    });
                }
            );
        });


        describe("Transfers to contracts and addresses", () => {
            const ERC777data = web3.utils.sha3('777TestData');
            let EmptyReceiver;
            before( async () => {
                EmptyReceiver = await helpers.utils.deployNewContractInstance(
                    helpers,
                    "EmptyReceiver",
                    {
                        from: holder,
                        gas: 6500000,
                        gasPrice: helpers.solidity.gwei * 10
                    }
                );
            })

            describe("receiver is a contract that does not implement ERC777TokensRecipient", async () => {
                it("ERC777 - send() reverts \"token recipient contract has no implementer for ERC777TokensRecipient\"", async function(){
                    await helpers.assertInvalidOpcode(async () => {
                        await this.RicoToken.methods
                            .send(EmptyReceiver.receipt.contractAddress, 1, ERC777data)
                            .send({ from: holder, gas: 100000 });
                    }, "ERC777: token recipient contract has no implementer for ERC777TokensRecipient");
                });

                it("ERC20 - transfer() works ", async function(){
                    await this.RicoToken.methods
                    .transfer(EmptyReceiver.receipt.contractAddress, 1)
                    .send({ from: holder, gas: 100000 });
                });
            });

            describe("receiver is an address", async () => {
                it("ERC777 - send() works", async function(){
                    await this.RicoToken.methods
                        .send(accounts[5], 1, ERC777data)
                        .send({ from: holder, gas: 100000 });
                });

                it("ERC20 - transfer() works", async function(){
                    await this.RicoToken.methods
                    .transfer(accounts[5], 1)
                    .send({ from: holder, gas: 100000 });
                });
            });
        });


        describe("Token _burn()", async () => {
            const ERC777data = web3.utils.sha3('777TestData');

            let amount = new BN("10000");
            let locked = amount.div( new BN(2) );

            it("works if amount is lower or equal to balance", async function() {

                await this.RicoToken.methods
                    .transfer(accounts[3], amount.toString())
                    .send({ from: holder, gas: 100000 });

                await this.ReversibleICOMock777.methods
                    .setLockedTokenAmount(accounts[3], locked.toString())
                    .send({ from: holder, gas: 100000 });

                await this.RicoToken.methods
                    .burn(1, ERC777data)
                    .send({ from: accounts[3], gas: 100000 });
            });

            it("throws if amount is not unlocked", async function() {
                await helpers.assertInvalidOpcode(async () => {
                    await this.RicoToken.methods
                        .burn(locked.add( new BN(1)).toString(), ERC777data)
                        .send({ from: accounts[3], gas: 100000 });
                }, "getUnlockedBalance: Insufficient funds");

            });
        });

        describe("Token coverage", async () => {

            it("_move() will throw if contract is not initialized", async function() {

                let testToken = await helpers.utils.deployNewContractInstance(
                    helpers,
                    "RicoToken",
                    {
                        from: holder,
                        arguments: [setup.settings.token.supply.toString(), defaultOperators],
                        gas: 6500000,
                        gasPrice: helpers.solidity.gwei * 10
                    }
                );

                await testToken.methods
                    .setFrozen(false)
                    .send({ from: holder, gas: 100000 });

                await helpers.assertInvalidOpcode(async () => {
                    await testToken.methods
                        .transfer(accounts[3], 1)
                        .send({ from: holder, gas:100000 });
                }, "Contract must be initialized.");

            });

            it("setup() will throw if called again", async function() {
                await helpers.assertInvalidOpcode(async () => {
                    await this.RicoToken.methods
                        .setup(_ricoAddress)
                        .send({ from: holder, gas: 100000 });
                }, "Contract is already initialized.");

            });
        });

    });
});
