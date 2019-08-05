const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const initialSupply = 100000000; // 100 mil
const defaultOperators = []; // accounts[0] maybe

const name = 'RicoToken';
const symbol = 'RICO';
const data = web3.utils.sha3('OZ777TestData');
const operatorData = web3.utils.sha3('OZ777TestOperatorData');
const anyone = '0x0000000000000000000000000000000000000001';
const holder = accounts[10];

describe("ERC777 - RICO Token", function () {

    before(async function () {
        // test requires ERC1820.instance
        if (helpers.ERC1820.instance == false) {
            console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
            process.exit();
        }
    });

    describe("Deployment", function () {

        before(async function () {

            this.RicoToken = await helpers.utils.deployNewContractInstance(
                helpers, "RicoToken", {
                    from: holder,
                    arguments: [initialSupply, defaultOperators],
                    gas: 3500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );
            console.log("      Gas used for deployment:", this.RicoToken.receipt.gasUsed);
            console.log("      Contract Address:", this.RicoToken.receipt.contractAddress);
            console.log("");

            helpers.addresses.Token = this.RicoToken.receipt.contractAddress;
        });

        it("Gas usage should be lower than 3.5m.", function () {
            expect(this.RicoToken.receipt.gasUsed).to.be.below(3500000);
        });

        describe('basic information', function () {
            it('returns the name', async function () {
                expect(await this.RicoToken.methods.name().call() ).to.equal(name);
            });

            it('returns the symbol', async function () {
                expect(await this.RicoToken.methods.symbol().call()).to.equal(symbol);
            });

            it('returns a granularity of 1', async function () {
                expect(await this.RicoToken.methods.granularity().call()).to.be.equal('1');
            });

            it('returns the default operators', async function () {
                expect(await this.RicoToken.methods.defaultOperators().call()).to.deep.equal(defaultOperators);
            });

            it('default operators are operators for all accounts', async function () {
                for (const operator of defaultOperators) {
                    expect(await this.RicoToken.methods.isOperatorFor(operator, anyone).call()).to.equal(true);
                }
            });

            it('returns the total supply', async function () {
                expect(await this.RicoToken.methods.totalSupply().call()).to.be.equal(initialSupply.toString());
            });

            it('returns 18 when decimals is called', async function () {
                expect(await this.RicoToken.methods.decimals().call()).to.be.equal('18');
            });

            it('the ERC777Token interface is registered in the registry', async function () {
                expect(
                    await helpers.ERC1820.instance.methods.getInterfaceImplementer(
                        helpers.addresses.Token, web3.utils.soliditySha3('ERC777Token')
                    ).call()
                ).to.equal(helpers.addresses.Token);
            });

            it('the ERC20Token interface is registered in the registry', async function () {
                expect(
                    await helpers.ERC1820.instance.methods.getInterfaceImplementer(
                        helpers.addresses.Token, web3.utils.soliditySha3('ERC20Token')
                    ).call()
                ).to.equal(helpers.addresses.Token);
            });
        });

        describe('balanceOf', function () {
            context('for an account with no tokens', function () {
                it('returns zero', async function () {
                    expect(
                        await this.RicoToken.methods.balanceOf(anyone).call()
                    ).to.be.equal('0');
                });
            });

            context('for an account with tokens', function () {
                it('returns their balance', async function () {
                    expect(
                        await this.RicoToken.methods.balanceOf(holder).call()
                    ).to.be.equal(initialSupply.toString());
                });
            });
        });

    });

});